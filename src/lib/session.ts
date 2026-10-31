import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { isSuperAdmin } from "./auth";

export const SESSION_COOKIE = "session";
// Holds the admin's own token while they are impersonating a client, so they
// can return to their admin session afterwards.
export const ADMIN_RETURN_COOKIE = "admin_return";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "superadmin" | "user";
  // Platform staff role (env superadmin → "superadmin"; otherwise from the DB).
  adminRole?: "superadmin" | "support" | "analyst";
  // Set when this session was started by an admin impersonating this client.
  impersonatedBy?: string; // admin email
  impersonatorId?: string; // admin user id
}

interface Imp {
  byId: string;
  byEmail: string;
}

interface Payload {
  uid: string;
  email: string;
  name: string;
  exp: number;
  imp?: Imp; // present only on impersonation sessions
  ep?: number; // sessionEpoch at issue — lets "log out everywhere" invalidate old tokens
}

function secret() {
  const s = process.env.SESSION_SECRET ?? "";
  if (!s) {
    // Loud, non-fatal warning: with no secret, tokens are signed with "" and
    // verifyToken rejects everything — i.e. nobody can stay logged in.
    console.error(
      "SECURITY: SESSION_SECRET is not set — sessions cannot be verified.",
    );
  }
  return s;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(data: string) {
  return b64url(crypto.createHmac("sha256", secret()).update(data).digest());
}

/** Create a compact HMAC-signed token (JWT-like: payload.signature). */
export function createToken(
  user: { id: string; email: string; name: string },
  imp?: Imp,
  ep?: number,
) {
  const payload: Payload = {
    uid: user.id,
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
    ...(imp ? { imp } : {}),
    ...(typeof ep === "number" ? { ep } : {}),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token?: string): Payload | null {
  if (!token || !secret()) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  // constant-time signature compare
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as Payload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Set the session cookie for a freshly authenticated user. */
export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  sessionEpoch?: number;
}) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createToken(user, undefined, user.sessionEpoch), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: MAX_AGE,
  path: "/",
};

/** Attach a fresh session cookie to a response (works with redirects). */
export function attachSession<T extends NextResponse>(
  res: T,
  user: { id: string; email: string; name: string; sessionEpoch?: number },
): T {
  res.cookies.set(
    SESSION_COOKIE,
    createToken(user, undefined, user.sessionEpoch),
    cookieOptions,
  );
  return res;
}

/** Read + verify the current session. Returns null if unauthenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  // Session revocation: a token carrying an epoch is invalid once the user's
  // current sessionEpoch has moved past it (password change / "log out
  // everywhere"). Fail-open on DB errors so a transient blip doesn't log
  // everyone out; tokens with no epoch (legacy) skip the check.
  if (typeof payload.ep === "number") {
    try {
      const { default: connectDb } = await import("./db");
      const { default: User } = await import("@/model/user.model");
      await connectDb();
      const dbUser = await User.findById(payload.uid)
        .select("sessionEpoch")
        .lean<{ sessionEpoch?: number }>();
      if (dbUser && (dbUser.sessionEpoch || 0) > payload.ep) return null;
    } catch (e) {
      console.error("sessionEpoch check failed (allowing session):", e);
    }
  }

  return {
    id: payload.uid,
    email: payload.email,
    name: payload.name,
    role: isSuperAdmin(payload.email) ? "superadmin" : "user",
    impersonatedBy: payload.imp?.byEmail,
    impersonatorId: payload.imp?.byId,
  };
}

/**
 * Returns the user if they have platform-admin access, else null. Access comes
 * from EITHER an env-var superadmin email OR a DB `adminRole` on their user
 * (support/analyst/superadmin). The returned `adminRole` lets routes apply
 * finer gating (e.g. superadmin-only for managing staff). An impersonating
 * session is NOT treated as admin (it's acting as the client).
 */
export async function requireAdminSession(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.impersonatedBy) return null;
  if (user.role === "superadmin") {
    return { ...user, adminRole: "superadmin" };
  }
  const { default: connectDb } = await import("./db");
  const { default: User } = await import("@/model/user.model");
  await connectDb();
  const dbUser = await User.findById(user.id)
    .select("adminRole")
    .lean<{ adminRole?: "superadmin" | "support" | "analyst" }>();
  if (dbUser?.adminRole) {
    return { ...user, role: "superadmin", adminRole: dbUser.adminRole };
  }
  return null;
}

/**
 * Stricter than requireAdminSession: returns the user ONLY if they are a full
 * superadmin (env-var superadmin email OR DB adminRole === "superadmin").
 * Staff roles (support/analyst) are rejected. Use for powerful, account-level
 * actions — impersonation, changing a client's billing/quota/lifecycle, or
 * enabling/disabling a client's service.
 */
export async function requireSuperAdminSession(): Promise<SessionUser | null> {
  const admin = await requireAdminSession();
  if (!admin || admin.adminRole !== "superadmin") return null;
  return admin;
}
