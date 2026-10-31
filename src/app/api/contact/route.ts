import { sendContactEmail } from "@/lib/mailer";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { captureError } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public contact-form endpoint. Validates server-side (never trust the client)
 * and emails the submission to the site inbox (CONTACT_EMAIL, falling back to
 * the SMTP account). Returns field-level errors so the form can surface them.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`contact:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { message: "Too many messages. Please try again shortly.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  // Field-level validation mirrored on the client.
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Please enter your name (at least 2 characters).";
  else if (name.length > 100) errors.name = "Name is too long.";

  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(email) || email.length > 200)
    errors.email = "Enter a valid email address.";

  if (subject.length > 150) errors.subject = "Subject is too long.";

  if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  else if (message.length > 5000) errors.message = "Message is too long (5000 chars max).";

  if (Object.keys(errors).length) {
    return NextResponse.json({ message: "Please fix the errors below.", errors }, { status: 400 });
  }

  const to = process.env.CONTACT_EMAIL || process.env.SMTP_USER;
  if (!to) {
    return NextResponse.json(
      { message: "Contact form isn't configured yet. Please email us directly." },
      { status: 503 },
    );
  }

  try {
    const sent = await sendContactEmail(to, { name, email, subject, message });
    if (!sent) {
      return NextResponse.json(
        { message: "Messaging isn't available right now. Please try again later." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    captureError(e, { route: "contact" });
    return NextResponse.json(
      { message: "Couldn't send your message. Please try again." },
      { status: 500 },
    );
  }
}
