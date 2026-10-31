import connectDb from "@/lib/db";
import AuditLog from "@/model/auditLog.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const skip = Math.max(0, Number(searchParams.get("skip")) || 0);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  await connectDb();

  const [entries, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments({}),
  ]);

  return NextResponse.json({
    entries: entries.map((e) => ({
      _id: String(e._id),
      actorEmail: e.actorEmail,
      action: e.action,
      targetOwnerId: e.targetOwnerId || null,
      targetEmail: e.targetEmail || null,
      detail: e.detail || null,
      createdAt: e.createdAt,
    })),
    total,
  });
}
