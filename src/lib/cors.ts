/**
 * Per-bot CORS. If a bot defines `allowedDomains`, only those origins get an
 * echoed Access-Control-Allow-Origin (others get "null", which browsers block).
 * When no allowlist is configured, falls back to "*" (open embed, back-compat).
 * Supports exact hosts and "*.example.com" wildcard subdomains.
 */
export function resolveAllowOrigin(
  origin: string | null | undefined,
  allowed?: string[],
): string {
  if (!allowed || allowed.length === 0) return "*";
  if (!origin) return "null";
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return "null";
  }
  const match = allowed.some((raw) => {
    const d = (raw || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!d) return false;
    if (d.startsWith("*.")) {
      const base = d.slice(2);
      return host === base || host.endsWith("." + base);
    }
    return host === d;
  });
  return match ? origin : "null";
}

export function corsHeaders(
  allowOrigin: string,
  methods = "POST, OPTIONS",
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
