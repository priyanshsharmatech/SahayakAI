import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser } from "@/lib/session";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Read the CURRENT user's notification preferences (self-scoped, not workspace).
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (!mongoose.isValidObjectId(user.id)) {
      return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    await connectDb();
    const dbUser = await User.findById(user.id)
      .select("notifPrefs")
      .lean<{ notifPrefs?: Record<string, boolean> }>();

    return NextResponse.json({ prefs: dbUser?.notifPrefs ?? {} });
  } catch (e) {
    console.error("Notif prefs get failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// Save the CURRENT user's notification preferences.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (!mongoose.isValidObjectId(user.id)) {
      return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const raw = body?.prefs;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ message: "Invalid prefs" }, { status: 400 });
    }

    // Keep only boolean values.
    const prefs: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "boolean") prefs[k] = v;
    }

    await connectDb();
    await User.updateOne({ _id: user.id }, { $set: { notifPrefs: prefs } });

    return NextResponse.json({ prefs });
  } catch (e) {
    console.error("Notif prefs save failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
