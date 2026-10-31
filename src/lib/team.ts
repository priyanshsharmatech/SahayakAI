import connectDb from "@/lib/db";
import User from "@/model/user.model";
import type { SessionUser } from "@/lib/session";

/**
 * Team support: an "agent" user belongs to an "owner" account via parentOwnerId
 * and operates inside that owner's workspace. All tenant-scoped data (bots,
 * conversations, knowledge, analytics) is keyed by the OWNER's id — so dashboard
 * routes must scope by the *effective* owner id, not the raw session user id.
 */

/** Returns the owner id whose workspace this session user operates in. */
export async function getEffectiveOwnerId(user: SessionUser): Promise<string> {
  await connectDb();
  const dbUser = await User.findById(user.id).select("teamRole parentOwnerId").lean<{
    teamRole?: string;
    parentOwnerId?: string;
  }>();
  if (dbUser?.teamRole === "agent" && dbUser.parentOwnerId) {
    return dbUser.parentOwnerId;
  }
  return user.id;
}

/** True when the session user is the workspace owner (not an invited agent). */
export async function isWorkspaceOwner(user: SessionUser): Promise<boolean> {
  await connectDb();
  const dbUser = await User.findById(user.id).select("teamRole").lean<{
    teamRole?: string;
  }>();
  return !dbUser || dbUser.teamRole !== "agent";
}

/* ------------------------------------------------------------------ */
/* Permission levels inside a workspace.                              */
/*   owner   — the workspace owner (full control)                     */
/*   manager — invited member who may change bots/knowledge/settings  */
/*   agent   — invited member who may handle conversations            */
/*   viewer  — read-only invited member                              */
/* An owner always outranks every agent permission.                  */
/* ------------------------------------------------------------------ */
export type Permission = "viewer" | "agent" | "manager" | "owner";

const RANK: Record<Permission, number> = {
  viewer: 0,
  agent: 1,
  manager: 2,
  owner: 3,
};

/** Resolve the session user's effective permission in their workspace. */
export async function getPermission(user: SessionUser): Promise<Permission> {
  await connectDb();
  const dbUser = await User.findById(user.id)
    .select("teamRole agentPermission")
    .lean<{ teamRole?: string; agentPermission?: Permission }>();
  // Anyone who isn't an invited agent is the owner → full control.
  if (!dbUser || dbUser.teamRole !== "agent") return "owner";
  return dbUser.agentPermission || "agent";
}

/** True when the user's permission meets or exceeds `min`. */
export async function hasPermission(
  user: SessionUser,
  min: Permission,
): Promise<boolean> {
  const p = await getPermission(user);
  return RANK[p] >= RANK[min];
}

/**
 * Guard a route by minimum permission. Returns a 403 NextResponse-ready error
 * payload (via a thrown PermissionError) when the user is below `min`.
 * Usage in a route:
 *   const denied = await requirePermission(user, "manager");
 *   if (denied) return denied;
 */
export async function requirePermission(
  user: SessionUser,
  min: Permission,
): Promise<{ status: 403; message: string } | null> {
  if (await hasPermission(user, min)) return null;
  return {
    status: 403,
    message:
      min === "manager"
        ? "Your role doesn't allow changing this. Ask a workspace manager or the owner."
        : "Your role is read-only. Ask a workspace manager or the owner.",
  };
}
