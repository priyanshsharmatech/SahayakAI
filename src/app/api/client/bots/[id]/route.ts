import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import KnowledgeEntry from "@/model/knowledgeEntry.model";
import Memory from "@/model/memory.model";
import { reindexBot } from "@/lib/rag";
import { deleteImage } from "@/lib/cloudinary";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { captureError } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

async function ownedBot(id: string, ownerId: string) {
  return Bot.findOne({ _id: id, ownerId });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const bot = await ownedBot(id, ownerId);
  if (!bot) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json({ bot });
}

const EDITABLE = [
  "name",
  "businessName",
  "supportEmail",
  "knowledge",
  "isActive",
  "appearance",
  "starters",
  "tone",
  "ab",
  "avatarPublicId",
  "allowedDomains",
  "dataRetentionDays",
  "confidenceThreshold",
] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));

    // Defensive coercion: number inputs can arrive as "" / strings from the
    // form; clamp them to valid ranges so Mongoose never throws a cast error.
    const clampNum = (v: unknown, min: number, max: number, dflt: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
    };
    if (body.dataRetentionDays !== undefined)
      body.dataRetentionDays = clampNum(body.dataRetentionDays, 0, 100000, 0);
    if (body.confidenceThreshold !== undefined)
      body.confidenceThreshold = clampNum(body.confidenceThreshold, 0, 1, 0);
    if (body.appearance && typeof body.appearance === "object") {
      const a = body.appearance as Record<string, unknown>;
      if (a.offsetBottom !== undefined) a.offsetBottom = clampNum(a.offsetBottom, 0, 200, 24);
      if (a.offsetSide !== undefined) a.offsetSide = clampNum(a.offsetSide, 0, 200, 24);
      if (a.proactiveDelay !== undefined) a.proactiveDelay = clampNum(a.proactiveDelay, 0, 600, 8);
      if (a.proactiveScrollPercent !== undefined)
        a.proactiveScrollPercent = clampNum(a.proactiveScrollPercent, 0, 100, 50);
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const bot = await ownedBot(id, ownerId);
    if (!bot) return NextResponse.json({ message: "Not found" }, { status: 404 });

    const prevKnowledge = bot.knowledge || "";
    const prevAvatarPublicId = bot.avatarPublicId || "";

    for (const key of EDITABLE) {
      if (body[key] !== undefined) {
        // merge nested objects so partial appearance/ab updates work
        if (key === "appearance" || key === "ab") {
          bot[key] = { ...(bot[key]?.toObject?.() ?? bot[key]), ...body[key] };
        } else {
          bot[key] = body[key];
        }
      }
    }

    // Promote to default (and demote the others) when requested.
    if (body.isDefault === true) {
      await Bot.updateMany(
        { ownerId, _id: { $ne: bot._id } },
        { isDefault: false },
      );
      bot.isDefault = true;
    }

    await bot.save();

    // Avatar changed or removed → clean up the previous Cloudinary image (best-effort).
    if (
      body.avatarPublicId !== undefined &&
      prevAvatarPublicId &&
      prevAvatarPublicId !== (body.avatarPublicId || "")
    ) {
      await deleteImage(prevAvatarPublicId);
    }

    // Re-embed the knowledge base only when it actually changed.
    if (body.knowledge !== undefined && (body.knowledge || "") !== prevKnowledge) {
      try {
        await reindexBot(bot);
      } catch (e) {
        captureError(e, { route: "client/bots/[id]#update-reindex" });
      }
    }

    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName: user.name || user.email,
      action: "bot.update",
      detail: bot.name,
    });

    return NextResponse.json({ bot });
  } catch (e) {
    // Surface Mongoose validation/cast problems as an actionable 400 (e.g. a
    // number field that arrived empty/out-of-range) instead of an opaque 500.
    const err = e as { name?: string; message?: string };
    if (err?.name === "ValidationError" || err?.name === "CastError") {
      return NextResponse.json(
        { message: `Couldn't save: ${err.message}` },
        { status: 400 },
      );
    }
    captureError(e, { route: "client/bots/[id]#update" });
    return NextResponse.json(
      { message: "Something went wrong saving your changes." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });
  const { id } = await params;
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const bot = await ownedBot(id, ownerId);
  if (!bot) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const wasDefault = bot.isDefault;
  const avatarPublicId = bot.avatarPublicId || "";
  const deletedName = bot.name;
  await bot.deleteOne();
  // Clean up the bot's learned data.
  await Promise.all([
    KnowledgeChunk.deleteMany({ botId: bot._id }),
    KnowledgeEntry.deleteMany({ botId: bot._id }),
    Memory.deleteMany({ botId: bot._id }),
  ]);
  if (avatarPublicId) await deleteImage(avatarPublicId);

  // Make sure some bot remains the default.
  if (wasDefault) {
    const next = await Bot.findOne({ ownerId }).sort({ createdAt: 1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "bot.delete",
    detail: deletedName,
  });

  return NextResponse.json({ ok: true });
}
