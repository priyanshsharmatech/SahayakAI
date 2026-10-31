import connectDb from "@/lib/db";
import Bot, { DEFAULT_APPEARANCE } from "@/model/bot.model";
import { reindexBot } from "@/lib/rag";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TONES = ["friendly", "professional", "concise", "playful"];

// Create a new bot from an exported config object (see the export route).
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const denied = await requirePermission(user, "manager");
    if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Invalid config" }, { status: 400 });
    }

    // Validate the portable shape (be lenient but reject clearly malformed input).
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ message: "Invalid config: name" }, { status: 400 });
    }
    if (body.knowledge !== undefined && typeof body.knowledge !== "string") {
      return NextResponse.json({ message: "Invalid config: knowledge" }, { status: 400 });
    }
    if (
      body.appearance !== undefined &&
      (typeof body.appearance !== "object" || Array.isArray(body.appearance))
    ) {
      return NextResponse.json({ message: "Invalid config: appearance" }, { status: 400 });
    }
    if (body.starters !== undefined && !Array.isArray(body.starters)) {
      return NextResponse.json({ message: "Invalid config: starters" }, { status: 400 });
    }
    if (body.tone !== undefined && !TONES.includes(body.tone)) {
      return NextResponse.json({ message: "Invalid config: tone" }, { status: 400 });
    }
    if (
      body.ab !== undefined &&
      (typeof body.ab !== "object" || Array.isArray(body.ab))
    ) {
      return NextResponse.json({ message: "Invalid config: ab" }, { status: 400 });
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const bot = await Bot.create({
      ownerId,
      name: String(body.name).trim(),
      businessName: typeof body.businessName === "string" ? body.businessName : "",
      supportEmail: typeof body.supportEmail === "string" ? body.supportEmail : "",
      knowledge: typeof body.knowledge === "string" ? body.knowledge : "",
      appearance: { ...DEFAULT_APPEARANCE, ...(body.appearance || {}) },
      starters: Array.isArray(body.starters)
        ? body.starters.filter((s: unknown) => typeof s === "string")
        : [],
      tone: TONES.includes(body.tone) ? body.tone : "friendly",
      ab: body.ab && typeof body.ab === "object" ? body.ab : {},
      isDefault: false,
    });

    if ((bot.knowledge || "").trim()) {
      try {
        await reindexBot(bot);
      } catch (e) {
        console.error("Reindex on import failed:", e);
      }
    }

    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName: user.name,
      action: "bot.import",
      detail: `Imported "${bot.name}"`,
    });

    return NextResponse.json({ bot }, { status: 201 });
  } catch (e) {
    console.error("Bot import failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
