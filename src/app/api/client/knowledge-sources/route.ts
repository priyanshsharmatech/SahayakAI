import connectDb from "@/lib/db";
import Bot from "@/model/bot.model";
import KnowledgeSource from "@/model/knowledgeSource.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import {
  extractFromFile,
  extractFromUrl,
  extractFromSitemap,
  chunkAndEmbed,
} from "@/lib/ingest";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Buffer / file parsing needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = ["pdf", "docx", "txt", "md", "markdown"];

/** List ingested knowledge sources for an owner + bot, newest first. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const botId = new URL(req.url).searchParams.get("botId");
  if (!botId || !mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Valid botId required" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const sources = await KnowledgeSource.find({ ownerId, botId })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ sources });
}

/**
 * Ingest a new knowledge source. Accepts EITHER:
 *   - JSON        { botId, url }          → crawl a web page
 *   - multipart   { botId, file }         → upload a PDF/DOCX/TXT/MD file
 * Creates a KnowledgeSource (processing), extracts + embeds, then marks it
 * ready (or error).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const contentType = req.headers.get("content-type") || "";

  let botId = "";
  let mode: "url" | "file" = "url";
  let url = "";
  let file: File | null = null;
  let autoSync = false;
  let sitemap = false;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      botId = String(form.get("botId") || "");
      const f = form.get("file");
      if (f && typeof f === "object" && "arrayBuffer" in f) {
        file = f as File;
        mode = "file";
      }
    } else {
      const body = await req.json();
      botId = String(body.botId || "");
      url = String(body.url || "");
      mode = "url";
      autoSync = body.autoSync === true || body.autoSync === "true";
      sitemap = body.mode === "sitemap";
    }
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  // Treat an explicit sitemap flag OR a URL that points at a sitemap.xml as a
  // multi-page crawl.
  if (mode === "url" && /sitemap[^/]*\.xml(\?.*)?$/i.test(url.trim())) {
    sitemap = true;
  }

  if (!botId || !mongoose.isValidObjectId(botId)) {
    return NextResponse.json({ message: "Valid botId required" }, { status: 400 });
  }

  // Ownership check.
  const bot = await Bot.findOne({ _id: botId, ownerId });
  if (!bot) return NextResponse.json({ message: "Bot not found" }, { status: 404 });

  // --- Validate input up-front (before creating the source doc) ---
  let fileBuffer: Buffer | null = null;
  let fileName = "";
  let fileMime = "";

  if (mode === "file") {
    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }
    fileName = file.name || "upload";
    fileMime = file.type || "";
    const ext = fileName.toLowerCase().includes(".")
      ? fileName.toLowerCase().split(".").pop() || ""
      : "";
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { message: "Unsupported file type. Allowed: PDF, DOCX, TXT, MD." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { message: "File too large (max 10MB)." },
        { status: 400 },
      );
    }
    fileBuffer = Buffer.from(await file.arrayBuffer());
  } else {
    if (!url.trim()) {
      return NextResponse.json({ message: "url is required" }, { status: 400 });
    }
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      return NextResponse.json(
        { message: "A valid http(s) URL is required" },
        { status: 400 },
      );
    }
  }

  // --- Create the source in 'processing' state ---
  const source = await KnowledgeSource.create({
    botId,
    ownerId,
    type: mode,
    name: mode === "file" ? fileName : url,
    url: mode === "url" ? url : undefined,
    status: "processing",
    charCount: 0,
    chunkCount: 0,
    // autoSync only applies to URL sources (files can't be re-crawled).
    autoSync: mode === "url" ? autoSync : false,
  });

  await logClientAction({
    ownerId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "source.add",
    detail: source.name,
  });

  // --- Extract + chunk + embed; update the source with the outcome ---
  try {
    let text = "";
    let name = source.name;

    if (mode === "file") {
      text = await extractFromFile(fileBuffer as Buffer, fileName, fileMime);
    } else {
      const extracted = sitemap
        ? await extractFromSitemap(url)
        : await extractFromUrl(url);
      text = extracted.text;
      if (extracted.title) name = extracted.title;
    }

    if (!text.trim()) {
      throw new Error("No readable text found in the source.");
    }

    const chunkCount = await chunkAndEmbed({
      botId,
      ownerId,
      sourceId: source._id,
      text,
    });

    source.name = name;
    source.status = "ready";
    source.charCount = text.length;
    source.chunkCount = chunkCount;
    source.error = undefined;
    await source.save();

    return NextResponse.json({ source }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    source.status = "error";
    source.error = message;
    await source.save();
    return NextResponse.json({ source }, { status: 201 });
  }
}
