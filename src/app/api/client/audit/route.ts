import connectDb from "@/lib/db";
import ClientAudit from "@/model/clientAudit.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import { NextRequest, NextResponse } from "next/server";

// Paginated workspace audit log, newest first.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const { searchParams } = new URL(req.url);
    const skipParam = parseInt(searchParams.get("skip") || "0", 10);
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const skip = Math.max(0, Number.isNaN(skipParam) ? 0 : skipParam);
    const limit = Math.min(200, Math.max(1, Number.isNaN(limitParam) ? 50 : limitParam));

    const [entries, total] = await Promise.all([
      ClientAudit.find({ ownerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("actorName action detail createdAt")
        .lean(),
      ClientAudit.countDocuments({ ownerId }),
    ]);

    return NextResponse.json({ entries, total });
  } catch (e) {
    console.error("Client audit list failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
