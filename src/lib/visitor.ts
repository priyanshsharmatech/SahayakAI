import { NextRequest } from "next/server";

function str(v: unknown, max = 300): string {
  if (v === undefined || v === null) return "";
  return String(v).slice(0, max);
}

/** Best-effort browser / OS / device from a user-agent string. */
export function parseUserAgent(ua = "") {
  const s = ua.toLowerCase();

  let os = "";
  if (/windows/.test(s)) os = "Windows";
  else if (/android/.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/mac os x|macintosh/.test(s)) os = "macOS";
  else if (/linux/.test(s)) os = "Linux";

  let browser = "";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/chrome|crios/.test(s)) browser = "Chrome";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/safari/.test(s)) browser = "Safari";

  let device = "Desktop";
  if (/ipad|tablet/.test(s)) device = "Tablet";
  else if (/mobile|iphone|ipod|android/.test(s)) device = "Mobile";

  return { browser, os, device };
}

/** Approximate location from CDN/proxy geo headers (Vercel, Cloudflare). */
export function geoFromHeaders(req: NextRequest) {
  const h = req.headers;
  const dec = (v: string | null) => {
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const country = h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "";
  const city = dec(h.get("x-vercel-ip-city"));
  const region = dec(h.get("x-vercel-ip-country-region"));
  return { country: str(country, 8), city: str(city, 120), region: str(region, 120) };
}

export interface VisitorInput {
  name?: string;
  email?: string;
  userId?: string;
  attributes?: Record<string, unknown>;
  context?: {
    page?: string;
    referrer?: string;
    userAgent?: string;
    language?: string;
    timezone?: string;
  };
}

/** Auto-captured, non-identifying context for a conversation. */
export function buildVisitorMeta(req: NextRequest, visitor: VisitorInput = {}) {
  const ctx = visitor.context || {};
  const ua = str(ctx.userAgent || req.headers.get("user-agent"), 400);
  const { browser, os, device } = parseUserAgent(ua);
  const { country, city, region } = geoFromHeaders(req);
  return {
    page: str(ctx.page, 500),
    referrer: str(ctx.referrer, 500),
    userAgent: ua,
    browser,
    os,
    device,
    language: str(ctx.language, 32),
    timezone: str(ctx.timezone, 64),
    country,
    city: [city, region].filter(Boolean).join(", "),
  };
}

/** Identity provided by the host site (data-user-* / identify()). */
export function extractIdentity(visitor: VisitorInput = {}) {
  const attributes: Record<string, string> = {};
  if (visitor.attributes && typeof visitor.attributes === "object") {
    for (const [k, v] of Object.entries(visitor.attributes).slice(0, 20)) {
      if (k) attributes[str(k, 40)] = str(v, 200);
    }
  }
  return {
    name: str(visitor.name, 120),
    email: str(visitor.email, 200).toLowerCase(),
    userId: str(visitor.userId, 120),
    attributes,
  };
}
