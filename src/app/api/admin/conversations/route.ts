import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

/**
 * ?ownerId=<id>            -> recent conversations for that client
 * ?conversationId=<id>     -> full transcript for one conversation
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await connectDb();
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const ownerId = searchParams.get("ownerId");

  if (conversationId) {
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();
    return NextResponse.json({ messages });
  }

  if (!ownerId) {
    return NextResponse.json(
      { message: "ownerId or conversationId is required" },
      { status: 400 },
    );
  }

  const conversations = await Conversation.find({ ownerId })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({ conversations });
}
