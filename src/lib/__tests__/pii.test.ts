import { describe, it, expect } from "vitest";
import { redactPII } from "@/lib/pii";

describe("redactPII", () => {
  it("returns falsy input unchanged", () => {
    expect(redactPII("")).toBe("");
  });

  it("masks email addresses", () => {
    expect(redactPII("reach me at john.doe@example.com please")).toBe(
      "reach me at [redacted-email] please",
    );
  });

  it("masks emails with plus-tags and subdomains", () => {
    expect(redactPII("a+tag@mail.co.uk")).toBe("[redacted-email]");
  });

  it("masks card-like digit runs", () => {
    // the digit+separator run is replaced wholesale (the trailing separator is
    // part of the matched run), so assert on presence rather than exact spacing
    const out = redactPII("card 4111 1111 1111 1111 end");
    expect(out).toContain("[redacted-card]");
    expect(out).not.toMatch(/\d/);
    expect(redactPII("4111-1111-1111-1111")).toBe("[redacted-card]");
  });

  it("masks phone numbers", () => {
    expect(redactPII("call +1 415 555 2671 now")).toContain("[redacted-phone]");
    expect(redactPII("call +1 415 555 2671 now")).not.toMatch(/\d{3}/);
  });

  it("leaves normal prose intact", () => {
    const text = "The meeting is at 3pm on Tuesday in room 4.";
    expect(redactPII(text)).toBe(text);
  });

  it("does not redact a short standalone number", () => {
    expect(redactPII("order 42 shipped")).toBe("order 42 shipped");
  });

  it("redacts multiple PII items in one string", () => {
    const out = redactPII("mail a@b.com or call +44 20 7946 0958");
    expect(out).toContain("[redacted-email]");
    expect(out).toContain("[redacted-phone]");
    expect(out).not.toContain("a@b.com");
  });
});
