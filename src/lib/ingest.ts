import mongoose from "mongoose";
import dns from "dns";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import { chunkText } from "@/lib/rag";
import { embedText } from "@/lib/embeddings";

/* ------------------------------------------------------------------ */
/* SSRF protection for user-supplied URL/sitemap fetching.            */
/* Blocks requests to loopback, private, link-local (incl. the cloud  */
/* metadata endpoint 169.254.169.254) and other reserved ranges, and  */
/* re-validates every redirect hop so a public URL can't bounce to an */
/* internal one.                                                      */
/* ------------------------------------------------------------------ */

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0]; // strip zone id
  if (s === "::1" || s === "::") return true; // loopback / unspecified
  if (/^f[cd]/.test(s)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(s)) return true; // fe80::/10 link-local
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

async function assertPublicUrl(parsed: URL): Promise<void> {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must be http or https");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, ""); // unwrap IPv6 literal
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) {
    throw new Error("Refusing to fetch an internal host");
  }
  let addrs: { address: string }[];
  try {
    // Resolves IP literals to themselves, so this covers both names and IPs.
    addrs = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new Error("Could not resolve host");
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Refusing to fetch a private or reserved address");
  }
}

/** fetch() hardened against SSRF: validates the target (and every redirect
 * hop) resolves to a public address before connecting. */
async function safeFetch(
  url: string,
  init: RequestInit,
  maxRedirects = 4,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(current);
    await assertPublicUrl(parsed);
    const res = await fetch(parsed.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, parsed).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

// Hard cap on extracted text we keep from any single source. Protects both the
// DB and the embedding budget from a huge document / page.
export const MAX_EXTRACT_CHARS = 200_000;

function capText(text: string): string {
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  return clean.length > MAX_EXTRACT_CHARS
    ? clean.slice(0, MAX_EXTRACT_CHARS)
    : clean;
}

/**
 * Extract plain text from an uploaded file buffer.
 * Supports PDF (pdf-parse v2), DOCX (mammoth) and TXT/MD (utf-8).
 */
export async function extractFromFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const name = (filename || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  const mime = (mimeType || "").toLowerCase();

  const isPdf = ext === "pdf" || mime === "application/pdf";
  const isDocx =
    ext === "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isText =
    ext === "txt" ||
    ext === "md" ||
    ext === "markdown" ||
    mime.startsWith("text/");

  if (isPdf) {
    try {
      // pdf-parse v2 exposes a PDFParse class (v1's default-function API is gone).
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return capText(result?.text || "");
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (e) {
      throw new Error(
        `Failed to parse PDF: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (isDocx) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return capText(result?.value || "");
    } catch (e) {
      throw new Error(
        `Failed to parse DOCX: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (isText) {
    return capText(buffer.toString("utf-8"));
  }

  throw new Error(
    "Unsupported file type. Allowed: PDF, DOCX, TXT, MD.",
  );
}

export interface UrlExtract {
  text: string;
  title: string;
}

/**
 * Fetch a web page and extract readable text + title using cheerio, stripping
 * scripts, styles, nav, header and footer.
 */
export async function extractFromUrl(url: string): Promise<UrlExtract> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must be http or https");
  }

  let res: Response;
  try {
    res = await safeFetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SahayakAI-KnowledgeBot/1.0; +https://sahayak.ai)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (e) {
    throw new Error(
      `Failed to fetch URL: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, nav, header, footer, svg, iframe, form").remove();

  const title =
    ($("title").first().text() || "").trim() ||
    ($('meta[property="og:title"]').attr("content") || "").trim() ||
    parsed.hostname;

  const bodyText = $("body").text() || $.root().text() || "";
  const text = capText(
    bodyText
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n"),
  );

  return { text, title };
}

// Max number of pages to crawl from a single sitemap, to bound work + cost.
const MAX_SITEMAP_PAGES = 20;

/** Derive the sitemap URL for a given input: use it directly if it already
 * points at a sitemap, otherwise fall back to `<origin>/sitemap.xml`. */
function toSitemapUrl(url: string): string {
  const parsed = new URL(url);
  if (/sitemap[^/]*\.xml$/i.test(parsed.pathname)) return parsed.toString();
  return new URL("/sitemap.xml", parsed.origin).toString();
}

/**
 * Crawl a website via its sitemap. Fetches `<url>/sitemap.xml` (or the given
 * sitemap URL directly), parses the `<loc>` entries (capped at
 * MAX_SITEMAP_PAGES), extracts each page via `extractFromUrl`, and concatenates
 * the results with the page titles as `#` headings. Respects MAX_EXTRACT_CHARS
 * across the whole crawl. Nested sitemap-index `<loc>`s (ending in .xml) are
 * skipped — we only crawl page URLs.
 */
export async function extractFromSitemap(url: string): Promise<UrlExtract> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must be http or https");
  }

  const sitemapUrl = toSitemapUrl(url);

  let res: Response;
  try {
    res = await safeFetch(sitemapUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SahayakAI-KnowledgeBot/1.0; +https://sahayak.ai)",
        Accept: "application/xml,text/xml,*/*",
      },
    });
  } catch (e) {
    throw new Error(
      `Failed to fetch sitemap: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap (HTTP ${res.status})`);
  }

  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const locs: string[] = [];
  $("loc").each((_, el) => {
    const loc = $(el).text().trim();
    // Skip nested sitemap indexes; only crawl actual pages.
    if (loc && !/\.xml$/i.test(loc)) locs.push(loc);
  });

  if (!locs.length) {
    throw new Error("No page URLs found in sitemap.");
  }

  const pages = locs.slice(0, MAX_SITEMAP_PAGES);
  const parts: string[] = [];
  let total = 0;

  for (const pageUrl of pages) {
    if (total >= MAX_EXTRACT_CHARS) break;
    try {
      const { text, title } = await extractFromUrl(pageUrl);
      if (!text.trim()) continue;
      const section = `# ${title || pageUrl}\n\n${text}`;
      parts.push(section);
      total += section.length;
    } catch {
      // Skip pages that fail to fetch/parse; keep crawling the rest.
    }
  }

  if (!parts.length) {
    throw new Error("No readable text found across the sitemap pages.");
  }

  return {
    text: capText(parts.join("\n\n")),
    title: `${parsed.hostname} (sitemap, ${parts.length} pages)`,
  };
}

export interface ChunkAndEmbedArgs {
  botId: mongoose.Types.ObjectId | string;
  ownerId: string;
  sourceId: mongoose.Types.ObjectId | string;
  text: string;
}

/**
 * Chunk the extracted text, embed each chunk as a RETRIEVAL_DOCUMENT, and bulk
 * insert KnowledgeChunk docs tagged with the source. Returns the chunk count.
 */
export async function chunkAndEmbed({
  botId,
  ownerId,
  sourceId,
  text,
}: ChunkAndEmbedArgs): Promise<number> {
  const chunks = chunkText(text || "");
  if (!chunks.length) return 0;

  const docs: {
    botId: mongoose.Types.ObjectId | string;
    ownerId: string;
    content: string;
    embedding: number[];
    sourceId: mongoose.Types.ObjectId | string;
  }[] = [];

  for (const content of chunks) {
    const embedding = await embedText(content, "RETRIEVAL_DOCUMENT");
    docs.push({ botId, ownerId, content, embedding, sourceId });
  }

  if (docs.length) await KnowledgeChunk.insertMany(docs);
  return docs.length;
}
