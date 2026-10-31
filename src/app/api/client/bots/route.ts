import connectDb from "@/lib/db";
import Bot, { DEFAULT_APPEARANCE } from "@/model/bot.model";
import { ensureOwnerBots } from "@/lib/bot";
import { reindexBot } from "@/lib/rag";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { captureError } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);
  const bots = await ensureOwnerBots(ownerId);
  return NextResponse.json({ bots });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });
  const body = await req.json().catch(() => ({}));
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const count = await Bot.countDocuments({ ownerId });
  const bot = await Bot.create({
    ownerId,
    name: body.name || `Chatbot ${count + 1}`,
    businessName: body.businessName || "",
    supportEmail: body.supportEmail || "",
    knowledge: body.knowledge || "",
    isDefault: count === 0, // first bot becomes the default
    appearance: { ...DEFAULT_APPEARANCE },
  });

  if ((bot.knowledge || "").trim()) {
    try {
      await reindexBot(bot);
    } catch (e) {
      captureError(e, { route: "client/bots#create-reindex" });
    }
  }

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "bot.create",
    detail: bot.name,
  });

  return NextResponse.json({ bot }, { status: 201 });
}
