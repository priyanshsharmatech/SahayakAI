import { describe, it, expect } from "vitest";
import { parseUserAgent, extractIdentity } from "@/lib/visitor";

describe("parseUserAgent", () => {
  it("detects Windows + Chrome desktop", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({
      browser: "Chrome",
      os: "Windows",
      device: "Desktop",
    });
  });

  it("detects iOS Safari mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("iOS");
    expect(r.device).toBe("Mobile");
    expect(r.browser).toBe("Safari");
  });

  it("detects Android Chrome as mobile", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("Android");
    expect(r.device).toBe("Mobile");
    expect(r.browser).toBe("Chrome");
  });

  it("detects Edge before Chrome", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0";
    expect(parseUserAgent(ua).browser).toBe("Edge");
  });

  it("defaults to Desktop and empty fields for an empty UA", () => {
    expect(parseUserAgent("")).toEqual({ browser: "", os: "", device: "Desktop" });
    expect(parseUserAgent()).toEqual({ browser: "", os: "", device: "Desktop" });
  });
});

describe("extractIdentity", () => {
  it("lowercases email and keeps name/userId", () => {
    const id = extractIdentity({
      name: "Jane Doe",
      email: "Jane.Doe@Example.COM",
      userId: "u_123",
    });
    expect(id.name).toBe("Jane Doe");
    expect(id.email).toBe("jane.doe@example.com");
    expect(id.userId).toBe("u_123");
    expect(id.attributes).toEqual({});
  });

  it("returns empty strings for a missing visitor", () => {
    expect(extractIdentity()).toEqual({
      name: "",
      email: "",
      userId: "",
      attributes: {},
    });
  });

  it("stringifies attribute values and caps the count at 20", () => {
    const attributes: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) attributes[`k${i}`] = i;
    const id = extractIdentity({ attributes });
    expect(Object.keys(id.attributes)).toHaveLength(20);
    expect(id.attributes["k0"]).toBe("0");
  });

  it("truncates overly long values", () => {
    const id = extractIdentity({ name: "x".repeat(500) });
    expect(id.name.length).toBe(120);
  });
});
