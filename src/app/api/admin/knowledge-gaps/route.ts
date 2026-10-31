import connectDb from "@/lib/db";
import Message from "@/model/message.model";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

/**
 * Platform-wide knowledge gaps: unanswered visitor questions across ALL
 * tenants, grouped by normalized content, top ~50 by frequency then recency.
 */
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    await connectDb();
    const gaps = await Message.aggregate([
      { $match: { role: "user", fallback: true, resolved: false } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$content" } } },
          question: { $first: "$content" },
          count: { $sum: 1 },
          lastAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1, lastAt: -1 } },
      { $limit: 50 },
      { $project: { _id: 0, question: 1, count: 1, lastAt: 1 } },
    ]);
    return NextResponse.json({ gaps });
  } catch (e) {
    console.error("admin/knowledge-gaps GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
