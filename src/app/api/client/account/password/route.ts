import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser, attachSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { NextRequest, NextResponse } from "next/server";

/**
 * Change (or set) the current user's password.
 * POST { currentPassword, newPassword }
 *
 * Bumps `sessionEpoch` to revoke all OTHER existing sessions, then re-issues a
 * fresh cookie for THIS device so the caller stays logged in.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 6 || newPassword.length > 128) {
    return NextResponse.json(
      { message: "New password must be 6–128 characters" },
      { status: 400 },
    );
  }

  await connectDb();
  const dbUser = await User.findById(user.id);
  if (!dbUser) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Google-only users without a password may set one for the first time; users
  // who already have a password must prove they know the current one.
  if (dbUser.passwordHash) {
    if (!verifyPassword(currentPassword, dbUser.passwordHash)) {
      return NextResponse.json(
        { message: "Current password is incorrect" },
        { status: 400 },
      );
    }
  }

  dbUser.passwordHash = hashPassword(newPassword);
  // A google-only account that just gained a password can now use either method.
  if (dbUser.provider === "google") {
    dbUser.provider = "both";
  }
  dbUser.sessionEpoch = (dbUser.sessionEpoch || 0) + 1;
  await dbUser.save();

  // Re-issue this device's session with the new epoch so it isn't revoked.
  return attachSession(NextResponse.json({ ok: true }), {
    id: dbUser._id.toString(),
    email: dbUser.email,
    name: dbUser.name,
    sessionEpoch: dbUser.sessionEpoch,
  });
}
