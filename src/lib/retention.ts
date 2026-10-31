import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";

export interface PurgeResult {
  deletedConversations: number;
  deletedMessages: number;
  botsProcessed: number;
}

/**
 * Delete conversations (and their messages) older than a bot's retention window.
 * Staleness is based on the LAST activity (lastMessageAt), falling back to
 * createdAt only for old docs that predate that field — so a long-running,
 * recently-active conversation started before the cutoff is NOT purged.
 */
async function purgeForBot(
  botId: unknown,
  ownerId: string,
  retentionDays: number,
): Promise<{ convs: number; msgs: number }> {
  if (!retentionDays || retentionDays <= 0) return { convs: 0, msgs: 0 };
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const stale = await Conversation.find({
    ownerId,
    botId,
    $or: [
      { lastMessageAt: { $lt: cutoff } },
      { lastMessageAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  })
    .select("_id")
    .lean<{ _id: unknown }[]>();

  const convIds = stale.map((c) => c._id);
  if (convIds.length === 0) return { convs: 0, msgs: 0 };

  const msgResult = await Message.deleteMany({ conversationId: { $in: convIds } });
  const convResult = await Conversation.deleteMany({ _id: { $in: convIds } });
  return { convs: convResult.deletedCount ?? 0, msgs: msgResult.deletedCount ?? 0 };
}

/** Purge stale conversations for a single owner's bots. */
export async function purgeOwner(ownerId: string): Promise<PurgeResult> {
  await connectDb();
  const bots = await Bot.find({ ownerId, dataRetentionDays: { $gt: 0 } })
    .select("_id dataRetentionDays")
    .lean<{ _id: unknown; dataRetentionDays: number }[]>();

  let deletedConversations = 0;
  let deletedMessages = 0;
  for (const bot of bots) {
    const r = await purgeForBot(bot._id, ownerId, bot.dataRetentionDays);
    deletedConversations += r.convs;
    deletedMessages += r.msgs;
  }
  return { deletedConversations, deletedMessages, botsProcessed: bots.length };
}

/** Purge stale conversations across EVERY owner's bots (used by the cron). */
export async function purgeAll(): Promise<PurgeResult> {
  await connectDb();
  const bots = await Bot.find({ dataRetentionDays: { $gt: 0 } })
    .select("_id ownerId dataRetentionDays")
    .lean<{ _id: unknown; ownerId: string; dataRetentionDays: number }[]>();

  let deletedConversations = 0;
  let deletedMessages = 0;
  for (const bot of bots) {
    const r = await purgeForBot(bot._id, bot.ownerId, bot.dataRetentionDays);
    deletedConversations += r.convs;
    deletedMessages += r.msgs;
  }
  return { deletedConversations, deletedMessages, botsProcessed: bots.length };
}
