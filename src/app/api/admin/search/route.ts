import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import User from "@/model/user.model";
import Settings from "@/model/settings.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Global conversation search across ALL tenants, matching on visitor
 * name/email/id (case-insensitive). Resolves ownerEmail by batch.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ conversations: [] });
    }

    await connectDb();
    const rx = new RegExp(escapeRegex(q), "i");
    const convs = await Conversation.find({
      $or: [{ visitorName: rx }, { visitorEmail: rx }, { visitorId: rx }],
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    // Resolve owner emails (prefer User, fall back to Settings).
    const ownerIds = [...new Set(convs.map((c) => String(c.ownerId)))];
    const validOwnerObjIds = ownerIds.filter((o) => mongoose.isValidObjectId(o));
    const [users, settings] = await Promise.all([
      User.find({ _id: { $in: validOwnerObjIds } }).select("email").lean(),
      Settings.find({ ownerId: { $in: ownerIds } }).select("ownerId email").lean(),
    ]);
    const emailMap = new Map<string, string>();
    for (const s of settings) {
      if (s.email) emailMap.set(String(s.ownerId), s.email);
    }
    for (const u of users) {
      if (u.email) emailMap.set(String(u._id), u.email);
    }

    // Last message per matched conversation.
    const convIds = convs.map((c) => c._id);
    const lastMsgs = await Message.aggregate([
      { $match: { conversationId: { $in: convIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          content: { $first: "$content" },
          createdAt: { $first: "$createdAt" },
        },
      },
    ]);
    const lastMsgMap = new Map(lastMsgs.map((m) => [String(m._id), m.content]));

    return NextResponse.json({
      conversations: convs.map((c) => ({
        _id: String(c._id),
        ownerId: String(c.ownerId),
        ownerEmail: emailMap.get(String(c.ownerId)) || "",
        visitorName: c.visitorName || "",
        visitorEmail: c.visitorEmail || "",
        lastMessage: lastMsgMap.get(String(c._id)) || "",
        updatedAt: c.updatedAt,
      })),
    });
  } catch (e) {
    console.error("admin/search GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
