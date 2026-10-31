import mongoose, { Schema } from "mongoose";

/**
 * A knowledge-base source the owner ingested beyond the raw textarea: an
 * uploaded file (PDF/DOCX/TXT/MD) or a crawled website URL. Its extracted text
 * is chunked + embedded into KnowledgeChunk documents (linked via sourceId), so
 * a source can be listed, re-indexed, and deleted as a unit.
 */
export interface IKnowledgeSource {
  botId: mongoose.Types.ObjectId;
  ownerId: string;
  type: "file" | "url" | "text";
  name: string; // file name or page title / URL
  url?: string; // for url sources
  status: "processing" | "ready" | "error";
  error?: string;
  charCount: number;
  chunkCount: number;
  autoSync: boolean; // re-crawl URL sources on a schedule
  lastSyncedAt?: Date;
}

const knowledgeSourceSchema = new Schema<IKnowledgeSource>(
  {
    botId: { type: Schema.Types.ObjectId, ref: "Bot", required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    type: { type: String, enum: ["file", "url", "text"], required: true },
    name: { type: String, required: true },
    url: { type: String },
    status: {
      type: String,
      enum: ["processing", "ready", "error"],
      default: "processing",
    },
    error: { type: String },
    charCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    autoSync: { type: Boolean, default: false },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true },
);

const KnowledgeSource =
  mongoose.models.KnowledgeSource ||
  mongoose.model("KnowledgeSource", knowledgeSourceSchema);

export default KnowledgeSource;
