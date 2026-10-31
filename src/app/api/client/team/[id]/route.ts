import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser } from "@/lib/session";
import { isWorkspaceOwner } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const PERMISSIONS = ["viewer", "agent", "manager"];

// Update an agent's workspace permission level (owner-only).
export async function PATCH(
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
  if (!(await isWorkspaceOwner(user))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const agentPermission = body.agentPermission;
  if (!PERMISSIONS.includes(agentPermission)) {
    return NextResponse.json({ message: "Invalid permission" }, { status: 400 });
  }

  const member = await User.findOne({ _id: id, parentOwnerId: user.id });
  if (!member) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  member.agentPermission = agentPermission;
  await member.save();

  await logClientAction({
    ownerId: user.id,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "team.permission",
    detail: `${member.email} → ${agentPermission}`,
  });

  return NextResponse.json({
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      createdAt: member.createdAt,
      agentPermission: member.agentPermission,
    },
  });
}

// Remove an agent from the owner's workspace.
export async function DELETE(
  _req: NextRequest,
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
  if (!(await isWorkspaceOwner(user))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const removed = await User.findOneAndDelete({
    _id: id,
    parentOwnerId: user.id,
  });
  if (!removed) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  await logClientAction({
    ownerId: user.id,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "team.remove",
    detail: removed.email,
  });

  return NextResponse.json({ ok: true });
}
