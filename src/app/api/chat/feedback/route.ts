import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import Memory from "@/model/memory.model";
import Bot from "@/model/bot.model";
import { embedText } from "@/lib/embeddings";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import { captureError } from "@/lib/observability";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json().catch(() => ({}));
  const { messageId, conversationId, visitorId, value } = body as {
    messageId?: string;
    conversationId?: string;
    visitorId?: string;
    value?: number;
  };

  // Throttle BEFORE any DB work so a flood never reaches the database. The
  // rate-limit response uses a DB-free allow-origin.
  const ip = clientIp(req);
  const rl = rateLimit(`feedback:${ip}`, 60, 60_000);
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
    await connectDb();
    const allowOrigin = await allowOriginFor(req, conversationId);

    if (
      !messageId ||
      !mongoose.isValidObjectId(messageId) ||
      !conversationId ||
      !mongoose.isValidObjectId(conversationId) ||
      !visitorId
    ) {
      return withCors(
        NextResponse.json(
          { message: "messageId, conversationId and visitorId required" },
          { status: 400 },
        ),
        allowOrigin,
      );
    }

    // IDOR / KB-poisoning guard: the conversation must belong to this visitor.
    const conversation = await Conversation.findById(conversationId).lean<{
      visitorId?: string;
    }>();
    if (!conversation || conversation.visitorId !== visitorId) {
      return withCors(
        NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        allowOrigin,
      );
    }

    const v = value === 1 ? 1 : value === -1 ? -1 : 0;

    // The message must be a bot reply that belongs to this same conversation.
    const botMsg = await Message.findOneAndUpdate(
      { _id: messageId, conversationId, role: "bot" },
      { feedback: v },
      { new: true },
    );
    if (!botMsg) {
      return withCors(
        NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        allowOrigin,
      );
    }

    // On 👍, remember this Q&A so the bot can reuse it for similar questions.
    // GUARD against stored prompt-injection: only memorize answers that were
    // GROUNDED in the bot's own knowledge (had a source, or solid retrieval
    // confidence). An ungrounded, free-form reply — e.g. one a visitor coaxed
    // out via prompt injection — must never be persisted and replayed to other
    // visitors. Also skip absurdly long "questions".
    const grounded =
      (botMsg.sources?.length ?? 0) > 0 || (botMsg.confidence ?? 0) >= 0.5;
    if (v === 1 && !botMsg.fallback && grounded) {
      try {
        const userMsg = await Message.findOne({
          conversationId: botMsg.conversationId,
          role: "user",
          createdAt: { $lt: botMsg.createdAt },
        }).sort({ createdAt: -1 });

        if (userMsg && userMsg.content.length <= 500) {
          const exists = await Memory.findOne({
            botId: botMsg.botId,
            question: userMsg.content,
            answer: botMsg.content,
          });
          if (!exists) {
            const embedding = await embedText(userMsg.content);
            await Memory.create({
              botId: botMsg.botId,
              ownerId: botMsg.ownerId,
              question: userMsg.content,
              answer: botMsg.content,
              embedding,
            });
          }
        }
      } catch (e) {
        captureError(e, { route: "chat/feedback" });
      }
    }

    return withCors(NextResponse.json({ ok: true }), allowOrigin);
  } catch (error) {
    captureError(error, { route: "chat/feedback" });
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
