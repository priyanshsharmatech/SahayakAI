import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const { searchParams } = new URL(req.url);
  const botIdParam = searchParams.get("botId");
  const botId =
    botIdParam && mongoose.isValidObjectId(botIdParam)
      ? new mongoose.Types.ObjectId(botIdParam)
      : null;

  const base: Record<string, unknown> = { ownerId };
  if (botId) base.botId = botId;

  // --- Date range: ?from/?to (ISO) take priority, else ?days=N (default 7) ---
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const daysParam = parseInt(searchParams.get("days") || "7", 10);
  const days = Math.min(365, Math.max(1, Number.isNaN(daysParam) ? 7 : daysParam));

  let rangeEnd = toParam ? new Date(toParam) : new Date();
  if (Number.isNaN(rangeEnd.getTime())) rangeEnd = new Date();
  let rangeStart: Date;
  if (fromParam) {
    rangeStart = new Date(fromParam);
    if (Number.isNaN(rangeStart.getTime())) {
      rangeStart = new Date(rangeEnd);
      rangeStart.setDate(rangeStart.getDate() - (days - 1));
    }
  } else {
    rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeStart.getDate() - (days - 1));
    rangeStart.setHours(0, 0, 0, 0);
  }

  const range = { $gte: rangeStart, $lte: rangeEnd };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const [
    conversations,
    messages,
    messagesThisMonth,
    unanswered,
    thumbsUp,
    thumbsDown,
    daily,
    topUnanswered,
    abAgg,
    csatUp,
    csatDown,
    convInRange,
    resolvedInRange,
    rangeMsgs,
    convSeries,
    msgSeries,
    escalatedInRange,
    avgMsgsAgg,
    csatSeriesAgg,
  ] = await Promise.all([
    Conversation.countDocuments(base),
    Message.countDocuments(base),
    Message.countDocuments({ ...base, createdAt: { $gte: monthStart } }),
    Message.countDocuments({ ...base, role: "user", fallback: true, resolved: { $ne: true } }),
    Message.countDocuments({ ...base, role: "bot", feedback: 1 }),
    Message.countDocuments({ ...base, role: "bot", feedback: -1 }),
    Message.aggregate([
      { $match: { ...base, createdAt: { $gte: weekStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Message.aggregate([
      { $match: { ...base, role: "user", fallback: true, resolved: { $ne: true } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$content",
          createdAt: { $first: "$createdAt" },
          msgId: { $first: "$_id" },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
    ]),
    Message.aggregate([
      { $match: { ...base, role: "bot" } },
      {
        $group: {
          _id: "$variant",
          total: { $sum: 1 },
          up: { $sum: { $cond: [{ $eq: ["$feedback", 1] }, 1, 0] } },
          down: { $sum: { $cond: [{ $eq: ["$feedback", -1] }, 1, 0] } },
          fallbacks: { $sum: { $cond: ["$fallback", 1, 0] } },
        },
      },
    ]),
    // --- range-scoped metrics ---
    Message.countDocuments({ ...base, role: "bot", feedback: 1, createdAt: range }),
    Message.countDocuments({ ...base, role: "bot", feedback: -1, createdAt: range }),
    Conversation.countDocuments({ ...base, createdAt: range }),
    Conversation.countDocuments({ ...base, status: "resolved", createdAt: range }),
    Message.find({ ...base, createdAt: range })
      .select("conversationId role createdAt")
      .sort({ conversationId: 1, createdAt: 1 })
      .lean<{ conversationId: mongoose.Types.ObjectId; role: string; createdAt: Date }[]>(),
    Conversation.aggregate([
      { $match: { ...base, createdAt: range } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),
    Message.aggregate([
      { $match: { ...base, createdAt: range } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),
    // Conversations in range that were escalated or asked for a human (NOT deflected).
    Conversation.countDocuments({
      ...base,
      createdAt: range,
      $or: [{ escalated: true }, { needsHuman: true }],
    }),
    // Average messages per conversation in range.
    Conversation.aggregate([
      { $match: { ...base, createdAt: range } },
      { $group: { _id: null, avg: { $avg: "$messageCount" } } },
    ]),
    // Per-day average CSAT rating (only rated conversations).
    Conversation.aggregate([
      { $match: { ...base, createdAt: range, rating: { $gt: 0 } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          avg: { $avg: "$rating" },
        },
      },
    ]),
  ]);

  const abStats = ["A", "B"].map((v) => {
    const row = abAgg.find((r) => r._id === v);
    return {
      variant: v,
      total: row?.total || 0,
      up: row?.up || 0,
      down: row?.down || 0,
      fallbacks: row?.fallbacks || 0,
    };
  });

  // CSAT: percentage of positive feedback over all rated bot messages in range.
  const rated = csatUp + csatDown;
  const csat = rated > 0 ? Math.round((csatUp / rated) * 100) : 0;

  // Resolution rate: resolved conversations / total conversations in range.
  const resolutionRate =
    convInRange > 0 ? Math.round((resolvedInRange / convInRange) * 100) : 0;

  // Average response time: seconds between a user message and the next bot/agent
  // reply, within the same conversation, over the range.
  let totalResp = 0;
  let respCount = 0;
  let curConv: string | null = null;
  let pendingUserAt: number | null = null;
  for (const m of rangeMsgs) {
    const conv = String(m.conversationId);
    if (conv !== curConv) {
      curConv = conv;
      pendingUserAt = null;
    }
    if (m.role === "user") {
      if (pendingUserAt === null) pendingUserAt = new Date(m.createdAt).getTime();
    } else if (pendingUserAt !== null) {
      totalResp += (new Date(m.createdAt).getTime() - pendingUserAt) / 1000;
      respCount += 1;
      pendingUserAt = null;
    }
  }
  const avgResponseSeconds = respCount > 0 ? Math.round(totalResp / respCount) : 0;

  // Daily series across the range (fill zero-days for clean charting).
  const convByDate = new Map(convSeries.map((d) => [d._id, d.count]));
  const msgByDate = new Map(msgSeries.map((d) => [d._id, d.count]));
  const series: { date: string; conversations: number; messages: number }[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    series.push({
      date: key,
      conversations: convByDate.get(key) || 0,
      messages: msgByDate.get(key) || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Busiest hours: message counts by LOCAL hour (0–23) across the range.
  // Computed from the already-loaded range messages (no extra query).
  const busiestHours = new Array(24).fill(0) as number[];
  for (const m of rangeMsgs) {
    const h = new Date(m.createdAt).getHours();
    if (h >= 0 && h < 24) busiestHours[h] += 1;
  }

  // Deflection rate: % of conversations in range with NO escalation / human request.
  const deflectionRate =
    convInRange > 0
      ? Math.round(((convInRange - escalatedInRange) / convInRange) * 100)
      : 0;

  // Average messages per conversation in range.
  const avgMessagesPerConversation = avgMsgsAgg[0]?.avg
    ? Math.round(avgMsgsAgg[0].avg * 10) / 10
    : 0;

  // CSAT series: per-day average rating across the range (0 when no ratings).
  const csatByDate = new Map(csatSeriesAgg.map((d) => [d._id, d.avg]));
  const csatSeries: { date: string; rating: number }[] = [];
  const csatCursor = new Date(rangeStart);
  csatCursor.setHours(0, 0, 0, 0);
  const csatEnd = new Date(rangeEnd);
  while (csatCursor <= csatEnd) {
    const key = csatCursor.toISOString().slice(0, 10);
    const avg = csatByDate.get(key);
    csatSeries.push({
      date: key,
      rating: avg ? Math.round(avg * 10) / 10 : 0,
    });
    csatCursor.setDate(csatCursor.getDate() + 1);
  }

  return NextResponse.json({
    totals: {
      conversations,
      messages,
      messagesThisMonth,
      unanswered,
      thumbsUp,
      thumbsDown,
    },
    daily: daily.map((d) => ({ date: d._id, count: d.count })),
    topUnanswered: topUnanswered.map((m) => ({
      _id: String(m.msgId),
      content: m._id,
      createdAt: m.createdAt,
    })),
    abStats,
    range: { from: rangeStart.toISOString(), to: rangeEnd.toISOString(), days },
    csat,
    avgResponseSeconds,
    resolutionRate,
    series,
    busiestHours,
    deflectionRate,
    avgMessagesPerConversation,
    csatSeries,
  });
}
