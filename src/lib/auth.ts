/**
 * A user is a superadmin when their account email is present in the
 * SUPER_ADMIN_EMAIL / SUPER_ADMIN_EMAILS env vars (comma-separated, case-insensitive).
 */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email) {
    return false;
  }
  const raw = `${process.env.SUPER_ADMIN_EMAIL ?? ""},${process.env.SUPER_ADMIN_EMAILS ?? ""}`;
  const allowlist = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
