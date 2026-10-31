import connectDb from "@/lib/db";
import User from "@/model/user.model";
import Bot from "@/model/bot.model";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import KnowledgeEntry from "@/model/knowledgeEntry.model";
import KnowledgeSource from "@/model/knowledgeSource.model";
import Memory from "@/model/memory.model";
import CannedResponse from "@/model/cannedResponse.model";
import Settings from "@/model/settings.model";
import { getSessionUser, destroySession } from "@/lib/session";
import { isWorkspaceOwner } from "@/lib/team";
import { verifyPassword } from "@/lib/password";
import { deleteImage } from "@/lib/cloudinary";
import { NextRequest, NextResponse } from "next/server";

/**
 * Current account status for the dashboard Account panel.
 * GET → { email, provider, hasPassword }
 *
 * `hasPassword` tells the UI whether to ask for a current password (change)
 * or let a Google-only user set one for the first time.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  const dbUser = await User.findById(user.id).select("email provider passwordHash");
  if (!dbUser) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    email: dbUser.email,
    provider: dbUser.provider,
    hasPassword: Boolean(dbUser.passwordHash),
  });
}

/**
 * Permanently delete the current workspace owner's account and all of its data.
 * DELETE { password }
 *
 * Only the workspace owner may do this — invited agents cannot delete the
 * workspace. Everything keyed by the owner's id is cascade-deleted.
 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // An admin impersonating a client must NOT be able to destroy their account.
  if (user.impersonatedBy || user.impersonatorId) {
    return NextResponse.json(
      { message: "Account deletion is disabled while impersonating." },
      { status: 403 },
    );
  }

  await connectDb();

  if (!(await isWorkspaceOwner(user))) {
    return NextResponse.json(
      { message: "Only the workspace owner can delete the account" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";

  const dbUser = await User.findById(user.id);
  if (!dbUser) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (dbUser.passwordHash) {
    // Password-protected accounts must confirm with their password.
    if (!verifyPassword(password, dbUser.passwordHash)) {
      return NextResponse.json(
        { message: "Password is incorrect" },
        { status: 400 },
      );
    }
  } else {
    // Google-only accounts have no password — require an explicit typed
    // confirmation instead so a bare session can't silently nuke the workspace.
    if (confirm.trim().toUpperCase() !== "DELETE") {
      return NextResponse.json(
        { message: 'Type DELETE to confirm account deletion.' },
        { status: 400 },
      );
    }
  }

  const ownerId = user.id;

  // Best-effort cleanup of any uploaded bot avatars in Cloudinary.
  const bots = await Bot.find({ ownerId })
    .select("avatarPublicId")
    .lean<{ avatarPublicId?: string }[]>();
  await Promise.all(
    bots
      .map((b) => b.avatarPublicId)
      .filter((id): id is string => Boolean(id))
      .map((id) => deleteImage(id)),
  );

  // Cascade-delete every collection scoped to this owner, plus the team agents.
  await Promise.all([
    Bot.deleteMany({ ownerId }),
    Conversation.deleteMany({ ownerId }),
    Message.deleteMany({ ownerId }),
    KnowledgeChunk.deleteMany({ ownerId }),
    KnowledgeEntry.deleteMany({ ownerId }),
    KnowledgeSource.deleteMany({ ownerId }),
    Memory.deleteMany({ ownerId }),
    CannedResponse.deleteMany({ ownerId }),
    Settings.deleteOne({ ownerId }),
    User.deleteMany({ parentOwnerId: ownerId }),
  ]);

  // Finally remove the owner user itself.
  await User.deleteOne({ _id: ownerId });

  // Clear the session cookie.
  await destroySession();

  return NextResponse.json({ ok: true });
}
