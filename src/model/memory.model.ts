import mongoose, { Schema } from "mongoose";

/**
 * A question/answer pair the bot got positive feedback on. Retrieved as a
 * few-shot example for similar future questions, so the bot "learns" what
 * answers customers found helpful.
 */
export interface IMemory {
  botId: mongoose.Types.ObjectId;
  ownerId: string;
  question: string;
  answer: string;
  embedding: number[]; // embedding of the question
}

const memorySchema = new Schema<IMemory>(
  {
    botId: { type: Schema.Types.ObjectId, ref: "Bot", required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true },
);

const Memory =
  mongoose.models.Memory || mongoose.model("Memory", memorySchema);

export default Memory;
