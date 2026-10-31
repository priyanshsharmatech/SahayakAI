import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("produces a scrypt$salt$hash formatted string", () => {
    const h = hashPassword("s3cret!");
    const parts = h.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(parts).toHaveLength(3);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it("uses a random salt so two hashes of the same password differ", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("verifies a correct password (round-trip)", () => {
    const h = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", h)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const h = hashPassword("right");
    expect(verifyPassword("wrong", h)).toBe(false);
  });

  it("rejects when no stored hash is provided", () => {
    expect(verifyPassword("anything")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });

  it("rejects a malformed stored hash", () => {
    expect(verifyPassword("x", "notscrypt$salt$hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlysalt")).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});
