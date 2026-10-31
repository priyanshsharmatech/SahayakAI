import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import KnowledgeEntry from "@/model/knowledgeEntry.model";
import Message from "@/model/message.model";
import { embedText } from "@/lib/embeddings";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// List curated Q&A entries for a bot.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const botId = new URL(req.url).searchParams.get("botId");
  if (!botId || !mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Valid botId required" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const entries = await KnowledgeEntry.find({ ownerId, botId })
    .sort({ updatedAt: -1 })
    .select("question answer updatedAt")
    .lean();
  return NextResponse.json({ entries });
}

// Answer an unanswered question → create a knowledge entry + mark it resolved.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { botId, question, answer } = await req.json().catch(() => ({}));
  if (!botId || !mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Valid botId required" }, { status: 400 });
  }
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json(
      { message: "Question and answer are required" },
      { status: 400 },
    );
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const bot = await Bot.findOne({ _id: botId, ownerId });
  if (!bot) return NextResponse.json({ message: "Bot not found" }, { status: 404 });

  const embedding = await embedText(String(question));
  const entry = await KnowledgeEntry.create({
    botId,
    ownerId,
    question: String(question).trim(),
    answer: String(answer).trim(),
    embedding,
  });

  // Any matching unanswered questions are now resolved.
  await Message.updateMany(
    { ownerId, botId, role: "user", content: String(question), fallback: true },
    { resolved: true },
  );

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "knowledge.add",
    detail: String(question).trim().slice(0, 80),
  });

  return NextResponse.json({ entry }, { status: 201 });
}
