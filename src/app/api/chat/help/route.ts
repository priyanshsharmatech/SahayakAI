import connectDb from "@/lib/db";
import KnowledgeEntry from "@/model/knowledgeEntry.model";
import { resolveBot } from "@/lib/bot";
import { embedText, topK } from "@/lib/embeddings";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/ratelimit";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_RESULTS = 5;

function withCors(res: NextResponse, allowOrigin: string) {
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin, "GET, OPTIONS")))
    res.headers.set(k, v);
  return res;
}

type EntryLean = { question: string; answer: string; embedding: number[] };

/** Escapes a user string for safe use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Public help-center search for the widget. Returns the bot's most relevant
 * curated Q&A (KnowledgeEntry). Prefers a semantic (embedding) match, falling
 * back to a case-insensitive regex on question/answer when embedding fails.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const { searchParams } = new URL(req.url);
    const botId = searchParams.get("botId") || undefined;
    const ownerId = searchParams.get("ownerId") || undefined;
    const q = (searchParams.get("q") || "").trim();

    await connectDb();

    const ip = clientIp(req);
    const rl = rateLimit(`help:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return withCors(
        NextResponse.json(
          { message: "Too many requests", retryAfter: rl.retryAfter },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        ),
        resolveAllowOrigin(origin, undefined),
      );
    }

    const bot = await resolveBot(botId, ownerId);
    if (!bot) {
      return withCors(
        NextResponse.json({ message: "Bot not found" }, { status: 404 }),
        resolveAllowOrigin(origin, undefined),
      );
    }

    const allowOrigin = resolveAllowOrigin(origin, bot.allowedDomains);

    if (!q) {
      return withCors(NextResponse.json({ results: [] }), allowOrigin);
    }

    const entries = (await KnowledgeEntry.find({ botId: bot._id })
      .select("question answer embedding")
      .lean()) as unknown as EntryLean[];

    if (!entries.length) {
      return withCors(NextResponse.json({ results: [] }), allowOrigin);
    }

    // Prefer semantic ranking; fall back to regex on any embedding failure.
    let results: { question: string; answer: string }[] | null = null;
    try {
      const queryVec = await embedText(q);
      const hits = topK(
        queryVec,
        entries.filter((e) => Array.isArray(e.embedding) && e.embedding.length),
        MAX_RESULTS,
        0,
      );
      results = hits.map((e) => ({ question: e.question, answer: e.answer }));
    } catch {
      results = null; // fall through to regex
    }

    if (!results || !results.length) {
      const re = new RegExp(escapeRegex(q), "i");
      results = entries
        .filter((e) => re.test(e.question || "") || re.test(e.answer || ""))
        .slice(0, MAX_RESULTS)
        .map((e) => ({ question: e.question, answer: e.answer }));
    }

    return withCors(NextResponse.json({ results }), allowOrigin);
  } catch {
    return withCors(
      NextResponse.json({ message: "Something went wrong" }, { status: 500 }),
      resolveAllowOrigin(origin, undefined),
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const allowOrigin = resolveAllowOrigin(req.headers.get("origin"), undefined);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(allowOrigin, "GET, OPTIONS"),
  });
}
