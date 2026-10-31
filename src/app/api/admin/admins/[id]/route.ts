import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

// DELETE /api/admin/admins/[id] -> { ok: true } (superadmin-only; can't remove self)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (admin.adminRole !== "superadmin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  if (id === admin.id) {
    return NextResponse.json(
      { message: "You cannot remove your own admin access" },
      { status: 400 },
    );
  }
  try {
    await connectDb();
    const res = await User.findByIdAndUpdate(id, { $unset: { adminRole: "" } });
    if (!res) {
      return NextResponse.json({ message: "No such user" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("admin/admins DELETE failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
