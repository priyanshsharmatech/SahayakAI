import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { purgeOwner } from "@/lib/retention";
import { NextResponse } from "next/server";

/**
 * Manual retention purge for the current workspace: deletes conversations (and
 * their messages) older than each bot's dataRetentionDays. The same logic runs
 * automatically on a schedule via /api/cron/retention. POST (no body).
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const ownerId = await getEffectiveOwnerId(user);
  const result = await purgeOwner(ownerId);
  return NextResponse.json({
    ok: true,
    deletedConversations: result.deletedConversations,
    deletedMessages: result.deletedMessages,
  });
}
