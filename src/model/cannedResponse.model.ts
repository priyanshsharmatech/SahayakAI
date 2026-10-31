import mongoose, { Schema } from "mongoose";

/** A reusable canned reply / macro an owner's team can insert in the inbox. */
export interface ICannedResponse {
  ownerId: string;
  title: string;
  shortcut: string; // e.g. "/refund"
  content: string;
  category: string; // grouping label, e.g. "Billing"
}

const cannedResponseSchema = new Schema<ICannedResponse>(
  {
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    shortcut: { type: String, default: "" },
    content: { type: String, required: true },
    category: { type: String, default: "" },
  },
  { timestamps: true },
);

const CannedResponse =
  mongoose.models.CannedResponse ||
  mongoose.model("CannedResponse", cannedResponseSchema);

export default CannedResponse;
