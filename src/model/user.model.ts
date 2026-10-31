import mongoose, { Schema } from "mongoose";

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string;
  // How the account can sign in. "google" users may have no password until
  // they set one via the reset flow.
  provider: "password" | "google" | "both";
  resetTokenHash?: string;
  resetTokenExpiry?: Date;
  // Team membership: agents belong to an owner account.
  teamRole: "owner" | "agent";
  parentOwnerId?: string; // set on agents → the owner whose workspace they access
  // Agent presence for the live inbox.
  presence: "online" | "away" | "offline";
  presenceAt?: Date;
  // Platform staff role (in addition to env-var superadmins). null = not staff.
  adminRole?: "superadmin" | "support" | "analyst";
  // Team-member permission level within a workspace.
  agentPermission?: "viewer" | "agent" | "manager";
  // Per-user notification preferences.
  notifPrefs?: Record<string, boolean>;
  // Bumped to invalidate all existing sessions (password change / log-out-all).
  sessionEpoch: number;
  // True once this user has seen the first-run dashboard tour (per-account, so
  // it never replays on later logins or other devices).
  tourSeen?: boolean;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, default: "" },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String },
    provider: {
      type: String,
      enum: ["password", "google", "both"],
      default: "password",
    },
    resetTokenHash: { type: String },
    resetTokenExpiry: { type: Date },
    teamRole: { type: String, enum: ["owner", "agent"], default: "owner" },
    parentOwnerId: { type: String, index: true },
    presence: {
      type: String,
      enum: ["online", "away", "offline"],
      default: "offline",
    },
    presenceAt: { type: Date },
    adminRole: { type: String, enum: ["superadmin", "support", "analyst"] },
    // Team-member permission level within a workspace.
    agentPermission: {
      type: String,
      enum: ["viewer", "agent", "manager"],
      default: "agent",
    },
    // Per-user notification preferences (browser/sound/digest toggles).
    notifPrefs: { type: Schema.Types.Mixed, default: () => ({}) },
    sessionEpoch: { type: Number, default: 0 },
    tourSeen: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
