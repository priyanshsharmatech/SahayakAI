import connectDb from "@/lib/db";
import Settings from "@/model/settings.model";
import Conversation from "@/model/conversation.model";
import { sendSupportLeadEmail } from "@/lib/mailer";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(response: NextResponse) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`support-request:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return withCors(
        NextResponse.json(
          { message: "Too many requests", retryAfter: rl.retryAfter },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        ),
      );
    }

    const { ownerId, conversationId, visitorEmail, question, turnstileToken } =
      await req.json();

    // CAPTCHA (no-op until Turnstile keys are configured).
    const human = await verifyTurnstile(turnstileToken, ip);
    if (!human) {
      return withCors(
        NextResponse.json({ message: "Verification failed" }, { status: 403 }),
      );
    }

    if (!ownerId || !visitorEmail || !question) {
      return withCors(
        NextResponse.json(
          { message: "ownerId, visitorEmail and question are required" },
          { status: 400 },
        ),
      );
    }
    if (!EMAIL_RE.test(String(visitorEmail))) {
      return withCors(
        NextResponse.json({ message: "Enter a valid email" }, { status: 400 }),
      );
    }

    await connectDb();
    const setting = await Settings.findOne({ ownerId });
    if (!setting) {
      return withCors(
        NextResponse.json({ message: "Chatbot not configured" }, { status: 404 }),
      );
    }
    if (!setting.supportEmail) {
      return withCors(
        NextResponse.json(
          { message: "Support email is not configured for this business." },
          { status: 422 },
        ),
      );
    }

    // Mark the conversation as escalated (best effort).
    if (conversationId) {
      try {
        await Conversation.updateOne(
          { _id: conversationId, ownerId },
          { escalated: true },
        );
      } catch {
        /* ignore */
      }
    }

    await sendSupportLeadEmail(setting.supportEmail, {
      businessName: setting.businessName,
      visitorEmail: String(visitorEmail),
      question: String(question),
    });

    return withCors(NextResponse.json({ ok: true }));
  } catch (error) {
    return withCors(
      NextResponse.json(
        { message: "Something went wrong. Please try again." },
        { status: 500 },
      ),
    );
  }
}

export const OPTIONS = async () => {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
};
