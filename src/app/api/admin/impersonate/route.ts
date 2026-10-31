import connectDb from "@/lib/db";
import User from "@/model/user.model";
import {
  ADMIN_RETURN_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  createToken,
  requireSuperAdminSession,
} from "@/lib/session";
import { logAdminAction } from "@/lib/audit";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

// Start impersonating a client: swap the admin's session for one that acts as
// the target user, while stashing the admin's own token so they can return.
export async function POST(req: NextRequest) {
  // Superadmin-only: impersonation grants full read/write as the client.
  const admin = await requireSuperAdminSession();
  if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  if (admin.impersonatedBy) {
    return NextResponse.json(
      { message: "Already impersonating. Exit first." },
      { status: 409 },
    );
  }

  const { ownerId } = await req.json().catch(() => ({}));
  if (!ownerId || !mongoose.isValidObjectId(ownerId)) {
    return NextResponse.json({ message: "Valid ownerId required" }, { status: 400 });
  }

  await connectDb();
  const target = await User.findById(ownerId).select("email name").lean<{
    _id: mongoose.Types.ObjectId;
    email: string;
    name: string;
  }>();
  if (!target) {
    return NextResponse.json({ message: "Client not found" }, { status: 404 });
  }

  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;
  if (current) {
    store.set(ADMIN_RETURN_COOKIE, current, cookieOptions);
  }
  const token = createToken(
    { id: String(target._id), email: target.email, name: target.name || "" },
    { byId: admin.id, byEmail: admin.email },
  );
  store.set(SESSION_COOKIE, token, cookieOptions);

  await logAdminAction({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "impersonate.start",
    targetOwnerId: String(target._id),
    targetEmail: target.email,
  });

  return NextResponse.json({ ok: true });
}
