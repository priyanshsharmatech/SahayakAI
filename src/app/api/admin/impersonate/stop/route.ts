import {
  ADMIN_RETURN_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  getSessionUser,
  verifyToken,
} from "@/lib/session";
import { logAdminAction } from "@/lib/audit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Stop impersonating: restore the admin's stashed session.
export async function POST() {
  const current = await getSessionUser();
  const store = await cookies();
  const ret = store.get(ADMIN_RETURN_COOKIE)?.value;

  // Always clear the return cookie.
  store.set(ADMIN_RETURN_COOKIE, "", { ...cookieOptions, maxAge: 0 });

  const adminPayload = verifyToken(ret);
  if (adminPayload) {
    // Restore the admin's original (still-valid) session token verbatim.
    store.set(SESSION_COOKIE, ret as string, cookieOptions);
  } else {
    // Nothing valid to return to — drop the impersonation session entirely.
    store.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  }

  if (current?.impersonatorId) {
    await logAdminAction({
      actorId: current.impersonatorId,
      actorEmail: current.impersonatedBy || "",
      action: "impersonate.stop",
      targetOwnerId: current.id,
      targetEmail: current.email,
    });
  }

  return NextResponse.json({ ok: true, restored: Boolean(adminPayload) });
}
