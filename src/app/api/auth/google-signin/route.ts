import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { attachSession } from "@/lib/session";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";

const VALID_ISS = ["accounts.google.com", "https://accounts.google.com"];

// Verifies the Google Identity Services credential (an ID token) in-page,
// then upserts the user and issues our own session — no redirect involved.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`google-signin:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { message: "Too many attempts. Try again shortly.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // SECURITY: without a configured client id we cannot verify the token's
  // audience, so we must NEVER accept any token.
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { message: "Google sign-in is not configured" },
      { status: 500 },
    );
  }

  const { credential } = await req.json().catch(() => ({}));
  if (!credential) {
    return NextResponse.json({ message: "Missing credential" }, { status: 400 });
  }

  // Validate the token with Google's tokeninfo endpoint.
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!resp.ok) {
    return NextResponse.json({ message: "Invalid Google token" }, { status: 401 });
  }

  const data = (await resp.json()) as {
    aud?: string;
    iss?: string;
    exp?: string | number;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
  };

  // Audience must match our client id.
  if (data.aud !== clientId) {
    return NextResponse.json({ message: "Token audience mismatch" }, { status: 401 });
  }
  // Issuer must be Google.
  if (!data.iss || !VALID_ISS.includes(data.iss)) {
    return NextResponse.json({ message: "Invalid token issuer" }, { status: 401 });
  }
  // Token must not be expired.
  const exp = Number(data.exp);
  if (!exp || exp * 1000 <= Date.now()) {
    return NextResponse.json({ message: "Token expired" }, { status: 401 });
  }
  const verified = data.email_verified === true || data.email_verified === "true";
  const email = (data.email || "").toLowerCase().trim();
  if (!verified || !email) {
    return NextResponse.json({ message: "Email not verified" }, { status: 401 });
  }

  const name =
    data.name ||
    [data.given_name, data.family_name].filter(Boolean).join(" ").trim();

  await connectDb();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, name, provider: "google" });
  } else if (user.provider === "password") {
    user.provider = "both";
    if (name && !user.name) user.name = name;
    await user.save();
  }

  return attachSession(NextResponse.json({ ok: true }), {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    sessionEpoch: user.sessionEpoch || 0,
  });
}
