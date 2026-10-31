import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { hashPassword } from "@/lib/password";
import { attachSession } from "@/lib/session";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { name, email, password, turnstileToken } = await req.json().catch(() => ({}));

  const rl = rateLimit(`signup:ip:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { message: "Too many attempts. Try again shortly.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // CAPTCHA (no-op until Turnstile keys are configured).
  const human = await verifyTurnstile(turnstileToken, ip);
  if (!human) {
    return NextResponse.json({ message: "Verification failed" }, { status: 403 });
  }

  const cleanEmail = String(email || "").toLowerCase().trim();
  if (!EMAIL_RE.test(cleanEmail)) {
    return NextResponse.json({ message: "Enter a valid email" }, { status: 400 });
  }
  if (!password || String(password).length < 6) {
    return NextResponse.json(
      { message: "Password must be at least 6 characters" },
      { status: 400 },
    );
  }

  await connectDb();
  const existing = await User.findOne({ email: cleanEmail });

  if (existing) {
    // SECURITY: never set a password or issue a session for an *existing*
    // account from the public signup endpoint. Doing so previously let anyone
    // take over a Google-only account (no passwordHash) by "signing up" with
    // its email. A Google user who wants a password sets one while signed in,
    // via Account settings. So always reject an existing email here.
    const message = existing.passwordHash
      ? "An account with this email already exists. Please sign in."
      : "This email is already registered with Google. Sign in with Google, then set a password from Account settings.";
    return NextResponse.json({ message }, { status: 409 });
  }

  const user = await User.create({
    name: name || "",
    email: cleanEmail,
    passwordHash: hashPassword(password),
    provider: "password",
  });

  return attachSession(NextResponse.json({ ok: true }), {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    sessionEpoch: user.sessionEpoch || 0,
  });
}
