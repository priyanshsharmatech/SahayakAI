import connectDb from "@/lib/db";
import CannedResponse from "@/model/cannedResponse.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Update a canned response.
export async function PATCH(
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
  const { title, shortcut, content, category } = await req.json().catch(() => ({}));

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const item = await CannedResponse.findOne({ _id: id, ownerId });
  if (!item) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (typeof title === "string" && title.trim()) item.title = title.trim();
  if (typeof shortcut === "string") item.shortcut = shortcut.trim();
  if (typeof content === "string" && content.trim()) item.content = content.trim();
  if (typeof category === "string") item.category = category.trim();
  await item.save();

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "canned.update",
    detail: item.title,
  });

  return NextResponse.json({ item });
}

// Delete a canned response.
export async function DELETE(
  _req: NextRequest,
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
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const deleted = await CannedResponse.findOneAndDelete({ _id: id, ownerId });
  if (!deleted) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "canned.delete",
    detail: deleted.title,
  });

  return NextResponse.json({ ok: true });
}
