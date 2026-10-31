import connectDb from "@/lib/db";
import Settings from "@/model/settings.model";
import { getSessionUser } from "@/lib/session";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`settings-get:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { message: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // Auth required — never trust an ownerId from the request body.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDb();
    const setting = await Settings.findOne({ ownerId: user.id });

    return NextResponse.json(setting, { status: 200 });
  } catch (error) {
    console.error("Settings get error:", error);
    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
