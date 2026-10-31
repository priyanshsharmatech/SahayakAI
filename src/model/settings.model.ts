import mongoose, { Schema } from "mongoose";

interface ISettings {
  ownerId: string;
  businessName: string;
  supportEmail: string;
  knowledge: string;
  email: string;
  isActive: boolean;
}

const settingsSchema = new Schema<ISettings>(
  {
    ownerId: {
      type: String,
      required: true,
      unique: true,
    },
    businessName: {
      type: String,
    },
    supportEmail: {
      type: String,
    },
    knowledge: {
      type: String,
    },
    // Account email of the owner (from the auth session), stored so the
    // superadmin can identify clients without a separate user lookup.
    email: {
      type: String,
    },
    // Superadmin can disable a client; a disabled client's widget stops answering.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Settings =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
export default Settings;
