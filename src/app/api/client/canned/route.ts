import connectDb from "@/lib/db";
import CannedResponse from "@/model/cannedResponse.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { NextRequest, NextResponse } from "next/server";

// List the workspace's canned responses (macros).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const items = await CannedResponse.find({ ownerId })
    .sort({ updatedAt: -1 })
    .select("title shortcut content category")
    .lean();
  return NextResponse.json({ items });
}

// Create a new canned response.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "agent");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { title, shortcut, content, category } = await req.json().catch(() => ({}));
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json(
      { message: "Title and content are required" },
      { status: 400 },
    );
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const item = await CannedResponse.create({
    ownerId,
    title: String(title).trim(),
    shortcut: typeof shortcut === "string" ? shortcut.trim() : "",
    content: String(content).trim(),
    category: typeof category === "string" ? category.trim() : "",
  });

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "canned.create",
    detail: item.title,
  });

  return NextResponse.json({ item }, { status: 201 });
}
