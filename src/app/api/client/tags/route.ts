import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { captureError } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

// Distinct conversation tags for the workspace, with usage counts.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    const rows = await Conversation.aggregate([
      { $match: { ownerId, tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);

    const tags = rows.map((r) => ({ tag: r._id as string, count: r.count as number }));
    return NextResponse.json({ tags });
  } catch (e) {
    captureError(e, { route: "client/tags#list" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// Rename or delete a tag across all the workspace's conversations.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const denied = await requirePermission(user, "agent");
    if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const tag = typeof body.tag === "string" ? body.tag.trim() : "";
    const to = typeof body.to === "string" ? body.to.trim() : "";

    if (!tag || (action !== "rename" && action !== "delete")) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }
    if (action === "rename" && !to) {
      return NextResponse.json({ message: "A target tag is required" }, { status: 400 });
    }

    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);

    if (action === "rename") {
      // Add the new tag to every conversation that has the old one (addToSet
      // de-dupes), then pull the old tag.
      await Conversation.updateMany(
        { ownerId, tags: tag },
        { $addToSet: { tags: to } },
      );
      await Conversation.updateMany(
        { ownerId, tags: tag },
        { $pull: { tags: tag } },
      );
      await logClientAction({
        ownerId,
        actorId: user.id,
        actorName: user.name,
        action: "tag.rename",
        detail: `"${tag}" → "${to}"`,
      });
    } else {
      // delete: pull the tag from every conversation that has it.
      await Conversation.updateMany(
        { ownerId, tags: tag },
        { $pull: { tags: tag } },
      );
      await logClientAction({
        ownerId,
        actorId: user.id,
        actorName: user.name,
        action: "tag.delete",
        detail: `"${tag}"`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    captureError(e, { route: "client/tags#action" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
