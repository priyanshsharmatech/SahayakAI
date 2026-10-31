import connectDb from "@/lib/db";
import KnowledgeSource from "@/model/knowledgeSource.model";
import KnowledgeChunk from "@/model/knowledgeChunk.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import { logClientAction } from "@/lib/clientAudit";
import { extractFromUrl, extractFromSitemap, chunkAndEmbed } from "@/lib/ingest";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Crawling + embedding needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

/**
 * Re-crawl a URL knowledge source and rebuild its chunks. Deletes the source's
 * old KnowledgeChunk docs, re-extracts (sitemap-aware) from the stored `url`,
 * re-chunks + embeds, and updates chunkCount / charCount / lastSyncedAt /
 * status. On failure the source is marked `error` with the message.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Valid source id required" }, { status: 400 });
  }

  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const source = await KnowledgeSource.findOne({ _id: id, ownerId });
  if (!source) {
    return NextResponse.json({ message: "Source not found" }, { status: 404 });
  }

  if (source.type !== "url" || !source.url) {
    return NextResponse.json(
      { message: "Only URL sources can be synced." },
      { status: 400 },
    );
  }

  const url: string = source.url;
  // Re-crawl as a sitemap if the stored URL points at a sitemap.xml.
  const sitemap = /sitemap[^/]*\.xml(\?.*)?$/i.test(url.trim());

  source.status = "processing";
  await source.save();

  try {
    const extracted = sitemap
      ? await extractFromSitemap(url)
      : await extractFromUrl(url);
    const text = extracted.text;

    if (!text.trim()) {
      throw new Error("No readable text found in the source.");
    }

    // Crash-safe swap: embed + insert the NEW chunks first (capturing the old
    // chunk ids beforehand), then delete only those old ids. If embedding throws
    // the existing chunks stay intact, so a failed sync never wipes the source.
    const oldChunks = await KnowledgeChunk.find({ sourceId: source._id })
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId }[]>();
    const oldIds = oldChunks.map((c) => c._id);

    const chunkCount = await chunkAndEmbed({
      botId: source.botId,
      ownerId,
      sourceId: source._id,
      text,
    });

    if (oldIds.length) {
      await KnowledgeChunk.deleteMany({ _id: { $in: oldIds } });
    }

    if (extracted.title) source.name = extracted.title;
    source.status = "ready";
    source.charCount = text.length;
    source.chunkCount = chunkCount;
    source.lastSyncedAt = new Date();
    source.error = undefined;
    await source.save();

    await logClientAction({
      ownerId,
      actorId: user.id,
      actorName: user.name || user.email,
      action: "source.sync",
      detail: source.name,
    });

    return NextResponse.json({ source });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    source.status = "error";
    source.error = message;
    await source.save();
    return NextResponse.json({ source });
  }
}
