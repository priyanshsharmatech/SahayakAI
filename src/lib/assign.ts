import connectDb from "@/lib/db";
import User from "@/model/user.model";
import Conversation from "@/model/conversation.model";

/**
 * Least-loaded auto-assignment ("round-robin" balancing): picks the team agent
 * under this owner with the fewest currently-open assigned conversations.
 * Returns the chosen agent's userId, or null if the owner has no agents.
 */
export async function autoAssign(ownerId: string): Promise<string | null> {
  await connectDb();
  const agents = await User.find({ parentOwnerId: ownerId, teamRole: "agent" })
    .select("_id")
    .lean<{ _id: { toString(): string } }[]>();
  const ids = agents.map((a) => String(a._id));
  if (ids.length === 0) return null;

  const counts = await Conversation.aggregate([
    { $match: { ownerId, assignedTo: { $in: ids }, status: "open" } },
    { $group: { _id: "$assignedTo", c: { $sum: 1 } } },
  ]);
  const load = new Map<string, number>(counts.map((x) => [x._id as string, x.c as number]));
  ids.sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0));
  return ids[0];
}
