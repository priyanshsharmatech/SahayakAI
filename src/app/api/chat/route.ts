import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import {
  resolveBot,
  buildPrompt,
  localizedFallback,
  FALLBACK_REPLY,
  PromptContext,
} from "@/lib/bot";
import { embedText } from "@/lib/embeddings";
import { reindexBot, retrieveContext } from "@/lib/rag";
import { buildVisitorMeta, extractIdentity } from "@/lib/visitor";
import { resolveAllowOrigin, corsHeaders } from "@/lib/cors";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/clientIp";
import { checkClientLimits } from "@/lib/limits";
import { GoogleGenAI } from "@google/genai";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

/** Citation/source shape attached to answers (shown by the widget if enabled). */
type Source = { title?: string; url?: string; snippet?: string };

/**
 * `retrieveContext()` is being upgraded (by another agent) to also return
 * `sources` and `topScore`. We read those DEFENSIVELY as optional so this
 * compiles and runs even before that lands — `sources` defaults to [] and
 * `topScore` to 0.
 */
type Retrieved = PromptContext & { sources?: Source[]; topScore?: number };

/**
 * Per-bot CORS: echoes an allowed origin (or "null"/"*") based on the bot's
 * `allowedDomains`. `allowed` undefined → "*" (used for early/pre-bot errors).
 */
function applyCors(
  response: NextResponse,
  origin: string | null,
  allowed?: string[],
): NextResponse {
  const headers = corsHeaders(resolveAllowOrigin(origin, allowed));
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

// Gemini content parts: plain text and/or inline (base64) images for vision.
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

const FALLBACK_PHRASE = "please contact support";

/** Normalizes a request-body `attachments` field into a clean string[] of URLs. */
function parseAttachments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
}

/** Normalizes a request-body `prechat` object into a clean Record<string,string>. */
function parsePrechat(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (k && v !== undefined && v !== null && String(v).trim() !== "") {
      out[String(k).slice(0, 40)] = String(v).slice(0, 300);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Best-effort quick-reply suggestions: asks Gemini for up to 3 short follow-up
 * questions the visitor might ask next, in the customer's own language. Fully
 * optional — any failure returns [] so it never breaks the chat response.
 */
async function generateSuggestions(
  ai: GoogleGenAI,
  userMessage: string,
  reply: string,
): Promise<string[]> {
  try {
    const prompt = `Based on this customer-support exchange, suggest up to 3 SHORT follow-up questions the CUSTOMER might naturally ask next. Rules: write them from the customer's point of view, max ~8 words each, no numbering or punctuation prefixes, one per line, and in the SAME language/script the customer used. If no sensible follow-ups exist, output nothing.\n\nCustomer: ${userMessage}\nAssistant: ${reply}`;
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = (res.text ?? "").trim();
    if (!text) return [];
    return text
      .split("\n")
      .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Best-effort: turn attachment image URLs into Gemini inline-data parts so the
 * model can "see" screenshots. Any failure (bad URL, non-image, fetch error) is
 * swallowed — we simply return whatever loaded (possibly none) and let the
 * caller fall back to text-only generation.
 */
/** Only fetch attachment images from Cloudinary (where our upload route stores
 * them). Prevents SSRF — a visitor can't make the server fetch arbitrary/internal
 * URLs by putting them in `attachments`. */
function isSafeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)res\.cloudinary\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function loadImageParts(urls: string[]): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = [];
  for (const url of urls.slice(0, 4)) {
    if (!isSafeImageUrl(url)) continue;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) continue;
      const mimeType = resp.headers.get("content-type") || "image/png";
      if (!mimeType.startsWith("image/")) continue;
      const data = Buffer.from(await resp.arrayBuffer()).toString("base64");
      parts.push({ inlineData: { mimeType, data } });
    } catch {
      // ignore this attachment and continue
    } finally {
      clearTimeout(timer);
    }
  }
  return parts;
}

export async function POST(req: NextRequest) {
  // Computed up-front so the catch handler (and early returns) can set CORS.
  const origin = req.headers.get("origin");
  try {
    // IP rate limit (30 requests / minute) — blocks floods before any LLM call.
    const rl = rateLimit(`chat:${clientIp(req)}`, 30, 60_000);
    if (!rl.ok) {
      const resp = NextResponse.json(
        { message: "Too many requests. Please slow down." },
        { status: 429 },
      );
      resp.headers.set("Retry-After", String(rl.retryAfter));
      return applyCors(resp, origin);
    }

    const body = await req.json();
    const {
      message,
      ownerId,
      botId,
      conversationId,
      visitorId,
      visitor,
      stream,
    } = body;
    const attachments = parseAttachments(body.attachments);
    const prechat = parsePrechat(body.prechat);
    const consent = body.consent === true;

    if (!message || (!ownerId && !botId)) {
      return applyCors(
        NextResponse.json(
          { message: "message and botId (or ownerId) are required" },
          { status: 400 },
        ),
        origin,
      );
    }

    await connectDb();

    const bot = await resolveBot(botId, ownerId);
    if (!bot) {
      return applyCors(
        NextResponse.json({ message: "Chatbot not configured yet" }, { status: 404 }),
        origin,
      );
    }
    if (bot.isActive === false) {
      return applyCors(
        NextResponse.json(
          { message: "This assistant is currently unavailable." },
          { status: 403 },
        ),
        origin,
        bot.allowedDomains,
      );
    }

    // Admin-set client limits (suspended account / monthly message quota).
    const limits = await checkClientLimits(bot.ownerId);
    if (!limits.ok) {
      return applyCors(
        NextResponse.json(
          { message: "This assistant is currently unavailable." },
          { status: 403 },
        ),
        origin,
        bot.allowedDomains,
      );
    }

    // Per-bot CORS headers reused for every response below (incl. the stream).
    const corsH = corsHeaders(resolveAllowOrigin(origin, bot.allowedDomains));

    // Find or create the conversation (assign an A/B variant on creation).
    // Validate the id first so a malformed value is treated as "new
    // conversation" rather than throwing a Mongoose CastError (→ 500).
    let conversation =
      conversationId && mongoose.isValidObjectId(conversationId)
        ? await Conversation.findOne({ _id: conversationId, ownerId: bot.ownerId })
        : null;
    // SECURITY (IDOR): a conversation may only be continued by the same visitor
    // that created it. Without this check, knowing a conversationId would let a
    // caller append to — and read back the history of — another visitor's
    // conversation. On mismatch we silently start a fresh conversation rather
    // than leak or error.
    if (conversation && conversation.visitorId !== visitorId) {
      conversation = null;
    }
    const identity = extractIdentity(visitor);
    if (!conversation) {
      const variant =
        bot.ab?.enabled && Math.random() < 0.5 ? "B" : "A";
      // Fall back to pre-chat form answers for identity when not otherwise set.
      const pcName = prechat?.name?.trim();
      const pcEmail = prechat?.email?.trim().toLowerCase();
      conversation = await Conversation.create({
        ownerId: bot.ownerId,
        botId: bot._id,
        visitorId: visitorId || crypto.randomUUID(),
        variant,
        meta: buildVisitorMeta(req, visitor),
        visitorName: identity.name || pcName || undefined,
        visitorEmail: identity.email || pcEmail || undefined,
        visitorUserId: identity.userId || undefined,
        visitorAttributes: Object.keys(identity.attributes).length
          ? identity.attributes
          : undefined,
        consent,
        prechat,
      });
    } else if (visitor) {
      // Identity can arrive after the first message (e.g. identify() called later).
      if (identity.name) conversation.visitorName = identity.name;
      if (identity.email) conversation.visitorEmail = identity.email;
      if (identity.userId) conversation.visitorUserId = identity.userId;
      if (Object.keys(identity.attributes).length) {
        conversation.visitorAttributes = {
          ...(conversation.visitorAttributes || {}),
          ...identity.attributes,
        };
      }
    }

    // Always record the visitor's message (with any attachments for the inbox).
    const userMsg = await Message.create({
      conversationId: conversation._id,
      ownerId: bot.ownerId,
      botId: bot._id,
      role: "user",
      content: String(message),
      attachments,
    });

    // === Streaming path (SSE) ========================================
    if (stream) {
      return streamReply({ bot, conversation, userMsg, message, attachments, corsH });
    }

    // === Non-streaming path (unchanged back-compat JSON) =============
    // If a human has taken over — or the visitor has asked for one — pause the
    // AI so it doesn't jump back in. The agent replies from the Inbox.
    if (conversation.mode === "human" || conversation.needsHuman) {
      conversation.messageCount += 1;
      conversation.lastMessageAt = new Date();
      await conversation.save();
      return applyCors(
        NextResponse.json({
          conversationId: conversation._id.toString(),
          human: true,
        }),
        origin,
        bot.allowedDomains,
      );
    }

    // --- Retrieve context (RAG) + past helpful answers, then generate ---
    let ragContext: Retrieved = {};
    try {
      const queryVec = await embedText(String(message));
      // Lazily index this bot's knowledge the first time (covers older bots).
      const hasChunks = await KnowledgeChunk.exists({ botId: bot._id });
      if (!hasChunks && (bot.knowledge || "").trim()) {
        await reindexBot(bot);
      }
      ragContext = await retrieveContext(bot, queryVec);
    } catch (e) {
      console.error("RAG retrieval failed; using raw knowledge:", e);
    }

    // Defensive reads: `sources`/`topScore` may not exist yet (see Retrieved).
    const topScore = typeof ragContext.topScore === "number" ? ragContext.topScore : 0;
    const retrievedSources: Source[] = Array.isArray(ragContext.sources)
      ? ragContext.sources
      : [];
    // Confidence gate: a weak top match must NOT feed the prompt, otherwise a
    // low-confidence RAG hit can produce a confident, wrong answer. Dropping the
    // context routes genuine business questions down the fallback path while
    // still letting the model handle greetings/small talk on its own.
    const useContext = !(bot.confidenceThreshold > 0 && topScore < bot.confidenceThreshold);

    // Short-term memory: the recent turns of this conversation.
    const history = (
      await Message.find({
        conversationId: conversation._id,
        _id: { $ne: userMsg._id },
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("role content")
        .lean()
    )
      .reverse()
      .map((m) => ({ role: m.role as string, content: m.content as string }));

    // --- AI reply ---
    // On low confidence, build the prompt WITHOUT the retrieved knowledge/examples.
    const prompt = buildPrompt(
      bot,
      String(message),
      conversation.variant,
      useContext
        ? { knowledgeChunks: ragContext.knowledgeChunks, examples: ragContext.examples, history }
        : { history },
    );
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const rawReply = (res.text ?? "").trim() || FALLBACK_REPLY;
    const isFallback = rawReply.toLowerCase().includes(FALLBACK_PHRASE);
    const supportEmail = bot.supportEmail || "";
    const reply = isFallback
      ? localizedFallback(String(message), supportEmail, bot.appearance?.language || "en")
      : rawReply;

    // Citations only for a genuine, context-backed answer.
    const sources: Source[] = !isFallback && useContext ? retrievedSources : [];
    // Quick-reply suggestions (optional, non-fatal). Skip on fallback / if off.
    const suggestions =
      !isFallback && bot.appearance?.quickRepliesEnabled !== false
        ? await generateSuggestions(ai, String(message), reply)
        : [];

    if (isFallback) {
      userMsg.fallback = true;
      await userMsg.save();
    }

    const botMsg = await Message.create({
      conversationId: conversation._id,
      ownerId: bot.ownerId,
      botId: bot._id,
      role: "bot",
      content: reply,
      fallback: isFallback,
      variant: conversation.variant,
      sources,
      confidence: topScore,
    });

    conversation.messageCount += 2;
    conversation.lastMessageAt = new Date();
    if (isFallback) conversation.escalated = true;
    await conversation.save();

    return applyCors(
      NextResponse.json({
        reply,
        conversationId: conversation._id.toString(),
        messageId: botMsg._id.toString(),
        fallback: isFallback,
        supportEmail,
        sources,
        suggestions,
        human: false,
      }),
      origin,
      bot.allowedDomains,
    );
  } catch (error) {
    console.error("Chat error:", error);
    return applyCors(
      NextResponse.json({ message: "Something went wrong. Please try again." }, { status: 500 }),
      origin,
    );
  }
}

// Minimal shape of what streamReply needs from the resolved bot/conversation
// (both are Mongoose documents; `any` keeps us decoupled from their generics).
/* eslint-disable @typescript-eslint/no-explicit-any */
interface StreamArgs {
  bot: any;
  conversation: any;
  userMsg: any;
  message: unknown;
  attachments: string[];
  corsH: Record<string, string>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Returns a Server-Sent-Events Response that streams the model's tokens.
 *
 * SSE frames (each `data: <json>\n\n`):
 *   {"type":"meta","conversationId"}
 *   {"type":"delta","text"}                     (zero or more)
 *   {"type":"done","messageId","fallback","supportEmail","sources","suggestions","conversationId"}
 *   {"type":"human","conversationId"}           (when AI is paused)
 *   {"type":"error","message"}                  (on failure)
 *
 * Fallback handling: the model is instructed to reply EXACTLY the short
 * fallback phrase, so a fallback always shows up within the first few tokens.
 * We therefore buffer the opening ~40 chars before emitting any delta: if that
 * prefix contains the fallback phrase we SUPPRESS the raw tokens entirely and
 * instead stream the localized "leave your email" rewrite, so what the visitor
 * sees matches the stored bot Message and the `done.fallback` flag. Otherwise
 * we flush the buffered prefix and stream the rest of the tokens as they land.
 */
function streamReply({ bot, conversation, userMsg, message, attachments, corsH }: StreamArgs) {
  const encoder = new TextEncoder();
  const supportEmail = bot.supportEmail || "";

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: "meta", conversationId: conversation._id.toString() });

        // AI paused: a human has taken over or the visitor asked for one.
        if (conversation.mode === "human" || conversation.needsHuman) {
          conversation.messageCount += 1;
          conversation.lastMessageAt = new Date();
          await conversation.save();
          send({ type: "human", conversationId: conversation._id.toString() });
          controller.close();
          return;
        }

        // --- Retrieve context (RAG) + past helpful answers ---
        let ragContext: Retrieved = {};
        try {
          const queryVec = await embedText(String(message));
          const hasChunks = await KnowledgeChunk.exists({ botId: bot._id });
          if (!hasChunks && (bot.knowledge || "").trim()) {
            await reindexBot(bot);
          }
          ragContext = await retrieveContext(bot, queryVec);
        } catch (e) {
          console.error("RAG retrieval failed; using raw knowledge:", e);
        }

        // Defensive reads: `sources`/`topScore` may not exist yet (see Retrieved).
        const topScore =
          typeof ragContext.topScore === "number" ? ragContext.topScore : 0;
        const retrievedSources: Source[] = Array.isArray(ragContext.sources)
          ? ragContext.sources
          : [];
        // Confidence gate (mirrors the non-streaming path): a weak top match
        // must NOT feed the prompt, so it can't yield a confident wrong answer.
        const useContext = !(
          bot.confidenceThreshold > 0 && topScore < bot.confidenceThreshold
        );

        // Short-term memory: recent turns of this conversation.
        const history = (
          await Message.find({
            conversationId: conversation._id,
            _id: { $ne: userMsg._id },
          })
            .sort({ createdAt: -1 })
            .limit(8)
            .select("role content")
            .lean()
        )
          .reverse()
          .map((m) => ({ role: m.role as string, content: m.content as string }));

        let prompt = buildPrompt(
          bot,
          String(message),
          conversation.variant,
          useContext
            ? {
                knowledgeChunks: ragContext.knowledgeChunks,
                examples: ragContext.examples,
                history,
              }
            : { history },
        );

        // Vision (best effort): include attached images as inline-data parts.
        // If any load, note their presence in the prompt so the text path is
        // coherent too; if none load, we quietly proceed with text only.
        let imageParts: GeminiPart[] = [];
        if (attachments.length) {
          prompt += `\n    (The customer also attached ${attachments.length} image(s); use them if relevant.)`;
          imageParts = await loadImageParts(attachments);
        }

        const contents: GeminiPart[] | string = imageParts.length
          ? [{ text: prompt }, ...imageParts]
          : prompt;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents,
        });

        let full = "";
        let buffer = "";
        let decided = false;
        let suppressed = false; // true → fallback detected; nothing raw was emitted
        const FLUSH_AT = 60; // chars to buffer before committing to a raw answer

        // Decide, while buffering, whether this is the fallback (suppress + stream
        // the localized rewrite later) or a real answer (flush + stream raw). We
        // suppress by default and only commit to raw once we're confident it's
        // NOT the fallback sentinel — guaranteeing the shown text == stored text.
        const tryDecide = (final: boolean) => {
          if (decided) return;
          if (buffer.toLowerCase().includes(FALLBACK_PHRASE)) {
            decided = true;
            suppressed = true;
          } else if (final || buffer.length >= FLUSH_AT) {
            decided = true;
            suppressed = false;
            if (buffer) send({ type: "delta", text: buffer });
          }
        };

        for await (const chunk of result) {
          const t = chunk.text ?? "";
          if (!t) continue;
          full += t;
          if (!decided) {
            buffer += t;
            tryDecide(false);
          } else if (!suppressed) {
            send({ type: "delta", text: t });
          }
          // if suppressed: keep accumulating `full`, emit nothing.
        }
        tryDecide(true);

        // --- Post-processing (mirrors the non-streaming path) ---
        // If we already streamed the raw answer, it is authoritatively NOT a
        // fallback for display — never append a second (localized) message.
        const streamedRaw = decided && !suppressed;
        const rawReply = full.trim() || FALLBACK_REPLY;
        const isFallback = streamedRaw
          ? false
          : rawReply.toLowerCase().includes(FALLBACK_PHRASE);
        const reply = isFallback
          ? localizedFallback(String(message), supportEmail, bot.appearance?.language || "en")
          : rawReply;

        // Fallback was detected before any raw delta — stream the localized
        // rewrite now so the visitor sees (and we store) the same final text.
        if (suppressed) {
          send({ type: "delta", text: reply });
        }
        if (isFallback) {
          userMsg.fallback = true;
          await userMsg.save();
        }

        // Citations only for a genuine, context-backed answer.
        const sources: Source[] = !isFallback && useContext ? retrievedSources : [];
        // Quick-reply suggestions (optional, non-fatal). Skip on fallback / if off.
        const suggestions =
          !isFallback && bot.appearance?.quickRepliesEnabled !== false
            ? await generateSuggestions(ai, String(message), reply)
            : [];

        const botMsg = await Message.create({
          conversationId: conversation._id,
          ownerId: bot.ownerId,
          botId: bot._id,
          role: "bot",
          content: reply,
          fallback: isFallback,
          variant: conversation.variant,
          sources,
          confidence: topScore,
        });

        conversation.messageCount += 2;
        conversation.lastMessageAt = new Date();
        if (isFallback) conversation.escalated = true;
        await conversation.save();

        send({
          type: "done",
          messageId: botMsg._id.toString(),
          fallback: isFallback,
          supportEmail,
          sources,
          suggestions,
          conversationId: conversation._id.toString(),
        });
        controller.close();
      } catch (err) {
        console.error("Chat stream error:", err);
        // Never leak raw internals to the visitor.
        send({ type: "error", message: "Something went wrong. Please try again." });
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      ...corsH,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// Preflight: no bot is resolved yet here, so we respond permissively ("*").
export const OPTIONS = async () =>
  new NextResponse(null, { status: 204, headers: corsHeaders("*") });
