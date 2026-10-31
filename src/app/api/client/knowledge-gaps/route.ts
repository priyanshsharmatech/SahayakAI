import connectDb from "@/lib/db";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Knowledge gaps: the unanswered visitor questions the bot fell back on,
 * grouped by normalized (lowercased/trimmed) content so repeated asks surface
 * as one gap with a count. Returns the top ~50 by frequency then recency.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const botId = new URL(req.url).searchParams.get("botId");
  if (botId && !mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Invalid botId" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const match: Record<string, unknown> = {
    ownerId,
    role: "user",
    fallback: true,
    resolved: false,
  };
  if (botId) match.botId = new mongoose.Types.ObjectId(botId);

  const rows = await Message.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $toLower: { $trim: { input: "$content" } } },
        question: { $first: "$content" },
        count: { $sum: 1 },
        lastAt: { $max: "$createdAt" },
        exampleMessageId: { $first: "$_id" },
      },
    },
    { $sort: { count: -1, lastAt: -1 } },
    { $limit: 50 },
    {
      $project: {
        _id: 0,
        question: 1,
        count: 1,
        lastAt: 1,
        exampleMessageId: 1,
      },
    },
  ]);

  return NextResponse.json({ gaps: rows });
}
