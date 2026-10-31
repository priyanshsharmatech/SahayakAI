import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import User from "@/model/user.model";
import Settings from "@/model/settings.model";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";
import mongoose from "mongoose";

/**
 * Platform leaderboards: top ~10 owners by messages, conversations, and
 * escalations. ownerEmail resolved by batch (User, then Settings).
 */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    await connectDb();
    const [msgRows, convRows, escRows] = await Promise.all([
      Message.aggregate([
        { $group: { _id: "$ownerId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Conversation.aggregate([
        { $group: { _id: "$ownerId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Conversation.aggregate([
        { $match: { escalated: true } },
        { $group: { _id: "$ownerId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Resolve owner emails for the union of all boards.
    const ownerIds = [
      ...new Set(
        [...msgRows, ...convRows, ...escRows].map((r) => String(r._id)),
      ),
    ];
    const validOwnerObjIds = ownerIds.filter((o) => mongoose.isValidObjectId(o));
    const [users, settings] = await Promise.all([
      User.find({ _id: { $in: validOwnerObjIds } }).select("email").lean(),
      Settings.find({ ownerId: { $in: ownerIds } }).select("ownerId email").lean(),
    ]);
    const emailMap = new Map<string, string>();
    for (const s of settings) if (s.email) emailMap.set(String(s.ownerId), s.email);
    for (const u of users) if (u.email) emailMap.set(String(u._id), u.email);

    const shape = (rows: { _id: unknown; count: number }[]) =>
      rows.map((r) => ({
        ownerId: String(r._id),
        ownerEmail: emailMap.get(String(r._id)) || "",
        count: r.count,
      }));

    return NextResponse.json({
      byMessages: shape(msgRows),
      byConversations: shape(convRows),
      byEscalations: shape(escRows),
    });
  } catch (e) {
    console.error("admin/leaderboards GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
