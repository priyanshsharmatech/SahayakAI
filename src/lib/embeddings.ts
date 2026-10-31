import { GoogleGenAI } from "@google/genai";

// gemini-embedding-001 is the current GA embedding model. The older
// text-embedding-004 now 404s on the v1beta Developer API for many keys.
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
// Keep vectors compact + consistent (gemini-embedding-001 defaults to 3072).
const EMBED_DIM = Number(process.env.GEMINI_EMBED_DIM) || 768;

// Gemini embedding task types. Using the right one noticeably improves
// retrieval quality: documents and queries are embedded into a space tuned
// for asymmetric search.
export type EmbedTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

// Gemini embedding models cap input length; keep well under it so a single
// oversized chunk can never blow up a request.
const MAX_EMBED_CHARS = 8000;

function client() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/**
 * Embed a single string into a vector using Gemini.
 *
 * `taskType` defaults to RETRIEVAL_QUERY so existing callers that embed a
 * search query (e.g. the chat route's `embedText(message)`) stay correct.
 * Stored knowledge should be embedded with RETRIEVAL_DOCUMENT.
 */
export async function embedText(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_QUERY",
): Promise<number[]> {
  const input = (text ?? "").trim();
  if (!input) {
    throw new Error("Cannot embed empty text");
  }
  const truncated =
    input.length > MAX_EMBED_CHARS ? input.slice(0, MAX_EMBED_CHARS) : input;

  const res = (await client().models.embedContent({
    model: EMBED_MODEL,
    contents: truncated,
    config: { taskType, outputDimensionality: EMBED_DIM },
  })) as {
    embeddings?: { values?: number[] }[];
    embedding?: { values?: number[] };
  };
  const values = res?.embeddings?.[0]?.values ?? res?.embedding?.values;
  if (!values || !values.length) {
    throw new Error("No embedding returned from Gemini");
  }
  return values;
}

/** Embed many strings (sequential — fine for the small batches we index). */
export async function embedMany(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embedText(t, taskType));
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

/**
 * Ranks items (each carrying an `embedding`) by cosine similarity to `query`
 * and returns the top `k` above `minScore`, each tagged with its `score`.
 */
export function topK<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  k: number,
  minScore = 0,
): (T & { score: number })[] {
  return items
    .map((it) => ({ ...it, score: cosineSimilarity(query, it.embedding) }))
    .filter((it) => it.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
