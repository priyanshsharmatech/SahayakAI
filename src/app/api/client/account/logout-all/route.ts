import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser, attachSession } from "@/lib/session";
import { NextResponse } from "next/server";

/**
 * "Log out of all devices." Bumps the user's sessionEpoch (invalidating every
 * existing token) and re-issues a fresh cookie for THIS device, so the caller
 * stays signed in while all other sessions are revoked.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await connectDb();
  const dbUser = await User.findById(user.id);
  if (!dbUser) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  dbUser.sessionEpoch = (dbUser.sessionEpoch || 0) + 1;
  await dbUser.save();

  return attachSession(NextResponse.json({ ok: true }), {
    id: dbUser._id.toString(),
    email: dbUser.email,
    name: dbUser.name,
    sessionEpoch: dbUser.sessionEpoch,
  });
}
