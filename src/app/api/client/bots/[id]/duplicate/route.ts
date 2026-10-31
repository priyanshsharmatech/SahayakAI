import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import { reindexBot } from "@/lib/rag";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { captureError } from "@/lib/observability";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Deep-copy an owned bot into a new, non-default bot in the same workspace.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const denied = await requirePermission(user, "manager");
    if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const source = await Bot.findOne({ _id: id, ownerId });
    if (!source) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const src = source.toObject();
    delete src._id;
    delete src.id;
    delete src.createdAt;
    delete src.updatedAt;
    delete src.__v;
    delete src.lastSeenAt;
    delete src.lastSeenDomain;

    const bot = await Bot.create({
      ...src,
      ownerId,
      name: `${source.name} (copy)`,
      isDefault: false,
    });

    if ((bot.knowledge || "").trim()) {
      try {
        await reindexBot(bot);
      } catch (e) {
        captureError(e, { route: "client/bots/[id]/duplicate#reindex" });
      }
    }

    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName: user.name,
      action: "bot.duplicate",
      detail: `Duplicated "${source.name}" → "${bot.name}"`,
    });

    return NextResponse.json({ bot }, { status: 201 });
  } catch (e) {
    captureError(e, { route: "client/bots/[id]/duplicate" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
