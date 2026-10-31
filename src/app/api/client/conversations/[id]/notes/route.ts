import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// List the internal notes on a conversation (never shown to the visitor).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const conversation = await Conversation.findOne({ _id: id, ownerId })
    .select("notes")
    .lean<{ notes?: unknown[] }>();
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ notes: conversation.notes || [] });
}

// Add an internal note to a conversation.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "agent");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  const { text } = await req.json().catch(() => ({}));
  if (!text?.trim()) {
    return NextResponse.json({ message: "Note text is required" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const conversation = await Conversation.findOne({ _id: id, ownerId });
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  conversation.notes.push({
    authorId: user.id,
    authorName: user.name || user.email,
    text: String(text).trim(),
    createdAt: new Date(),
  });
  await conversation.save();

  return NextResponse.json({ notes: conversation.notes });
}
