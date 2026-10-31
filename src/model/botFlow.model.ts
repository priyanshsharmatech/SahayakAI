import mongoose, { Schema } from "mongoose";

/**
 * A step-based conversational flow (lightweight "visual flow builder"). A flow
 * is an ordered set of steps with branching via each step's `next`/choice
 * targets. The widget runs it client-side from the definition in bot-config.
 *
 * Step types:
 *  - message : show `text`, then go to `next`
 *  - choices : show `text` + `choices[]` buttons; each choice has its own `next`
 *  - collect : ask `text`, store the reply under `field`, then `next`
 *  - handoff : request a human agent
 *  - end     : terminate the flow
 */
export interface IFlowStep {
  id: string;
  type: "message" | "choices" | "collect" | "handoff" | "end";
  text: string;
  choices?: { label: string; next?: string }[];
  field?: string; // for "collect"
  next?: string; // next step id (for message/collect)
}

export interface IBotFlow {
  ownerId: string;
  botId: mongoose.Types.ObjectId;
  name: string;
  enabled: boolean;
  trigger: string; // keyword/phrase that launches it; "" = manual/menu only
  steps: IFlowStep[];
}

const stepSchema = new Schema<IFlowStep>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["message", "choices", "collect", "handoff", "end"],
      required: true,
    },
    text: { type: String, default: "" },
    choices: {
      type: [{ label: String, next: String }],
      default: undefined,
    },
    field: { type: String },
    next: { type: String },
  },
  { _id: false },
);

const botFlowSchema = new Schema<IBotFlow>(
  {
    ownerId: { type: String, required: true, index: true },
    botId: { type: Schema.Types.ObjectId, ref: "Bot", required: true, index: true },
    name: { type: String, default: "Untitled flow" },
    enabled: { type: Boolean, default: false },
    trigger: { type: String, default: "" },
    steps: { type: [stepSchema], default: [] },
  },
  { timestamps: true },
);

const BotFlow =
  mongoose.models.BotFlow || mongoose.model("BotFlow", botFlowSchema);

export default BotFlow;
