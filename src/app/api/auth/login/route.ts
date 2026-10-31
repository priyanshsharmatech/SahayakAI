import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { verifyPassword, hashPassword } from "@/lib/password";
import { attachSession } from "@/lib/session";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";

// A real scrypt hash used to burn equivalent CPU time when the account doesn't
// exist (or has no password), so response timing doesn't reveal which emails
// are registered. Computed once at module load.
const DUMMY_HASH = hashPassword("sahayak-login-timing-equalizer");

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json(
      { message: "Email and password are required" },
      { status: 400 },
    );
  }

  const cleanEmail = String(email).toLowerCase().trim();
  for (const key of [`login:ip:${ip}`, `login:email:${cleanEmail}`]) {
    const rl = rateLimit(key, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { message: "Too many attempts. Try again shortly.", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
  }

  await connectDb();
  const user = await User.findOne({ email: cleanEmail });

  // Always run a scrypt verify (against the user's hash, or a dummy) so the
  // response time is the same whether or not the email exists / has a password.
  const ok = verifyPassword(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) {
    return NextResponse.json(
      { message: "Invalid email or password" },
      { status: 401 },
    );
  }

  return attachSession(NextResponse.json({ ok: true }), {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    sessionEpoch: user.sessionEpoch || 0,
  });
}
