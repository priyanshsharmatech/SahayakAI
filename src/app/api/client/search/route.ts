import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import { NextRequest, NextResponse } from "next/server";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LIMIT = 5;

interface BotHit {
  _id: string;
  name: string;
}

interface ConversationHit {
  _id: string;
  visitorName: string;
  visitorEmail: string;
  lastMessage: string;
  updatedAt: Date | string;
  botId: string | null;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ bots: [], conversations: [] });
    }

    const regex = new RegExp(escapeRegex(q), "i");

    // ── Bots: match name or businessName ────────────────────────────────────
    const botDocs = await Bot.find({
      ownerId,
      $or: [{ name: regex }, { businessName: regex }],
    })
      .select("name")
      .limit(LIMIT)
      .lean<{ _id: unknown; name?: string }[]>();

    const bots: BotHit[] = botDocs.map((b) => ({
      _id: String(b._id),
      name: b.name || "",
    }));

    // ── Conversations: match visitor name / email / id ──────────────────────
    const convDocs = await Conversation.find({
      ownerId,
      $or: [
        { visitorName: regex },
        { visitorEmail: regex },
        { visitorId: regex },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(LIMIT)
      .lean<
        {
          _id: unknown;
          visitorName?: string;
          visitorEmail?: string;
          botId?: unknown;
          updatedAt?: Date;
        }[]
      >();

    // Conversations don't store a lastMessage, so derive it from the newest
    // message per conversation. Capped at LIMIT results, so a small aggregate.
    const convIds = convDocs.map((c) => c._id);
    const lastMsgs = convIds.length
      ? await Message.aggregate([
          { $match: { conversationId: { $in: convIds } } },
          { $sort: { createdAt: 1 } },
          { $group: { _id: "$conversationId", content: { $last: "$content" } } },
        ])
      : [];
    const previews = new Map<string, string>(
      lastMsgs.map((m) => [String(m._id), m.content as string]),
    );

    const conversations: ConversationHit[] = convDocs.map((c) => ({
      _id: String(c._id),
      visitorName: c.visitorName || "",
      visitorEmail: c.visitorEmail || "",
      lastMessage: previews.get(String(c._id)) || "",
      updatedAt: c.updatedAt ?? "",
      botId: c.botId ? String(c.botId) : null,
    }));

    return NextResponse.json({ bots, conversations });
  } catch (error) {
    console.error("[client/search] failed", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
