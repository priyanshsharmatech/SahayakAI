import connectDb from "@/lib/db";
import KnowledgeSource from "@/model/knowledgeSource.model";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Delete a knowledge source and all of its derived KnowledgeChunk docs. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Valid source id required" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const source = await KnowledgeSource.findOne({ _id: id, ownerId });
  if (!source) {
    return NextResponse.json({ message: "Source not found" }, { status: 404 });
  }

  const deletedName = source.name;
  await KnowledgeChunk.deleteMany({ sourceId: source._id });
  await source.deleteOne();

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "source.delete",
    detail: deletedName,
  });

  return NextResponse.json({ ok: true });
}
