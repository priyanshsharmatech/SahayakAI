import connectDb from "@/lib/db";
import Announcement from "@/model/announcement.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

const LEVELS = ["info", "warning", "success"] as const;
type Level = (typeof LEVELS)[number];

// GET /api/admin/announcements -> { announcements } (all, newest first)
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    await connectDb();
    const announcements = await Announcement.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      announcements: announcements.map((a) => ({
        _id: String(a._id),
        title: a.title || "",
        body: a.body,
        level: a.level,
        active: a.active,
        createdByEmail: a.createdByEmail || "",
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (e) {
    console.error("admin/announcements GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/admin/announcements { title?, body, level?, active? } -> { announcement }
export async function POST(req: NextRequest) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text) {
      return NextResponse.json({ message: "body is required" }, { status: 400 });
    }
    const level: Level = LEVELS.includes(body?.level) ? body.level : "info";

    await connectDb();
    const doc = await Announcement.create({
      title: typeof body?.title === "string" ? body.title : "",
      body: text,
      level,
      active: typeof body?.active === "boolean" ? body.active : true,
      createdByEmail: admin.email,
    });

    return NextResponse.json({
      announcement: {
        _id: String(doc._id),
        title: doc.title || "",
        body: doc.body,
        level: doc.level,
        active: doc.active,
        createdByEmail: doc.createdByEmail || "",
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    console.error("admin/announcements POST failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
