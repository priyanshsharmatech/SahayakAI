import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import Bot from "@/model/bot.model";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import { captureError } from "@/lib/observability";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "GET, OPTIONS")))
    res.headers.set(k, v);
  return res;
}

/** Resolve the CORS allow-origin for a conversation's bot. */
async function allowOriginFor(
  req: NextRequest,
  conversationId: string | null,
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

/**
 * Widget polling: returns any agent (human) messages newer than `after`, plus
 * the current conversation mode, so the widget can show live replies.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const visitorId = searchParams.get("visitorId");
  const after = searchParams.get("after");

  // Throttle BEFORE any DB work so a flood never reaches the database. The
  // rate-limit response uses a DB-free allow-origin.
  const ip = clientIp(req);
  const rl = rateLimit(`poll:${ip}`, 60, 60_000);
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
      !conversationId ||
      !mongoose.isValidObjectId(conversationId) ||
      !visitorId
    ) {
      return withCors(
        NextResponse.json({ messages: [], mode: "ai" }, { status: 400 }),
        allowOrigin,
      );
    }

    const conversation = await Conversation.findById(conversationId).lean<{
      mode?: string;
      agentTypingAt?: Date;
      visitorId?: string;
    }>();
    if (!conversation) {
      return withCors(
        NextResponse.json({ messages: [], mode: "ai" }),
        allowOrigin,
      );
    }

    // IDOR guard: only the visitor who owns this conversation may read it.
    if (conversation.visitorId !== visitorId) {
      return withCors(
        NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        allowOrigin,
      );
    }

    const since = after ? new Date(after) : new Date(0);
    const messages = await Message.find({
      conversationId,
      role: "agent",
      createdAt: { $gt: since },
    })
      .sort({ createdAt: 1 })
      .select("content createdAt role")
      .lean();

    // Agent is "typing" if they pinged within the last 8 seconds.
    const agentTyping =
      conversation.mode === "human" &&
      !!conversation.agentTypingAt &&
      Date.now() - new Date(conversation.agentTypingAt).getTime() < 8000;

    return withCors(
      NextResponse.json({
        messages,
        mode: conversation.mode || "ai",
        agentTyping,
      }),
      allowOrigin,
    );
  } catch (error) {
    captureError(error, { route: "chat/poll" });
    return withCors(
      NextResponse.json({ message: "Server error" }, { status: 500 }),
      resolveAllowOrigin(origin, undefined),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await connectDb();
  const allowOrigin = await allowOriginFor(
    req,
    searchParams.get("conversationId"),
  );
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(allowOrigin, "GET, OPTIONS"),
  });
}
