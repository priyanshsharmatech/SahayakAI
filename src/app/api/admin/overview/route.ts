import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import User from "@/model/user.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await connectDb();

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const dayGroup = (field: string) => [
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}` } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 as const } },
  ];

  const [
    ownerIds,
    activeOwnerIds,
    totalBots,
    conversations,
    messages,
    botMessages,
    fallbacks,
    totalClients,
    msgSeries,
    convSeries,
    signupSeries,
  ] = await Promise.all([
    Bot.distinct("ownerId"),
    Bot.distinct("ownerId", { isActive: { $ne: false } }),
    Bot.countDocuments({}),
    Conversation.countDocuments({}),
    Message.countDocuments({}),
    Message.countDocuments({ role: "bot" }),
    Message.countDocuments({ role: "bot", fallback: true }),
    User.countDocuments({ teamRole: { $ne: "agent" } }),
    Message.aggregate(dayGroup("createdAt")),
    Conversation.aggregate(dayGroup("createdAt")),
    User.aggregate([
      { $match: { createdAt: { $gte: since }, teamRole: { $ne: "agent" } } },
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
  const signupMap = new Map(signupSeries.map((d) => [d._id, d.count]));
  const series: {
    date: string;
    messages: number;
    conversations: number;
    signups: number;
  }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      messages: msgMap.get(key) || 0,
      conversations: convMap.get(key) || 0,
      signups: signupMap.get(key) || 0,
    });
  }

  const newSignups = series.reduce((s, d) => s + d.signups, 0);

  return NextResponse.json({
    totals: {
      clients: ownerIds.length,
      activeClients: activeOwnerIds.length,
      totalBots,
      conversations,
      messages,
      allClients: totalClients,
      newSignups,
    },
    fallbackRate: botMessages ? fallbacks / botMessages : 0,
    range: { days, from: since.toISOString() },
    series,
    // Back-compat: the old `daily` (messages) field.
    daily: series.map((d) => ({ date: d.date, count: d.messages })),
  });
}
