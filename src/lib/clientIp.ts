import { NextRequest } from "next/server";

/**
 * Best-effort client IP for per-IP rate limiting.
 *
 * Proxy headers (`x-real-ip`, `x-forwarded-for`) are only trustworthy when the
 * app runs behind an edge that OVERWRITES them on every request — which Vercel
 * and Cloudflare do. In that setup a client cannot forge them to rotate buckets.
 *
 * If you deploy WITHOUT such an edge (e.g. a bare Node server exposed directly),
 * these headers are client-controlled and spoofable, so set
 * `TRUST_PROXY_HEADERS=0` to stop trusting them. In that mode we return a single
 * shared key — per-IP limits degrade to a global limit rather than being
 * silently bypassed per request.
 */
function trustsProxyHeaders(): boolean {
  const v = (process.env.TRUST_PROXY_HEADERS || "").toLowerCase();
  // Default: trust (the app targets Vercel). Only an explicit opt-out disables.
  return v !== "0" && v !== "false" && v !== "no";
}

export function clientIp(req: NextRequest): string {
  if (!trustsProxyHeaders()) return "no-proxy";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}
