import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { hashPassword } from "@/lib/password";
import { attachSession } from "@/lib/session";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, token, password } = await req.json().catch(() => ({}));
  const cleanEmail = String(email || "").toLowerCase().trim();

  if (!cleanEmail || !token) {
    return NextResponse.json({ message: "Invalid reset link" }, { status: 400 });
  }
  if (!password || String(password).length < 6) {
    return NextResponse.json(
      { message: "Password must be at least 6 characters" },
      { status: 400 },
    );
  }

  await connectDb();
  const user = await User.findOne({ email: cleanEmail });

  const tokenHash = crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");

  const valid =
    user &&
    user.resetTokenHash &&
    user.resetTokenExpiry &&
    user.resetTokenHash === tokenHash &&
    user.resetTokenExpiry.getTime() > Date.now();

  if (!valid) {
    return NextResponse.json(
      { message: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  user.passwordHash = hashPassword(password);
  user.provider = user.provider === "google" ? "both" : user.provider;
  user.resetTokenHash = undefined;
  user.resetTokenExpiry = undefined;
  // Revoke every existing session on a password reset, then issue a fresh one.
  user.sessionEpoch = (user.sessionEpoch || 0) + 1;
  await user.save();

  // Log them straight in with the new epoch.
  return attachSession(NextResponse.json({ ok: true }), {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    sessionEpoch: user.sessionEpoch,
  });
}
