import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import BotFlow from "@/model/botFlow.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// List the conversational flows for one of the workspace's bots.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const botId = searchParams.get("botId") || "";
  if (!mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Invalid botId" }, { status: 400 });
  }

  try {
    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);
    // Confirm the bot belongs to this workspace before returning its flows.
    const bot = await Bot.findOne({ _id: botId, ownerId }).select("_id").lean();
    if (!bot) return NextResponse.json({ message: "Not found" }, { status: 404 });

    const flows = await BotFlow.find({ ownerId, botId })
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json({ flows });
  } catch (e) {
    console.error("GET /api/client/flows failed:", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}

// Create a new empty flow for one of the workspace's bots.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const body = await req.json().catch(() => ({}));
  const botId = typeof body.botId === "string" ? body.botId : "";
  if (!mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Invalid botId" }, { status: 400 });
  }

  try {
    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);
    // Verify the bot belongs to this workspace.
    const bot = await Bot.findOne({ _id: botId, ownerId }).select("_id").lean();
    if (!bot) return NextResponse.json({ message: "Not found" }, { status: 404 });

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "Untitled flow";

    const flow = await BotFlow.create({
      ownerId,
      botId,
      name,
      enabled: false,
      trigger: "",
      steps: [],
    });

    return NextResponse.json({ flow }, { status: 201 });
  } catch (e) {
    console.error("POST /api/client/flows failed:", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
