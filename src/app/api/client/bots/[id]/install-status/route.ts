import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Report whether the widget has been seen on a real page in the last 7 days.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const bot = await Bot.findOne({ _id: id, ownerId })
      .select("lastSeenAt lastSeenDomain")
      .lean<{ lastSeenAt?: Date; lastSeenDomain?: string }>();
    if (!bot) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const lastSeenAt = bot.lastSeenAt ?? null;
    const installed =
      !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() <= SEVEN_DAYS_MS;

    return NextResponse.json({
      installed,
      lastSeenAt,
      lastSeenDomain: bot.lastSeenDomain ?? null,
    });
  } catch (e) {
    console.error("Install status failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
