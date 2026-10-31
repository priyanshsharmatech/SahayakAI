import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Agent heartbeat: records that the human agent is currently typing.
export async function POST(
  _req: NextRequest,
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
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  await Conversation.updateOne(
    { _id: id, ownerId },
    { agentTypingAt: new Date() },
  );
  return NextResponse.json({ ok: true });
}
