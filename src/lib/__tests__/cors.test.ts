import { describe, it, expect } from "vitest";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";

describe("resolveAllowOrigin", () => {
  it('returns "*" when no allowlist is configured', () => {
    expect(resolveAllowOrigin("https://foo.com")).toBe("*");
    expect(resolveAllowOrigin("https://foo.com", [])).toBe("*");
    expect(resolveAllowOrigin(undefined)).toBe("*");
  });

  it("echoes an allowed exact origin", () => {
    expect(
      resolveAllowOrigin("https://app.example.com", ["app.example.com"]),
    ).toBe("https://app.example.com");
  });

  it("matches an allowlist entry that includes scheme/path", () => {
    expect(
      resolveAllowOrigin("https://app.example.com", [
        "https://app.example.com/widget",
      ]),
    ).toBe("https://app.example.com");
  });

  it("is case-insensitive on the host", () => {
    expect(
      resolveAllowOrigin("https://APP.Example.com", ["app.example.com"]),
    ).toBe("https://APP.Example.com");
  });

  it('returns "null" for a disallowed origin', () => {
    expect(
      resolveAllowOrigin("https://evil.com", ["app.example.com"]),
    ).toBe("null");
  });

  it('returns "null" when an allowlist exists but origin is missing', () => {
    expect(resolveAllowOrigin(null, ["app.example.com"])).toBe("null");
    expect(resolveAllowOrigin(undefined, ["app.example.com"])).toBe("null");
    expect(resolveAllowOrigin("", ["app.example.com"])).toBe("null");
  });

  it('returns "null" for an invalid origin string', () => {
    expect(resolveAllowOrigin("not a url", ["app.example.com"])).toBe("null");
  });

  it("supports *.example.com wildcard subdomains", () => {
    expect(
      resolveAllowOrigin("https://shop.example.com", ["*.example.com"]),
    ).toBe("https://shop.example.com");
    expect(
      resolveAllowOrigin("https://a.b.example.com", ["*.example.com"]),
    ).toBe("https://a.b.example.com");
    // the apex itself also matches the wildcard
    expect(
      resolveAllowOrigin("https://example.com", ["*.example.com"]),
    ).toBe("https://example.com");
  });

  it("does not let a wildcard match an unrelated suffix", () => {
    expect(
      resolveAllowOrigin("https://example.com.evil.com", ["*.example.com"]),
    ).toBe("null");
    expect(
      resolveAllowOrigin("https://notexample.com", ["*.example.com"]),
    ).toBe("null");
  });

  it("ignores blank allowlist entries", () => {
    expect(
      resolveAllowOrigin("https://evil.com", ["", "   "]),
    ).toBe("null");
  });
});

describe("corsHeaders", () => {
  it("returns the expected header shape with defaults", () => {
    const h = corsHeaders("*");
    expect(h).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    });
  });

  it("echoes the given origin and custom methods", () => {
    const h = corsHeaders("https://app.example.com", "GET, OPTIONS");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(h["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
    expect(h["Vary"]).toBe("Origin");
  });
});
