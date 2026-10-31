import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Bot from "@/model/bot.model";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_KEYS = 20;
const MAX_VALUE_LEN = 1000;

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "POST, OPTIONS")))
    res.headers.set(k, v);
  return res;
}

async function allowOriginFor(
  req: NextRequest,
  conversationId?: string | null,
): Promise<string> {
  const origin = req.headers.get("origin");
  if (conversationId && mongoose.isValidObjectId(conversationId)) {
    try {
      const conv = await Conversation.findById(conversationId)
        .select("botId")
        .lean<{ botId?: mongoose.Types.ObjectId }>();
      if (conv?.botId) {
        const bot = await Bot.findById(conv.botId)
          .select("allowedDomains")
          .lean<{ allowedDomains?: string[] }>();
        return resolveAllowOrigin(origin, bot?.allowedDomains);
      }
    } catch {
      /* fall through to open */
    }
  }
  return resolveAllowOrigin(origin, undefined);
}

/** Public in-chat survey submission from the widget. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json().catch(() => ({}));
    const { conversationId, visitorId, answers } = body as {
      botId?: string;
      ownerId?: string;
      conversationId?: string;
      visitorId?: string;
      answers?: unknown;
    };

    await connectDb();
    const allowOrigin = await allowOriginFor(req, conversationId);

    const ip = clientIp(req);
    const rl = rateLimit(`survey:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return withCors(
        NextResponse.json(
          { message: "Too many requests", retryAfter: rl.retryAfter },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        ),
        allowOrigin,
      );
    }

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
        allowOrigin,
      );
    }

    // Coerce answers into a bounded string→string map.
    const clean: Record<string, string> = {};
    if (answers && typeof answers === "object" && !Array.isArray(answers)) {
      let keptKeys = 0;
      for (const [key, raw] of Object.entries(answers as Record<string, unknown>)) {
        if (keptKeys >= MAX_KEYS) break;
        if (typeof raw !== "string") continue; // ignore non-string values
        clean[String(key).slice(0, 200)] = raw.slice(0, MAX_VALUE_LEN);
        keptKeys++;
      }
    }

    // IDOR guard: the conversation must belong to this visitor.
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.visitorId !== visitorId) {
      return withCors(
        NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        allowOrigin,
      );
    }

    // Merge with any existing survey answers.
    const existing =
      conversation.survey && typeof conversation.survey === "object"
        ? (conversation.survey as Record<string, string>)
        : {};
    conversation.survey = { ...existing, ...clean };
    conversation.markModified("survey");
    await conversation.save();

    return withCors(NextResponse.json({ ok: true }), allowOrigin);
  } catch {
    return withCors(
      NextResponse.json({ message: "Something went wrong" }, { status: 500 }),
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
