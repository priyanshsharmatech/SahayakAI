import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import User from "@/model/user.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import KnowledgeSource from "@/model/knowledgeSource.model";
import Memory from "@/model/memory.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ownerId: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { ownerId } = await params;
  if (!ownerId) {
    return NextResponse.json({ message: "ownerId required" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  await connectDb();

  const userDoc = mongoose.isValidObjectId(ownerId)
    ? await User.findById(ownerId)
        .select("email name provider createdAt teamRole")
        .lean<{
          _id: mongoose.Types.ObjectId;
          email: string;
          name: string;
          provider: string;
          createdAt: Date;
          teamRole?: string;
        }>()
    : null;

  const [
    bots,
    team,
    conversations,
    messages,
    botMessages,
    fallbacks,
    chunks,
    sources,
    memories,
    lastMsg,
    msgSeries,
    convSeries,
  ] = await Promise.all([
    Bot.find({ ownerId })
      .select("name businessName isActive isDefault knowledge appearance.botName createdAt")
      .lean(),
    User.find({ parentOwnerId: ownerId }).select("name email createdAt").lean(),
    Conversation.countDocuments({ ownerId }),
    Message.countDocuments({ ownerId }),
    Message.countDocuments({ ownerId, role: "bot" }),
    Message.countDocuments({ ownerId, role: "bot", fallback: true }),
    KnowledgeChunk.countDocuments({ ownerId }),
    KnowledgeSource.countDocuments({ ownerId }),
    Memory.countDocuments({ ownerId }),
    Message.findOne({ ownerId }).sort({ createdAt: -1 }).select("createdAt").lean<{
      createdAt: Date;
    }>(),
    Message.aggregate([
      { $match: { ownerId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),
    Conversation.aggregate([
      { $match: { ownerId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Zero-filled daily series across the range.
  const msgMap = new Map(msgSeries.map((d) => [d._id, d.count]));
  const convMap = new Map(convSeries.map((d) => [d._id, d.count]));
  const series: { date: string; messages: number; conversations: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      messages: msgMap.get(key) || 0,
      conversations: convMap.get(key) || 0,
    });
  }

  const defaultBot = bots.find((b) => b.isDefault) || bots[0];

  return NextResponse.json({
    client: {
      ownerId,
      email: userDoc?.email || "",
      name: userDoc?.name || "",
      provider: userDoc?.provider || "password",
      createdAt: userDoc?.createdAt || null,
      teamRole: userDoc?.teamRole || "owner",
      businessName: defaultBot?.businessName || "",
      isActive: bots.some((b) => b.isActive !== false),
    },
    usage: {
      bots: bots.length,
      conversations,
      messages,
      fallbackRate: botMessages ? fallbacks / botMessages : 0,
      knowledgeChunks: chunks,
      knowledgeSources: sources,
      memories,
      teamMembers: team.length,
      lastActive: lastMsg?.createdAt || null,
    },
    bots: bots.map((b) => ({
      _id: String(b._id),
      name: b.name,
      businessName: b.businessName,
      isActive: b.isActive !== false,
      isDefault: Boolean(b.isDefault),
      knowledgeChars: (b.knowledge || "").length,
      createdAt: b.createdAt,
    })),
    team: team.map((t) => ({
      _id: String(t._id),
      name: t.name,
      email: t.email,
      createdAt: t.createdAt,
    })),
    range: { days, from: since.toISOString() },
    series,
  });
}
