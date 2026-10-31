import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import { requireSuperAdminSession } from "@/lib/session";
import { logAdminAction } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

// Enable/disable ALL of an owner's bots at once. Superadmin-only — this can
// take a client's service offline.
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdminSession();
  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { ownerId, isActive } = await req.json().catch(() => ({}));
  if (!ownerId || typeof isActive !== "boolean") {
    return NextResponse.json(
      { message: "ownerId and isActive (boolean) are required" },
      { status: 400 },
    );
  }

  await connectDb();
  const result = await Bot.updateMany({ ownerId }, { isActive });
  if (result.matchedCount === 0) {
    return NextResponse.json({ message: "Client not found" }, { status: 404 });
  }

  await logAdminAction({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "client.toggle",
    targetOwnerId: ownerId,
    detail: isActive ? "enabled" : "disabled",
  });

  return NextResponse.json({ ownerId, isActive });
}
