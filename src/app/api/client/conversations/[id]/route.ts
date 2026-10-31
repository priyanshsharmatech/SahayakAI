import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const conversation = await Conversation.findOne({
    _id: id,
    ownerId,
  }).lean();
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Optional ?after=<ISO> for polling only newer messages.
  const after = new URL(req.url).searchParams.get("after");
  const filter: Record<string, unknown> = { conversationId: id };
  if (after) filter.createdAt = { $gt: new Date(after) };

  const messages = await Message.find(filter).sort({ createdAt: 1 }).lean();
  return NextResponse.json({ conversation, messages });
}

// Update conversation management fields: status, tags, assignedTo.
export async function PATCH(
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
  const body = await req.json().catch(() => ({}));
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const conversation = await Conversation.findOne({ _id: id, ownerId });
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (body.status !== undefined) {
    if (body.status !== "open" && body.status !== "resolved") {
      return NextResponse.json(
        { message: "status must be open or resolved" },
        { status: 400 },
      );
    }
    conversation.status = body.status;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return NextResponse.json({ message: "tags must be an array" }, { status: 400 });
    }
    conversation.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
  }
  if (body.assignedTo !== undefined) {
    conversation.assignedTo = body.assignedTo ? String(body.assignedTo) : undefined;
  }

  await conversation.save();

  // Audit each requested mutation (best-effort; logClientAction never throws).
  const actorName = user.name || user.email;
  if (body.status !== undefined) {
    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName,
      action: "conversation.status",
      detail: `Set to ${conversation.status}`,
    });
  }
  if (body.assignedTo !== undefined) {
    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName,
      action: "conversation.assign",
      detail: conversation.assignedTo
        ? `Assigned to ${conversation.assignedTo}`
        : "Unassigned",
    });
  }
  if (body.tags !== undefined) {
    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName,
      action: "conversation.tag",
      detail: conversation.tags?.length
        ? `Tags: ${conversation.tags.join(", ")}`
        : "Tags cleared",
    });
  }

  // Unassign echo: when assignedTo is cleared, the serialized doc may omit the
  // key entirely, so the client keeps the stale assignee. Return the key
  // explicitly (null when unassigned) so the UI updates immediately.
  const result = conversation.toObject() as Record<string, unknown>;
  result.assignedTo = conversation.assignedTo ?? null;
  return NextResponse.json({ conversation: result });
}
