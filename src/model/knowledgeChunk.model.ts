import mongoose, { Schema } from "mongoose";

export interface IKnowledgeChunk {
  botId: mongoose.Types.ObjectId;
  ownerId: string;
  content: string;
  embedding: number[];
  // Optional link to the KnowledgeSource (uploaded file / crawled URL) this came
  // from. Chunks from the raw knowledge textarea have no sourceId.
  sourceId?: mongoose.Types.ObjectId;
}

const knowledgeChunkSchema = new Schema<IKnowledgeChunk>(
  {
    botId: { type: Schema.Types.ObjectId, ref: "Bot", required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: "KnowledgeSource", index: true },
  },
  { timestamps: true },
);

const KnowledgeChunk =
  mongoose.models.KnowledgeChunk ||
  mongoose.model("KnowledgeChunk", knowledgeChunkSchema);

export default KnowledgeChunk;
