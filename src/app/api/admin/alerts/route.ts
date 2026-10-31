import connectDb from "@/lib/db";
import Message from "@/model/message.model";
import User from "@/model/user.model";
import Settings from "@/model/settings.model";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";
import mongoose from "mongoose";

// Tunables for what counts as "abnormal".
const SPIKE_MULTIPLIER = 3; // last-24h volume > 3x prior daily average
const SPIKE_FLOOR = 20; // ...and at least this many messages in 24h
const FALLBACK_RATE = 0.5; // > 50% of bot replies were fallbacks
const FALLBACK_MIN_VOLUME = 20; // ...over at least this many bot replies in 7d

interface Alert {
  ownerId: string;
  ownerEmail: string;
  type: "spike" | "fallback";
  detail: string;
  value: number;
}

/**
 * Abuse / spike alerts across ALL tenants:
 *  - volume spikes (last 24h far above the prior-7-day daily average), and
 *  - high fallback rates over the last 7 days.
 */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    await connectDb();
    const now = Date.now();
    const last24Start = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000);

    const [volumeRows, fallbackRows] = await Promise.all([
      // Per-owner: messages in last 24h vs the 7 days before that.
      Message.aggregate([
        { $match: { createdAt: { $gte: eightDaysAgo } } },
        {
          $group: {
            _id: "$ownerId",
            last24: {
              $sum: { $cond: [{ $gte: ["$createdAt", last24Start] }, 1, 0] },
            },
            prior7: {
              $sum: { $cond: [{ $lt: ["$createdAt", last24Start] }, 1, 0] },
            },
          },
        },
      ]),
      // Per-owner: bot replies + fallbacks over last 7 days.
      Message.aggregate([
        { $match: { role: "bot", createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: "$ownerId",
            total: { $sum: 1 },
            fallbacks: { $sum: { $cond: ["$fallback", 1, 0] } },
          },
        },
      ]),
    ]);

    const alerts: Alert[] = [];

    for (const r of volumeRows) {
      const priorAvg = r.prior7 / 7;
      if (r.last24 >= SPIKE_FLOOR && r.last24 > SPIKE_MULTIPLIER * priorAvg) {
        alerts.push({
          ownerId: String(r._id),
          ownerEmail: "",
          type: "spike",
          detail: `${r.last24} messages in 24h vs ${priorAvg.toFixed(1)}/day prior 7-day average`,
          value: r.last24,
        });
      }
    }

    for (const r of fallbackRows) {
      if (r.total >= FALLBACK_MIN_VOLUME) {
        const rate = r.fallbacks / r.total;
        if (rate > FALLBACK_RATE) {
          alerts.push({
            ownerId: String(r._id),
            ownerEmail: "",
            type: "fallback",
            detail: `${Math.round(rate * 100)}% fallback rate over ${r.total} bot replies (7d)`,
            value: Number(rate.toFixed(3)),
          });
        }
      }
    }

    // Resolve owner emails (prefer User, fall back to Settings).
    const ownerIds = [...new Set(alerts.map((a) => a.ownerId))];
    if (ownerIds.length) {
      const validOwnerObjIds = ownerIds.filter((o) => mongoose.isValidObjectId(o));
      const [users, settings] = await Promise.all([
        User.find({ _id: { $in: validOwnerObjIds } }).select("email").lean(),
        Settings.find({ ownerId: { $in: ownerIds } }).select("ownerId email").lean(),
      ]);
      const emailMap = new Map<string, string>();
      for (const s of settings) if (s.email) emailMap.set(String(s.ownerId), s.email);
      for (const u of users) if (u.email) emailMap.set(String(u._id), u.email);
      for (const a of alerts) a.ownerEmail = emailMap.get(a.ownerId) || "";
    }

    alerts.sort((a, b) => b.value - a.value);
    return NextResponse.json({ alerts });
  } catch (e) {
    console.error("admin/alerts GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
