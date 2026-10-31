import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { resolveBot } from "@/lib/bot";
import { embedText } from "@/lib/embeddings";
import { retrieveContext } from "@/lib/rag";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { GoogleGenAI } from "@google/genai";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

/**
 * Drafts a suggested reply an agent could send to the visitor, grounded in the
 * bot's knowledge base (RAG). Internal only — the draft is returned to the
 * agent, never sent to the visitor automatically.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "agent");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const conversation = await Conversation.findOne({ _id: id, ownerId });
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    // Latest visitor message is the question we draft a reply to.
    const lastUser = await Message.findOne({
      conversationId: conversation._id,
      role: "user",
    })
      .sort({ createdAt: -1 })
      .select("content")
      .lean<{ content?: string }>();

    const question = (lastUser?.content || "").trim();
    if (!question) {
      return NextResponse.json({ suggestion: "" });
    }

    const bot = await resolveBot(
      conversation.botId ? String(conversation.botId) : undefined,
      ownerId,
    );
    if (!bot) {
      return NextResponse.json({ suggestion: "" });
    }

    // Retrieve grounding knowledge for the question (best effort).
    let knowledgeChunks: string[] = [];
    try {
      const queryVec = await embedText(question);
      const ctx = await retrieveContext(bot, queryVec);
      knowledgeChunks = ctx.knowledgeChunks;
    } catch (e) {
      console.error("Assist RAG retrieval failed:", e);
    }

    // Recent conversation turns for context.
    const history = (
      await Message.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("role content")
        .lean()
    )
      .reverse()
      .map((m) => ({ role: m.role as string, content: m.content as string }));

    const knowledgeBody = knowledgeChunks.length
      ? knowledgeChunks.map((c, i) => `(${i + 1}) ${c}`).join("\n\n")
      : bot.knowledge || "not provided";

    const historyBlock = history.length
      ? history
          .map((h) => `${h.role === "user" ? "Customer" : "Agent/Assistant"}: ${h.content}`)
          .join("\n")
      : "(no prior messages)";

    const prompt = `
You are helping a human support agent at ${bot.businessName || "this business"} by DRAFTING a reply they could send to the customer.

INSTRUCTIONS:
- Write a helpful, accurate reply to the customer's LATEST message.
- Ground your answer ONLY in the BUSINESS INFORMATION below. Do NOT invent facts, prices, policies, or promises that are not supported by it.
- If the information needed is not available, draft a brief, polite message that acknowledges the request and offers to follow up, rather than making something up.
- Be concise and natural, as if written by a friendly human agent.
- Reply in the SAME language and script the customer used in their latest message (match native scripts and romanized/transliterated styles; keep numbers, emails, URLs, and names as-is).
- Output ONLY the suggested reply text — no preamble, labels, or quotation marks.

--------------------
BUSINESS INFORMATION
--------------------
Business Name: ${bot.businessName || "not provided"}
Support Email: ${bot.supportEmail || "not provided"}
Knowledge:
${knowledgeBody}

--------------------
CONVERSATION SO FAR
--------------------
${historyBlock}

--------------------
CUSTOMER'S LATEST MESSAGE
--------------------
${question}

--------------------
YOUR SUGGESTED REPLY
--------------------
`;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const suggestion = (res.text ?? "").trim();
    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Assist error:", error);
    return NextResponse.json({ suggestion: "" });
  }
}
