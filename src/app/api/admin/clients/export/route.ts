import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import User from "@/model/user.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import ClientProfile from "@/model/clientProfile.model";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * CSV export of all clients: ownerId, business, email, bots, conversations,
 * messages, lastActive, lifecycle. Mirrors the clients-list aggregation.
 */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    await connectDb();
    const [bots, users, msgAgg, convAgg, profiles] = await Promise.all([
      Bot.find().select("ownerId businessName isDefault").lean(),
      User.find().select("email").lean(),
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
      ClientProfile.find().select("ownerId lifecycle").lean(),
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u.email || ""]));
    const msgMap = new Map(msgAgg.map((m) => [m._id, m]));
    const convMap = new Map(convAgg.map((c) => [c._id, c.conversations]));
    const lifecycleMap = new Map(
      profiles.map((p) => [String(p.ownerId), p.lifecycle || "active"]),
    );

    const byOwner = new Map<
      string,
      { ownerId: string; business: string; botCount: number }
    >();
    for (const b of bots) {
      const o =
        byOwner.get(b.ownerId) || {
          ownerId: b.ownerId,
          business: "",
          botCount: 0,
        };
      o.botCount++;
      if (b.isDefault || !o.business) {
        o.business = b.businessName || o.business;
      }
      byOwner.set(b.ownerId, o);
    }

    const rows = [...byOwner.values()]
      .map((o) => ({
        ownerId: o.ownerId,
        business: o.business,
        email: userMap.get(o.ownerId) || "",
        bots: o.botCount,
        conversations: convMap.get(o.ownerId) || 0,
        messages: msgMap.get(o.ownerId)?.messages || 0,
        lastActive: msgMap.get(o.ownerId)?.lastActive
          ? new Date(msgMap.get(o.ownerId).lastActive).toISOString()
          : "",
        lifecycle: lifecycleMap.get(o.ownerId) || "active",
      }))
      .sort((a, b) => b.messages - a.messages);

    const header = [
      "ownerId",
      "business",
      "email",
      "bots",
      "conversations",
      "messages",
      "lastActive",
      "lifecycle",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.ownerId,
          r.business,
          r.email,
          r.bots,
          r.conversations,
          r.messages,
          r.lastActive,
          r.lifecycle,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const csv = lines.join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="clients.csv"',
      },
    });
  } catch (e) {
    console.error("admin/clients/export GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
