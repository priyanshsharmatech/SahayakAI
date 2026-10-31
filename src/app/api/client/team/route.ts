import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser } from "@/lib/session";
import { isWorkspaceOwner } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { hashPassword } from "@/lib/password";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// List the invited agents in the owner's workspace.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  if (!(await isWorkspaceOwner(user))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const members = await User.find({ parentOwnerId: user.id })
    .sort({ createdAt: -1 })
    .select("name email createdAt agentPermission")
    .lean();

  return NextResponse.json({ members });
}

// Invite a new agent to the owner's workspace.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  if (!(await isWorkspaceOwner(user))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { message: "Password must be at least 6 characters" },
      { status: 400 },
    );
  }

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) {
    return NextResponse.json(
      { message: "A user with that email already exists" },
      { status: 409 },
    );
  }

  const created = await User.create({
    name,
    email,
    passwordHash: hashPassword(password),
    provider: "password",
    teamRole: "agent",
    parentOwnerId: user.id,
  });

  const member = {
    _id: created._id,
    name: created.name,
    email: created.email,
    createdAt: created.createdAt,
  };

  await logClientAction({
    ownerId: user.id,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "team.add",
    detail: created.email,
  });

  return NextResponse.json({ member }, { status: 201 });
}
