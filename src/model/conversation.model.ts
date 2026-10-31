import mongoose, { Schema } from "mongoose";

export interface IConversation {
  ownerId: string;
  botId?: mongoose.Types.ObjectId;
  visitorId: string;
  visitorEmail?: string;
  visitorName?: string;
  visitorUserId?: string;
  visitorAttributes?: Record<string, string>;
  meta?: {
    page?: string;
    referrer?: string;
    userAgent?: string;
    browser?: string;
    os?: string;
    device?: string;
    language?: string;
    timezone?: string;
    country?: string;
    city?: string;
  };
  messageCount: number;
  lastMessageAt: Date;
  escalated: boolean; // at least one message the bot could not answer
  needsHuman: boolean; // visitor asked for a human
  mode: "ai" | "human"; // when "human", the AI is paused and an agent replies
  variant: "A" | "B"; // A/B prompt variant assigned to this conversation
  agentTypingAt?: Date; // last time the human agent was typing (for live indicator)
  status: "open" | "resolved"; // conversation management
  tags: string[];
  assignedTo?: string; // userId of the team member handling this conversation
  notes: { authorId: string; authorName: string; text: string; createdAt: Date }[];
  rating: number; // post-chat CSAT, 1–5 (0 = not rated)
  ratingComment?: string;
  firstResponseAt?: Date; // first human-agent reply, for SLA
  consent: boolean; // visitor accepted the consent notice
  prechat?: Record<string, string>; // pre-chat form answers
  survey?: Record<string, string>; // in-chat survey answers
}

const conversationSchema = new Schema<IConversation>(
  {
    ownerId: { type: String, required: true, index: true },
    botId: { type: Schema.Types.ObjectId, ref: "Bot", index: true },
    visitorId: { type: String, required: true },
    visitorEmail: { type: String },
    visitorName: { type: String },
    visitorUserId: { type: String },
    visitorAttributes: { type: Schema.Types.Mixed },
    meta: {
      page: String,
      referrer: String,
      userAgent: String,
      browser: String,
      os: String,
      device: String,
      language: String,
      timezone: String,
      country: String,
      city: String,
    },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    escalated: { type: Boolean, default: false },
    needsHuman: { type: Boolean, default: false },
    mode: { type: String, enum: ["ai", "human"], default: "ai" },
    variant: { type: String, enum: ["A", "B"], default: "A" },
    agentTypingAt: { type: Date },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    tags: { type: [String], default: [] },
    assignedTo: { type: String },
    notes: {
      type: [
        {
          authorId: String,
          authorName: String,
          text: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingComment: { type: String },
    firstResponseAt: { type: Date },
    consent: { type: Boolean, default: false },
    prechat: { type: Schema.Types.Mixed },
    survey: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

conversationSchema.index({ ownerId: 1, updatedAt: -1 });
conversationSchema.index({ botId: 1, updatedAt: -1 });
conversationSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });
// Privacy export/delete + visitor lookups.
conversationSchema.index({ ownerId: 1, visitorId: 1 });
conversationSchema.index({ ownerId: 1, visitorEmail: 1 });

const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);

export default Conversation;
