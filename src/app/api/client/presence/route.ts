import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import { NextRequest, NextResponse } from "next/server";

type Presence = "online" | "away" | "offline";
const VALID: Presence[] = ["online", "away", "offline"];

// Presence older than this is treated as "offline" (the agent went silent).
const STALE_MS = 2 * 60 * 1000;

// Set the current user's presence.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { status } = await req.json().catch(() => ({}));
  if (!VALID.includes(status)) {
    return NextResponse.json(
      { message: "status must be online, away, or offline" },
      { status: 400 },
    );
  }

  await connectDb();
  await User.updateOne(
    { _id: user.id },
    { presence: status, presenceAt: new Date() },
  );

  return NextResponse.json({ ok: true });
}

// List presence for everyone in the workspace (the owner + their agents).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const users = await User.find({
    $or: [{ _id: ownerId }, { parentOwnerId: ownerId }],
  })
    .select("name email presence presenceAt")
    .lean<
      {
        _id: unknown;
        name?: string;
        email?: string;
        presence?: Presence;
        presenceAt?: Date;
      }[]
    >();

  const now = Date.now();
  const members = users.map((u) => {
    const at = u.presenceAt ? new Date(u.presenceAt) : undefined;
    const stale = !at || now - at.getTime() > STALE_MS;
    const presence: Presence = stale ? "offline" : u.presence || "offline";
    return {
      _id: u._id,
      name: u.name || "",
      email: u.email || "",
      presence,
      presenceAt: at,
    };
  });

  return NextResponse.json({ members });
}
