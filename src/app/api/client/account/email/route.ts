import connectDb from "@/lib/db";
import User from "@/model/user.model";
import Settings from "@/model/settings.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import { verifyPassword } from "@/lib/password";
import { captureError } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change the current user's account email.
 * POST { email, password }
 *
 * NOTE: the session cookie still carries the old email until the user signs in
 * again; it is only used for display, so this is harmless.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { message: "A valid email is required" },
      { status: 400 },
    );
  }

  await connectDb();
  const dbUser = await User.findById(user.id);
  if (!dbUser) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Require the password to confirm the account owner (unless the account has no
  // password — a google-only user — in which case we allow the session alone).
  if (dbUser.passwordHash && !verifyPassword(password, dbUser.passwordHash)) {
    return NextResponse.json(
      { message: "Password is incorrect" },
      { status: 400 },
    );
  }

  // Reject if another user already owns that email (case-insensitive).
  const existing = await User.findOne({
    email,
    _id: { $ne: dbUser._id },
  })
    .select("_id")
    .lean();
  if (existing) {
    return NextResponse.json(
      { message: "A user with that email already exists" },
      { status: 409 },
    );
  }

  dbUser.email = email;
  await dbUser.save();

  // Keep the owner's Settings.email in sync — the admin client list reads it to
  // identify workspaces. Best-effort: a failure here must not fail the change.
  try {
    const ownerId = await getEffectiveOwnerId(user);
    await Settings.updateOne({ ownerId }, { email });
  } catch (error) {
    captureError(error, { route: "client/account/email" });
  }

  return NextResponse.json({ ok: true, email });
}
