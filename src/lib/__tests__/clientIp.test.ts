import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/clientIp";

// Minimal stand-in: clientIp only ever calls req.headers.get(...).
function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("clientIp", () => {
  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = reqWith({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("trims whitespace around x-real-ip", () => {
    expect(clientIp(reqWith({ "x-real-ip": "  203.0.113.7  " }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to the first x-forwarded-for hop", () => {
    const req = reqWith({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
    expect(clientIp(req)).toBe("198.51.100.1");
  });

  it("trims the first forwarded hop", () => {
    const req = reqWith({ "x-forwarded-for": "  198.51.100.1  , 10.0.0.1" });
    expect(clientIp(req)).toBe("198.51.100.1");
  });

  it('returns "unknown" when no ip headers are present', () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});
