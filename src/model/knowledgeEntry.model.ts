import mongoose, { Schema } from "mongoose";

/**
 * A curated Q&A the owner added (typically by answering a question the bot
 * couldn't handle). It's part of the knowledge base: embedded for retrieval and
 * editable from both the analytics section and the Configure tab.
 */
export interface IKnowledgeEntry {
  botId: mongoose.Types.ObjectId;
  ownerId: string;
  question: string;
  answer: string;
  embedding: number[]; // embedding of the question
}

const knowledgeEntrySchema = new Schema<IKnowledgeEntry>(
  {
    botId: { type: Schema.Types.ObjectId, ref: "Bot", required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true },
);

const KnowledgeEntry =
  mongoose.models.KnowledgeEntry ||
  mongoose.model("KnowledgeEntry", knowledgeEntrySchema);

export default KnowledgeEntry;
