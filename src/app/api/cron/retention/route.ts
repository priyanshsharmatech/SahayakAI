import { purgeAll } from "@/lib/retention";
import { captureError } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow a few minutes for a large sweep (Vercel caps this per plan).
export const maxDuration = 300;

/**
 * Scheduled data-retention purge across ALL owners. Triggered by Vercel Cron
 * (see vercel.json) or any external scheduler.
 *
 * Auth: requires CRON_SECRET to be set and supplied as either
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this automatically)
 * or ?key=<CRON_SECRET>. If CRON_SECRET is unset the endpoint is closed (403),
 * so it can never run unprotected.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided = bearer ?? new URL(req.url).searchParams.get("key");

  if (!secret || provided !== secret) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await purgeAll();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    captureError(e, { route: "cron/retention" });
    return NextResponse.json({ message: "Purge failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
