import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Export an owned bot's portable config as a JSON file download.
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

    const bot = await Bot.findOne({ _id: id, ownerId });
    if (!bot) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const b = bot.toObject();
    const config = {
      name: b.name,
      businessName: b.businessName,
      supportEmail: b.supportEmail,
      knowledge: b.knowledge,
      appearance: b.appearance,
      starters: b.starters,
      tone: b.tone,
      ab: b.ab,
    };

    const body = JSON.stringify(config, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bot-${id}.json"`,
      },
    });
  } catch (e) {
    console.error("Bot export failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
