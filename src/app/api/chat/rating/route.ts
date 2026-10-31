import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Bot from "@/model/bot.model";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import { captureError } from "@/lib/observability";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const MAX_COMMENT = 2000;

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "POST, OPTIONS")))
    res.headers.set(k, v);
  return res;
}

/** Public post-chat CSAT rating from the widget. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json().catch(() => ({}));
  const { conversationId, visitorId, rating, comment } = body as {
    conversationId?: string;
    visitorId?: string;
    rating?: number;
    comment?: string;
  };

  // Throttle BEFORE any DB work so a flood never reaches the database. The
  // rate-limit response uses a DB-free allow-origin.
  const ip = clientIp(req);
  const rl = rateLimit(`rating:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return withCors(
      NextResponse.json(
        { message: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      ),
      resolveAllowOrigin(origin, undefined),
    );
  }

  try {
    if (
      !conversationId ||
      !mongoose.isValidObjectId(conversationId) ||
      !visitorId
    ) {
      return withCors(
        NextResponse.json(
          { message: "conversationId and visitorId required" },
          { status: 400 },
        ),
        resolveAllowOrigin(origin, undefined),
      );
    }

    await connectDb();

    // Load the conversation ONCE and reuse it for both CORS resolution and the
    // rating update (previously it was fetched twice).
    const conversation = await Conversation.findById(conversationId);
    let allowOrigin = resolveAllowOrigin(origin, undefined);
    if (conversation?.botId) {
      const bot = await Bot.findById(conversation.botId)
        .select("allowedDomains")
        .lean<{ allowedDomains?: string[] }>();
      allowOrigin = resolveAllowOrigin(origin, bot?.allowedDomains);
    }

    if (!conversation || conversation.visitorId !== visitorId) {
      return withCors(
        NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        allowOrigin,
      );
    }

    // Require a valid 1–5 integer — never silently record a default 1-star.
    const n = Math.round(Number(rating));
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      return withCors(
        NextResponse.json({ message: "rating must be an integer 1–5" }, { status: 400 }),
        allowOrigin,
      );
    }
    conversation.rating = n;
    if (comment != null) {
      conversation.ratingComment = String(comment).slice(0, MAX_COMMENT);
    }
    await conversation.save();

    return withCors(NextResponse.json({ ok: true }), allowOrigin);
  } catch (error) {
    captureError(error, { route: "chat/rating" });
    return withCors(
      NextResponse.json({ message: "Server error" }, { status: 500 }),
      resolveAllowOrigin(origin, undefined),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const allowOrigin = resolveAllowOrigin(req.headers.get("origin"), undefined);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(allowOrigin, "POST, OPTIONS"),
  });
}
