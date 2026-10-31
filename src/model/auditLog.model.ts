import mongoose, { Schema } from "mongoose";

/**
 * Records privileged platform-admin (superadmin) actions for accountability:
 * impersonation, enabling/disabling clients, etc.
 */
export interface IAuditLog {
  actorId: string; // admin user id who performed the action
  actorEmail: string;
  action: string; // e.g. "impersonate.start", "impersonate.stop", "client.toggle"
  targetOwnerId?: string; // the client/owner acted upon
  targetEmail?: string;
  detail?: string; // short human-readable context
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: String, required: true, index: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetOwnerId: { type: String },
    targetEmail: { type: String },
    detail: { type: String },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
