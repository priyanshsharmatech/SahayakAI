import connectDb from "@/lib/db";
import ClientProfile from "@/model/clientProfile.model";
import Message from "@/model/message.model";

/**
 * Enforces admin-set client limits for the public chat endpoint:
 *  - lifecycle "suspended" blocks the bot entirely
 *  - monthlyMessageQuota (when > 0) blocks once this calendar month's visitor
 *    messages reach the cap
 * Returns { ok: true } when no profile/limits apply (the common case), so the
 * default path adds just one indexed lookup.
 */
export async function checkClientLimits(
  ownerId: string,
): Promise<{ ok: boolean; reason?: "suspended" | "quota" }> {
  await connectDb();
  const profile = await ClientProfile.findOne({ ownerId })
    .select("lifecycle monthlyMessageQuota")
    .lean<{ lifecycle?: string; monthlyMessageQuota?: number }>();
  if (!profile) return { ok: true };
  if (profile.lifecycle === "suspended") return { ok: false, reason: "suspended" };

  const quota = profile.monthlyMessageQuota || 0;
  if (quota > 0) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const used = await Message.countDocuments({
      ownerId,
      role: "user",
      createdAt: { $gte: start },
    });
    if (used >= quota) return { ok: false, reason: "quota" };
  }
  return { ok: true };
}
