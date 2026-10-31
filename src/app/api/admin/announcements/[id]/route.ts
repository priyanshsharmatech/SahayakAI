import connectDb from "@/lib/db";
import Announcement from "@/model/announcement.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

const LEVELS = ["info", "warning", "success"] as const;

function serialize(a: Record<string, any>) {
  return {
    _id: String(a._id),
    title: a.title || "",
    body: a.body,
    level: a.level,
    active: a.active,
    createdByEmail: a.createdByEmail || "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// PATCH /api/admin/announcements/[id] { title?, body?, level?, active? } -> { announcement }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof body?.title === "string") update.title = body.title;
    if (typeof body?.body === "string") {
      const text = body.body.trim();
      if (!text) {
        return NextResponse.json({ message: "body cannot be empty" }, { status: 400 });
      }
      update.body = text;
    }
    if (body?.level !== undefined) {
      if (!LEVELS.includes(body.level)) {
        return NextResponse.json({ message: "Invalid level" }, { status: 400 });
      }
      update.level = body.level;
    }
    if (typeof body?.active === "boolean") update.active = body.active;

    await connectDb();
    const doc = await Announcement.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!doc) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ announcement: serialize(doc as Record<string, any>) });
  } catch (e) {
    console.error("admin/announcements PATCH failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// DELETE /api/admin/announcements/[id] -> { ok: true }
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  try {
    await connectDb();
    const res = await Announcement.findByIdAndDelete(id);
    if (!res) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("admin/announcements DELETE failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
