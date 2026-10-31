import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import User from "@/model/user.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const skip = Math.max(0, Number(searchParams.get("skip")) || 0);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 25));

  await connectDb();

  const [bots, users, msgAgg, convAgg] = await Promise.all([
    Bot.find().lean(),
    User.find().select("email name createdAt").lean(),
    Message.aggregate([
      {
        $group: {
          _id: "$ownerId",
          messages: { $sum: 1 },
          lastActive: { $max: "$createdAt" },
        },
      },
    ]),
    Conversation.aggregate([
      { $group: { _id: "$ownerId", conversations: { $sum: 1 } } },
    ]),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const msgMap = new Map(msgAgg.map((m) => [m._id, m]));
  const convMap = new Map(convAgg.map((c) => [c._id, c.conversations]));

  // A "client" is an owner; aggregate their bots.
  const byOwner = new Map<
    string,
    {
      ownerId: string;
      businessName: string;
      supportEmail: string;
      botCount: number;
      anyActive: boolean;
    }
  >();
  for (const b of bots) {
    const o =
      byOwner.get(b.ownerId) ||
      {
        ownerId: b.ownerId,
        businessName: "",
        supportEmail: "",
        botCount: 0,
        anyActive: false,
      };
    o.botCount++;
    if (b.isActive !== false) o.anyActive = true;
    if (b.isDefault || !o.businessName) {
      o.businessName = b.businessName || o.businessName;
      o.supportEmail = b.supportEmail || o.supportEmail;
    }
    byOwner.set(b.ownerId, o);
  }

  let rows = [...byOwner.values()]
    .map((o) => {
      const u = userMap.get(o.ownerId);
      return {
        ownerId: o.ownerId,
        businessName: o.businessName,
        supportEmail: o.supportEmail,
        botCount: o.botCount,
        email: u?.email || "",
        name: u?.name || "",
        createdAt: u?.createdAt || null,
        isActive: o.anyActive,
        messages: msgMap.get(o.ownerId)?.messages || 0,
        conversations: convMap.get(o.ownerId) || 0,
        lastActive: msgMap.get(o.ownerId)?.lastActive || null,
      };
    })
    .sort((a, b) => b.messages - a.messages);

  if (q) {
    rows = rows.filter(
      (r) =>
        r.businessName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.supportEmail.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  }

  const total = rows.length;
  const page = rows.slice(skip, skip + limit);

  return NextResponse.json({ clients: page, total });
}
