import connectDb from "@/lib/db";
import Announcement from "@/model/announcement.model";
import { getSessionUser } from "@/lib/session";
import { NextResponse } from "next/server";

/**
 * Client-facing: active announcements for any logged-in client, shown as a
 * dashboard banner. Returns a trimmed shape (no internal createdByEmail).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDb();
    const announcements = await Announcement.find({ active: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    return NextResponse.json({
      announcements: announcements.map((a) => ({
        _id: String(a._id),
        title: a.title || "",
        body: a.body,
        level: a.level,
      })),
    });
  } catch (e) {
    console.error("client/announcements GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
