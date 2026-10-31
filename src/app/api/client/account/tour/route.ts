import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser } from "@/lib/session";
import { NextResponse } from "next/server";

/**
 * Mark the first-run dashboard tour as seen for the current user, so it never
 * replays on later logins or other devices. Idempotent.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  await User.updateOne({ _id: user.id }, { $set: { tourSeen: true } });
  return NextResponse.json({ ok: true });
}
