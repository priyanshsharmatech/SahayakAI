import mongoose, { Schema } from "mongoose";

export interface IMessage {
  conversationId: mongoose.Types.ObjectId;
  ownerId: string;
  botId?: mongoose.Types.ObjectId;
  role: "user" | "bot" | "agent";
  content: string;
  // For a user message: the question the bot could not answer.
  // For a bot message: the "please contact support" fallback reply.
  fallback: boolean;
  // Visitor rating of a bot reply: 1 = 👍, -1 = 👎, 0 = none.
  feedback: number;
  // A/B variant this bot reply was generated under.
  variant?: "A" | "B";
  // For a fallback user question: set true once the owner has answered it.
  resolved: boolean;
  // URLs of files/images the visitor attached to this message.
  attachments: string[];
  // For a bot message: the knowledge sources the answer drew from (citations).
  sources: { title?: string; url?: string; snippet?: string }[];
  // For a bot message: retrieval confidence (top similarity score, 0–1).
  confidence?: number;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    ownerId: { type: String, required: true, index: true },
    botId: { type: Schema.Types.ObjectId, ref: "Bot", index: true },
    role: {
      type: String,
      enum: ["user", "bot", "agent"],
      required: true,
    },
    content: { type: String, required: true },
    fallback: { type: Boolean, default: false },
    feedback: { type: Number, default: 0 },
    variant: { type: String, enum: ["A", "B"] },
    resolved: { type: Boolean, default: false },
    attachments: { type: [String], default: [] },
    sources: {
      type: [{ title: String, url: String, snippet: String }],
      default: [],
    },
    confidence: { type: Number },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
// Knowledge-gap analytics: unanswered user questions per owner.
messageSchema.index({ ownerId: 1, fallback: 1, resolved: 1 });

const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);

export default Message;
