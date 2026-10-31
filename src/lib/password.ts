import crypto from "crypto";

const KEYLEN = 64;

/** Hash a plaintext password using scrypt. Format: scrypt$<salt>$<hash>. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

/** Verify a plaintext password against a stored scrypt hash (constant-time). */
export function verifyPassword(password: string, stored?: string): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
