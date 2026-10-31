import KnowledgeChunk from "@/model/knowledgeChunk.model";
import KnowledgeEntry from "@/model/knowledgeEntry.model";
import KnowledgeSource from "@/model/knowledgeSource.model";
import Memory from "@/model/memory.model";
import { embedText, topK } from "@/lib/embeddings";
import mongoose from "mongoose";

export interface RetrievedSource {
  title?: string;
  url?: string;
  snippet?: string;
}

export interface RetrievedContext {
  knowledgeChunks: string[];
  examples: { question: string; answer: string }[];
  // Resolved citations for the knowledge chunks that were injected, so the UI
  // can show "sources" and the caller can gauge confidence via `topScore`.
  sources: RetrievedSource[];
  // Highest cosine similarity among the returned knowledge chunks (0 if none).
  topScore: number;
}

// Characters of a chunk to keep as a citation snippet.
const SNIPPET_LEN = 140;

// Minimum cosine similarity for a raw knowledge chunk to be injected into the
// prompt. Below this a chunk is almost certainly off-topic and only adds noise.
const CHUNK_MIN_SCORE = 0.5;

/** Prepends a trailing slice of the previous chunk so facts that straddle a
 * boundary stay retrievable. ~15% overlap. */
function withOverlap(chunks: string[], maxLen: number): string[] {
  if (chunks.length <= 1) return chunks;
  const overlap = Math.floor(maxLen * 0.15);
  if (overlap <= 0) return chunks;
  const out: string[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const tail = prev.length > overlap ? prev.slice(prev.length - overlap) : prev;
    out.push(`${tail.trim()} ${chunks[i]}`.trim());
  }
  return out;
}

/** Splits knowledge text into reasonably sized, embeddable chunks (with a
 * small overlap between adjacent chunks). */
export function chunkText(text: string, maxLen = 700): string[] {
  if (!text) return [];
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const p of paras) {
    if (p.length <= maxLen) {
      chunks.push(p);
      continue;
    }
    // Break a long paragraph into sentence-grouped chunks.
    const sentences = p.split(/(?<=[.!?])\s+/);
    let cur = "";
    for (const s of sentences) {
      if ((cur + " " + s).length > maxLen) {
        if (cur) chunks.push(cur.trim());
        cur = s;
      } else {
        cur = cur ? cur + " " + s : s;
      }
    }
    if (cur) chunks.push(cur.trim());
  }
  return withOverlap(chunks.slice(0, 200), maxLen);
}

/**
 * Rebuilds the vector index for a bot's knowledge base from its raw `knowledge`
 * textarea. Only chunks WITHOUT a sourceId are rebuilt here — chunks ingested
 * from uploaded files / crawled URLs (which carry a sourceId) are managed
 * independently and left untouched.
 *
 * Done atomic-ish: all new chunk docs are built (embedded) first, and only then
 * do we delete the old ones and insert the new ones — so a failure mid-embed
 * leaves the previous index intact rather than wiping the bot's knowledge.
 */
export async function reindexBot(bot: {
  _id: mongoose.Types.ObjectId;
  ownerId: string;
  knowledge?: string;
}): Promise<void> {
  const chunks = chunkText(bot.knowledge || "");

  const docs: {
    botId: mongoose.Types.ObjectId;
    ownerId: string;
    content: string;
    embedding: number[];
  }[] = [];
  for (const content of chunks) {
    const embedding = await embedText(content, "RETRIEVAL_DOCUMENT");
    docs.push({ botId: bot._id, ownerId: bot.ownerId, content, embedding });
  }

  // Build succeeded — now swap. Scope delete to textarea-derived chunks only.
  await KnowledgeChunk.deleteMany({
    botId: bot._id,
    sourceId: { $exists: false },
  });
  if (docs.length) await KnowledgeChunk.insertMany(docs);
}

interface RawChunk {
  content: string;
  embedding: number[];
  sourceId?: mongoose.Types.ObjectId;
}

/**
 * Loads the candidate knowledge chunks to rank for a bot.
 *
 * By default this pulls every chunk for the bot and the cosine ranking happens
 * in Node — fine for a per-bot corpus. If `USE_ATLAS_VECTOR === "1"` we instead
 * run a MongoDB Atlas `$vectorSearch` to pre-filter to the nearest chunks, then
 * still re-rank them in Node so the downstream scoring is identical. If the
 * aggregation throws (no Atlas vector index configured, or a local/standalone
 * Mongo that doesn't support `$vectorSearch`) we transparently fall back to the
 * full in-Node scan.
 *
 * NOTE: for the Atlas path to work you MUST create an Atlas Search vector index
 * on the `knowledgechunks` collection, on the `embedding` field, with the name
 * from `ATLAS_VECTOR_INDEX` (default "vector_index"). Example definition:
 *   { "fields": [
 *       { "type": "vector", "path": "embedding",
 *         "numDimensions": 768, "similarity": "cosine" },
 *       { "type": "filter", "path": "botId" } ] }
 */
async function loadCandidateChunks(
  botId: mongoose.Types.ObjectId,
  queryVec: number[],
): Promise<RawChunk[]> {
  if (process.env.USE_ATLAS_VECTOR === "1") {
    try {
      const indexName = process.env.ATLAS_VECTOR_INDEX || "vector_index";
      const atlas = await KnowledgeChunk.aggregate([
        {
          $vectorSearch: {
            index: indexName,
            path: "embedding",
            queryVector: queryVec,
            numCandidates: 100,
            limit: 8,
            filter: { botId },
          },
        },
        { $project: { _id: 0, content: 1, embedding: 1, sourceId: 1 } },
      ]);
      return atlas as RawChunk[];
    } catch {
      // No Atlas vector index / unsupported deployment — fall back to full scan.
    }
  }

  return KnowledgeChunk.find({ botId })
    .select("content embedding sourceId")
    .lean() as unknown as Promise<RawChunk[]>;
}

/**
 * Retrieves the most relevant knowledge chunks and past helpful answers for a
 * query vector, along with resolved citation `sources` and a `topScore`
 * confidence signal. Cosine ranking is done in Node (optionally pre-filtered by
 * an Atlas `$vectorSearch` — see `loadCandidateChunks`).
 */
export async function retrieveContext(
  bot: { _id: mongoose.Types.ObjectId },
  queryVec: number[],
): Promise<RetrievedContext> {
  const [kChunks, entries, mems] = await Promise.all([
    loadCandidateChunks(bot._id, queryVec),
    KnowledgeEntry.find({ botId: bot._id })
      .select("question answer embedding")
      .lean(),
    Memory.find({ botId: bot._id })
      .select("question answer embedding")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
  ]);

  // Curated Q&A entries are prioritized over raw knowledge chunks.
  const entryHits = topK(
    queryVec,
    entries as unknown as { question: string; answer: string; embedding: number[] }[],
    3,
    0.55,
  );

  const chunkHits = topK(
    queryVec,
    kChunks as unknown as RawChunk[],
    4,
    CHUNK_MIN_SCORE, // drop off-topic chunks instead of injecting noise
  );

  const knowledgeChunks = [
    ...entryHits.map((e) => `Q: ${e.question}\nA: ${e.answer}`),
    ...chunkHits.map((c) => c.content),
  ];

  const examples = topK(
    queryVec,
    mems as unknown as { question: string; answer: string; embedding: number[] }[],
    3,
    0.72, // only reuse genuinely similar past answers
  ).map((m) => ({ question: m.question, answer: m.answer }));

  // Confidence: the best similarity among everything we returned.
  const allScores = [...entryHits, ...chunkHits].map((h) => h.score);
  const topScore = allScores.length ? Math.max(...allScores) : 0;

  // Resolve citations for the knowledge chunks (Q&A entries aren't citeable).
  const sources = await resolveSources(chunkHits);

  return { knowledgeChunks, examples, sources, topScore };
}

/**
 * Resolves each ranked chunk to a citation. Chunks carrying a `sourceId` map to
 * their KnowledgeSource name/url (looked up in a single batched query); chunks
 * from the raw knowledge textarea become "Knowledge base". Deduped by
 * title+url, preserving rank order (so the highest-scoring chunk wins).
 */
async function resolveSources(
  chunkHits: (RawChunk & { score: number })[],
): Promise<RetrievedSource[]> {
  const ids = chunkHits
    .map((c) => c.sourceId)
    .filter((v): v is mongoose.Types.ObjectId => !!v);

  const sourceMap = new Map<string, { name?: string; url?: string }>();
  if (ids.length) {
    const srcs = (await KnowledgeSource.find({ _id: { $in: ids } })
      .select("name url")
      .lean()) as unknown as { _id: mongoose.Types.ObjectId; name?: string; url?: string }[];
    for (const s of srcs) {
      sourceMap.set(String(s._id), { name: s.name, url: s.url });
    }
  }

  const sources: RetrievedSource[] = [];
  const seen = new Set<string>();
  for (const c of chunkHits) {
    let title = "Knowledge base";
    let url: string | undefined;
    if (c.sourceId) {
      const s = sourceMap.get(String(c.sourceId));
      if (s?.name) title = s.name;
      url = s?.url || undefined;
    }
    const key = `${title}|${url || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title,
      url,
      snippet: (c.content || "").slice(0, SNIPPET_LEN),
    });
  }
  return sources;
}
