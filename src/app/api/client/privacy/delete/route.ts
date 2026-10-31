import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { NextRequest, NextResponse } from "next/server";

/**
 * GDPR erasure for a single visitor, scoped to the owner's workspace.
 * POST { visitorId?, email? }
 *
 * Deletes the matching conversations and all of their messages.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const body = await req.json().catch(() => ({}));
  const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!visitorId && !email) {
    return NextResponse.json(
      { message: "A visitorId or email is required" },
      { status: 400 },
    );
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const or: Record<string, unknown>[] = [];
  if (visitorId) or.push({ visitorId });
  if (email) or.push({ visitorEmail: new RegExp(`^${escapeRegex(email)}$`, "i") });

  const conversations = await Conversation.find({ ownerId, $or: or })
    .select("_id")
    .lean<{ _id: unknown }[]>();
  const convIds = conversations.map((c) => c._id);

  if (convIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deletedConversations: 0,
      deletedMessages: 0,
    });
  }

  const msgResult = await Message.deleteMany({ conversationId: { $in: convIds } });
  const convResult = await Conversation.deleteMany({ _id: { $in: convIds } });

  return NextResponse.json({
    ok: true,
    deletedConversations: convResult.deletedCount ?? 0,
    deletedMessages: msgResult.deletedCount ?? 0,
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
