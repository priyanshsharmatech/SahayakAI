import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { email, turnstileToken } = await req.json().catch(() => ({}));
  const cleanEmail = String(email || "").toLowerCase().trim();

  // Always respond the same way so we don't leak which emails exist.
  const genericOk = NextResponse.json({
    ok: true,
    message: "If an account exists, a reset link has been sent.",
  });

  for (const key of [`forgot:ip:${ip}`, `forgot:email:${cleanEmail}`]) {
    const rl = rateLimit(key, 5, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { message: "Too many attempts. Try again shortly.", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
  }

  // CAPTCHA (no-op until Turnstile keys are configured).
  const human = await verifyTurnstile(turnstileToken, ip);
  if (!human) {
    return NextResponse.json({ message: "Verification failed" }, { status: 403 });
  }

  if (!cleanEmail) return genericOk;

  await connectDb();
  const user = await User.findOne({ email: cleanEmail });

  // Do the token-generation + save + email work WITHOUT awaiting it, so the
  // response returns in the same time whether or not the account exists. (If we
  // awaited, an existing email would be measurably slower → user enumeration.)
  if (user) {
    void (async () => {
      try {
        const rawToken = crypto.randomBytes(32).toString("hex");
        user.resetTokenHash = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");
        user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();
        const link = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(
          cleanEmail,
        )}`;
        await sendPasswordResetEmail(cleanEmail, link);
      } catch (error) {
        console.error("Failed to send reset email:", error);
      }
    })();
  }

  return genericOk;
}
