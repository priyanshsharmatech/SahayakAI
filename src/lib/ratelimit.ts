/**
 * Simple in-memory fixed-window rate limiter.
 *
 * NOTE: in-memory means per-process — on serverless/multi-instance hosting this
 * limits per instance, not globally. For strict global limits in production,
 * back this with Redis/Upstash. It still meaningfully blocks single-origin
 * floods and abuse in dev and single-instance deployments.
 */
type Bucket = { count: number; reset: number };
const store = new Map<string, Bucket>();

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of store) if (now > b.reset) store.delete(k);
}

export interface RateResult {
  ok: boolean;
  retryAfter: number; // seconds
}

/** Allow `limit` requests per `windowMs` for `key`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const b = store.get(key);
  if (!b || now > b.reset) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
  b.count++;
  return { ok: true, retryAfter: 0 };
}
