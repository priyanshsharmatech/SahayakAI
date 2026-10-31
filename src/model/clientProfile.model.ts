import mongoose, { Schema } from "mongoose";

/**
 * Platform-admin metadata about a client (owner account): internal CRM notes,
 * lifecycle state, a monthly message quota, and feature flags. Keyed by the
 * owner's user id. Created lazily by the admin when first edited.
 */
export interface IClientProfile {
  ownerId: string;
  notes: string;
  tags: string[];
  lifecycle: "active" | "trial" | "suspended";
  monthlyMessageQuota: number; // 0 = unlimited
  featureFlags: Record<string, boolean>;
}

const clientProfileSchema = new Schema<IClientProfile>(
  {
    ownerId: { type: String, required: true, unique: true, index: true },
    notes: { type: String, default: "" },
    tags: { type: [String], default: [] },
    lifecycle: {
      type: String,
      enum: ["active", "trial", "suspended"],
      default: "active",
    },
    monthlyMessageQuota: { type: Number, default: 0, min: 0 },
    featureFlags: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true },
);

const ClientProfile =
  mongoose.models.ClientProfile ||
  mongoose.model("ClientProfile", clientProfileSchema);

export default ClientProfile;
