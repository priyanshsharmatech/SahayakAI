import connectDb from "@/lib/db";
import Settings from "@/model/settings.model";
import { getSessionUser } from "@/lib/session";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_KNOWLEDGE = 100_000;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`settings-save:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { message: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // Auth required — the owner is the session user, never the request body.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const businessName =
      body.businessName != null ? String(body.businessName) : undefined;
    const supportEmail =
      body.supportEmail != null ? String(body.supportEmail) : undefined;
    const knowledge =
      body.knowledge != null ? String(body.knowledge) : undefined;

    // Input validation / length caps.
    if (businessName !== undefined && businessName.length > MAX_NAME) {
      return NextResponse.json(
        { message: `Business name must be at most ${MAX_NAME} characters` },
        { status: 400 },
      );
    }
    if (supportEmail !== undefined && supportEmail.length > 0) {
      if (supportEmail.length > MAX_EMAIL || !EMAIL_RE.test(supportEmail)) {
        return NextResponse.json(
          { message: "Enter a valid support email" },
          { status: 400 },
        );
      }
    }
    if (knowledge !== undefined && knowledge.length > MAX_KNOWLEDGE) {
      return NextResponse.json(
        { message: `Knowledge must be at most ${MAX_KNOWLEDGE} characters` },
        { status: 400 },
      );
    }

    await connectDb();
    const settings = await Settings.findOneAndUpdate(
      { ownerId: user.id },
      {
        ownerId: user.id,
        ...(businessName !== undefined ? { businessName } : {}),
        ...(supportEmail !== undefined ? { supportEmail } : {}),
        ...(knowledge !== undefined ? { knowledge } : {}),
        email: user.email,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    console.error("Settings save error:", error);
    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
