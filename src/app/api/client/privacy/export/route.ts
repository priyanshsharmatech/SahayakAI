import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import { redactPII } from "@/lib/pii";
import { NextRequest, NextResponse } from "next/server";

/**
 * GDPR data export for a single visitor, scoped to the owner's workspace.
 * GET /api/client/privacy/export?visitorId=...  or  ?email=...  (&redact=1)
 *
 * Returns a downloadable JSON of the matching conversations and their messages.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const visitorId = (searchParams.get("visitorId") || "").trim();
  const email = (searchParams.get("email") || "").trim();
  const redact = searchParams.get("redact") === "1";

  if (!visitorId && !email) {
    return NextResponse.json(
      { message: "A visitorId or email is required" },
      { status: 400 },
    );
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const or: Record<string, unknown>[] = [];
  if (visitorId) or.push({ visitorId });
  if (email) or.push({ visitorEmail: new RegExp(`^${escapeRegex(email)}$`, "i") });

  const conversations = await Conversation.find({ ownerId, $or: or })
    .sort({ createdAt: 1 })
    .lean<Record<string, unknown>[]>();

  const convIds = conversations.map((c) => c._id);
  const messages = await Message.find({ conversationId: { $in: convIds } })
    .sort({ createdAt: 1 })
    .lean<Record<string, unknown>[]>();

  // Group messages under their conversation.
  const byConv = new Map<string, Record<string, unknown>[]>();
  for (const m of messages) {
    const key = String(m.conversationId);
    const content = redact ? redactPII(String(m.content ?? "")) : m.content;
    const list = byConv.get(key) || [];
    list.push({
      role: m.role,
      content,
      createdAt: m.createdAt,
      fallback: m.fallback,
      feedback: m.feedback,
      attachments: m.attachments,
    });
    byConv.set(key, list);
  }

  // Derive the visitor summary from the first matching conversation.
  const first = conversations[0];
  const visitor = {
    visitorId: first?.visitorId ?? visitorId ?? null,
    visitorEmail: redact
      ? first?.visitorEmail
        ? redactPII(String(first.visitorEmail))
        : null
      : (first?.visitorEmail ?? (email || null)),
    visitorName: redact
      ? first?.visitorName
        ? redactPII(String(first.visitorName))
        : null
      : (first?.visitorName ?? null),
    visitorUserId: first?.visitorUserId ?? null,
  };

  const payload = {
    visitor,
    conversations: conversations.map((c) => ({
      id: c._id,
      botId: c.botId,
      visitorId: c.visitorId,
      visitorEmail: redact
        ? c.visitorEmail
          ? redactPII(String(c.visitorEmail))
          : c.visitorEmail
        : c.visitorEmail,
      visitorName: redact
        ? c.visitorName
          ? redactPII(String(c.visitorName))
          : c.visitorName
        : c.visitorName,
      status: c.status,
      rating: c.rating,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      messages: byConv.get(String(c._id)) || [],
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="visitor-export.json"',
    },
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
