import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import BotFlow from "@/model/botFlow.model";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Never cache: owners toggle/edit flows and the widget must see it immediately.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = "no-store, no-cache, must-revalidate";

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "GET, OPTIONS")))
    res.headers.set(k, v);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}

/**
 * Resolves the bot for a public request WITHOUT ever creating one. Prefers an
 * explicit botId; otherwise falls back to the owner's default (or first) bot.
 */
async function findBot(botId?: string, ownerId?: string) {
  if (botId && mongoose.isValidObjectId(botId)) {
    const bot = await Bot.findById(botId)
      .select("_id allowedDomains")
      .lean<{ _id: mongoose.Types.ObjectId; allowedDomains?: string[] }>();
    if (bot) return bot;
  }
  if (ownerId) {
    const bot = await Bot.findOne({ ownerId })
      .sort({ isDefault: -1, createdAt: 1 })
      .select("_id allowedDomains")
      .lean<{ _id: mongoose.Types.ObjectId; allowedDomains?: string[] }>();
    if (bot) return bot;
  }
  return null;
}

// Public: the enabled conversational flows the widget should run for a bot.
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const { searchParams } = new URL(req.url);
  const botId = searchParams.get("botId") || undefined;
  const ownerId = searchParams.get("ownerId") || undefined;

  const ip = clientIp(req);
  const rl = rateLimit(`chat-flow:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return withCors(
      NextResponse.json(
        { message: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      ),
      resolveAllowOrigin(origin, undefined),
    );
  }

  if (!botId && !ownerId) {
    return withCors(
      NextResponse.json({ message: "botId or ownerId required" }, { status: 400 }),
      resolveAllowOrigin(origin, undefined),
    );
  }

  try {
    await connectDb();
    const bot = await findBot(botId, ownerId);
    if (!bot) {
      return withCors(
        NextResponse.json({ message: "Not found" }, { status: 404 }),
        resolveAllowOrigin(origin, undefined),
      );
    }

    const allowOrigin = resolveAllowOrigin(origin, bot.allowedDomains);
    const flows = await BotFlow.find({ botId: bot._id, enabled: true })
      .select("name trigger steps")
      .lean();

    return withCors(NextResponse.json({ flows }), allowOrigin);
  } catch (e) {
    console.error("GET /api/chat/flow failed:", e);
    return withCors(
      NextResponse.json({ message: "Something went wrong" }, { status: 500 }),
      resolveAllowOrigin(origin, undefined),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const { searchParams } = new URL(req.url);
  const botId = searchParams.get("botId") || undefined;
  const ownerId = searchParams.get("ownerId") || undefined;

  let allowOrigin = resolveAllowOrigin(origin, undefined);
  if (botId || ownerId) {
    try {
      await connectDb();
      const bot = await findBot(botId, ownerId);
      if (bot) allowOrigin = resolveAllowOrigin(origin, bot.allowedDomains);
    } catch {
      /* fall through to open */
    }
  }

  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders(allowOrigin, "GET, OPTIONS"), "Cache-Control": NO_STORE },
  });
}
