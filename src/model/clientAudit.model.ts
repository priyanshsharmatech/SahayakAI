import mongoose, { Schema } from "mongoose";

/**
 * Workspace-scoped audit log of actions taken by a client's own team
 * (owner + agents) — distinct from the platform-admin AuditLog. Scoped by the
 * owner (workspace) id.
 */
export interface IClientAudit {
  ownerId: string; // workspace owner id
  actorId: string;
  actorName: string;
  action: string; // e.g. "bot.update", "conversation.resolve", "team.add"
  detail?: string;
}

const clientAuditSchema = new Schema<IClientAudit>(
  {
    ownerId: { type: String, required: true, index: true },
    actorId: { type: String, required: true },
    actorName: { type: String, default: "" },
    action: { type: String, required: true },
    detail: { type: String },
  },
  { timestamps: true },
);

clientAuditSchema.index({ ownerId: 1, createdAt: -1 });

const ClientAudit =
  mongoose.models.ClientAudit ||
  mongoose.model("ClientAudit", clientAuditSchema);

export default ClientAudit;
