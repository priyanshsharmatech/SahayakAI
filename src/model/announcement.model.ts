import mongoose, { Schema } from "mongoose";

/**
 * A platform-wide announcement/broadcast created by an admin and shown as a
 * banner in every client's dashboard while `active`.
 */
export interface IAnnouncement {
  title: string;
  body: string;
  level: "info" | "warning" | "success";
  active: boolean;
  createdByEmail: string;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, default: "" },
    body: { type: String, required: true },
    level: {
      type: String,
      enum: ["info", "warning", "success"],
      default: "info",
    },
    active: { type: Boolean, default: true },
    createdByEmail: { type: String, default: "" },
  },
  { timestamps: true },
);

announcementSchema.index({ active: 1, createdAt: -1 });

const Announcement =
  mongoose.models.Announcement ||
  mongoose.model("Announcement", announcementSchema);

export default Announcement;
