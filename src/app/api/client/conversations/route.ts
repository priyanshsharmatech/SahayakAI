import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const { searchParams } = new URL(req.url);
  const botId = searchParams.get("botId");
  const status = searchParams.get("status") || "all"; // open|resolved|all
  const q = (searchParams.get("q") || "").trim();
  const tag = (searchParams.get("tag") || "").trim();
  const assignedTo = (searchParams.get("assignedTo") || "").trim();

  const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10) || 0);
  const limitRaw = parseInt(searchParams.get("limit") || "30", 10);
  const limit = Math.min(100, Math.max(1, Number.isNaN(limitRaw) ? 30 : limitRaw));

  const filter: Record<string, unknown> = { ownerId };
  if (botId && mongoose.isValidObjectId(botId)) {
    filter.botId = new mongoose.Types.ObjectId(botId);
  }
  if (status === "open" || status === "resolved") {
    filter.status = status;
  }
  if (tag) filter.tags = tag;
  if (assignedTo) filter.assignedTo = assignedTo;

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    // Conversations whose last/any message content matches the query.
    const msgConvIds = await Message.find({ ownerId, content: regex })
      .distinct("conversationId");
    filter.$or = [
      { visitorName: regex },
      { visitorEmail: regex },
      { visitorId: regex },
      { _id: { $in: msgConvIds } },
    ];
  }

  const total = await Conversation.countDocuments(filter);

  const conversations = await Conversation.find(filter)
    .sort({ needsHuman: -1, updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Attach a last-message preview for each conversation.
  const ids = conversations.map((c) => c._id);
  const lastMsgs = await Message.aggregate([
    { $match: { conversationId: { $in: ids } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: "$conversationId",
        content: { $last: "$content" },
        role: { $last: "$role" },
      },
    },
  ]);
  const previews = new Map(lastMsgs.map((m) => [String(m._id), m]));

  // How many conversations each visitor has had (for new-vs-returning).
  const visitorIds = [...new Set(conversations.map((c) => c.visitorId))];
  const countAgg = await Conversation.aggregate([
    { $match: { ownerId, visitorId: { $in: visitorIds } } },
    { $group: { _id: "$visitorId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(countAgg.map((c) => [c._id, c.count]));

  const rows = conversations.map((c) => ({
    ...c,
    lastMessage: previews.get(String(c._id))?.content || "",
    lastRole: previews.get(String(c._id))?.role || "",
    visitorConversations: countMap.get(c.visitorId) || 1,
  }));

  return NextResponse.json({ conversations: rows, total });
}
