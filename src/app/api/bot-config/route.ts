import connectDb from "@/lib/db";
import Bot, { IBot } from "@/model/bot.model";
import { publicBotConfig } from "@/lib/bot";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

type BotDoc = IBot & { _id: mongoose.Types.ObjectId };

/**
 * Look up a bot for the public widget WITHOUT ever creating one. Prefers an
 * explicit (valid) botId, then the owner's default bot, then the owner's oldest
 * bot. Returns null when nothing exists — an unauthenticated read must never
 * write a row.
 */
async function findBotNoCreate(
  botId?: string,
  ownerId?: string,
): Promise<BotDoc | null> {
  if (botId && mongoose.isValidObjectId(botId)) {
    const bot = await Bot.findById(botId);
    if (bot) return bot as BotDoc;
  }
  if (ownerId) {
    const def = await Bot.findOne({ ownerId, isDefault: true });
    if (def) return def as BotDoc;
    const first = await Bot.findOne({ ownerId }).sort({ createdAt: 1 });
    if (first) return first as BotDoc;
  }
  return null;
}

// Never cache: config changes (colors, starters, etc.) must reflect immediately.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = "no-store, no-cache, must-revalidate";

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "GET, OPTIONS")))
    res.headers.set(k, v);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}

// Public appearance/config for the embedded widget (no secrets).
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const { searchParams } = new URL(req.url);
  const botId = searchParams.get("botId") || undefined;
  const ownerId = searchParams.get("ownerId") || undefined;

  const ip = clientIp(req);
  const rl = rateLimit(`bot-config:${ip}`, 120, 60_000);
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

  await connectDb();
  const bot = await findBotNoCreate(botId, ownerId);
  if (!bot) {
    return withCors(
      NextResponse.json({ message: "Not found" }, { status: 404 }),
      resolveAllowOrigin(origin, undefined),
    );
  }

  // Install verification: record where/when the widget last loaded its config.
  // Fire-and-forget, throttled to ~hourly writes to avoid write amplification.
  try {
    const ref = origin || req.headers.get("referer") || "";
    const domain = ref ? new URL(ref).hostname : "";
    const last = bot.lastSeenAt ? new Date(bot.lastSeenAt).getTime() : 0;
    if (domain && Date.now() - last > 3_600_000) {
      Bot.updateOne(
        { _id: bot._id },
        { lastSeenAt: new Date(), lastSeenDomain: domain },
      ).catch(() => {});
    }
  } catch {
    /* ignore */
  }

  const allowOrigin = resolveAllowOrigin(origin, bot.allowedDomains);
  return withCors(NextResponse.json(publicBotConfig(bot)), allowOrigin);
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
      const bot = await findBotNoCreate(botId, ownerId);
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
