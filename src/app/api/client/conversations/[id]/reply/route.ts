import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Agent (human) sends a reply into a conversation and takes it over.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const denied = await requirePermission(user, "agent");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  const { content } = await req.json().catch(() => ({}));
  if (!content || !String(content).trim()) {
    return NextResponse.json({ message: "Message is required" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const conversation = await Conversation.findOne({ _id: id, ownerId });
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const message = await Message.create({
    conversationId: conversation._id,
    ownerId,
    botId: conversation.botId,
    role: "agent",
    content: String(content).trim(),
  });

  conversation.mode = "human";
  conversation.needsHuman = false;
  conversation.messageCount += 1;
  conversation.lastMessageAt = new Date();
  // Record the first human-agent reply for SLA / first-response metrics.
  if (!conversation.firstResponseAt) {
    conversation.firstResponseAt = new Date();
  }
  await conversation.save();

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "conversation.reply",
    detail: String(content).trim().slice(0, 80),
  });

  return NextResponse.json({ message });
}
