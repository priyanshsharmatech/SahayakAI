import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/ratelimit";

// Unique keys per test keep the shared in-memory store from leaking between cases.
let n = 0;
const key = () => `test-${Date.now()}-${n++}`;

describe("rateLimit", () => {
  it("allows up to `limit` requests within the window", () => {
    const k = key();
    expect(rateLimit(k, 3, 10_000).ok).toBe(true);
    expect(rateLimit(k, 3, 10_000).ok).toBe(true);
    expect(rateLimit(k, 3, 10_000).ok).toBe(true);
  });

  it("blocks the request past the limit with a positive retryAfter", () => {
    const k = key();
    rateLimit(k, 2, 10_000);
    rateLimit(k, 2, 10_000);
    const blocked = rateLimit(k, 2, 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfter).toBeLessThanOrEqual(10);
  });

  it("returns retryAfter of 0 while still allowed", () => {
    const k = key();
    const first = rateLimit(k, 5, 10_000);
    expect(first).toEqual({ ok: true, retryAfter: 0 });
  });

  it("isolates counts across different keys", () => {
    const a = key();
    const b = key();
    expect(rateLimit(a, 1, 10_000).ok).toBe(true);
    expect(rateLimit(a, 1, 10_000).ok).toBe(false);
    // a fresh key is unaffected by a's exhausted bucket
    expect(rateLimit(b, 1, 10_000).ok).toBe(true);
  });

  it("resets and allows again after the window elapses", async () => {
    const k = key();
    expect(rateLimit(k, 1, 20).ok).toBe(true);
    expect(rateLimit(k, 1, 20).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    // window has passed, bucket resets
    expect(rateLimit(k, 1, 20).ok).toBe(true);
  });
});
