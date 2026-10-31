import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import { resolveBot } from "@/lib/bot";
import { sendHumanRequestEmail } from "@/lib/mailer";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "POST, OPTIONS")))
    res.headers.set(k, v);
  return res;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Default-open until we know the bot's allowlist.
  let allowOrigin = resolveAllowOrigin(origin, undefined);
  try {
    const { ownerId, botId, conversationId, visitorId, visitorEmail } =
      await req.json().catch(() => ({}));

    const ip = clientIp(req);
    const rl = rateLimit(`request-human:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return withCors(
        NextResponse.json(
          { message: "Too many requests", retryAfter: rl.retryAfter },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        ),
        allowOrigin,
      );
    }

    if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
      return withCors(
        NextResponse.json({ message: "conversationId required" }, { status: 400 }),
        allowOrigin,
      );
    }

    await connectDb();
    const bot = await resolveBot(botId, ownerId);
    if (!bot) {
      return withCors(
        NextResponse.json({ message: "Not found" }, { status: 404 }),
        allowOrigin,
      );
    }
    allowOrigin = resolveAllowOrigin(origin, bot.allowedDomains);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      ownerId: bot.ownerId,
    });
    if (!conversation) {
      return withCors(
        NextResponse.json({ message: "Not found" }, { status: 404 }),
        allowOrigin,
      );
    }

    // Ownership: the caller must be the visitor who owns this conversation.
    // Prevents guessing another visitor's conversationId to overwrite their
    // email / trigger support emails.
    if (!visitorId || conversation.visitorId !== visitorId) {
      return withCors(
        NextResponse.json({ message: "Forbidden" }, { status: 403 }),
        allowOrigin,
      );
    }

    conversation.needsHuman = true;
    if (visitorEmail) conversation.visitorEmail = String(visitorEmail);
    await conversation.save();

    if (bot.supportEmail) {
      try {
        await sendHumanRequestEmail(bot.supportEmail, {
          businessName: bot.businessName,
          visitorEmail,
        });
      } catch (e) {
        console.error("human-request email failed:", e);
      }
    }

    return withCors(NextResponse.json({ ok: true }), allowOrigin);
  } catch (error) {
    console.error("request-human error:", error);
    return withCors(
      NextResponse.json({ message: "Something went wrong." }, { status: 500 }),
      allowOrigin,
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
