import connectDb from "@/lib/db";
import KnowledgeEntry from "@/model/knowledgeEntry.model";
import { embedText } from "@/lib/embeddings";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  const { question, answer } = await req.json().catch(() => ({}));

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const entry = await KnowledgeEntry.findOne({ _id: id, ownerId });
  if (!entry) return NextResponse.json({ message: "Not found" }, { status: 404 });

  let reembed = false;
  if (typeof question === "string" && question.trim()) {
    if (question.trim() !== entry.question) reembed = true;
    entry.question = question.trim();
  }
  if (typeof answer === "string" && answer.trim()) {
    entry.answer = answer.trim();
  }
  if (reembed) {
    entry.embedding = await embedText(entry.question);
  }
  await entry.save();

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "knowledge.update",
    detail: String(entry.question).slice(0, 80),
  });

  return NextResponse.json({ entry });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const deleted = await KnowledgeEntry.findOneAndDelete({ _id: id, ownerId });
  if (!deleted) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "knowledge.delete",
    detail: String(deleted.question || "").slice(0, 80),
  });

  return NextResponse.json({ ok: true });
}
