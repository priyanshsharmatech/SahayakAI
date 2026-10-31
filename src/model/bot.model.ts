import mongoose, { Schema } from "mongoose";

export type BotTone = "friendly" | "professional" | "concise" | "playful";

export interface IBotAppearance {
  primaryColor: string;
  position: "right" | "left";
  launcherShape: "circle" | "squircle" | "rounded" | "square" | "teardrop" | "leaf";
  launcherIcon: string;
  launcherIconKey: string;
  avatarIconKey: string;
  offsetBottom: number;
  offsetSide: number;
  botName: string;
  avatarUrl: string;
  welcomeMessage: string;
  // Widget theme: dark-mode support.
  theme: "light" | "dark" | "auto";
  // BCP-47 language code for the widget UI strings (i18n).
  language: string;
  // Proactive auto-open.
  proactiveEnabled: boolean;
  proactiveMessage: string;
  proactiveDelay: number; // seconds before auto-opening
  // Scheduled availability.
  availabilityEnabled: boolean;
  availabilityTimezone: string; // IANA tz, e.g. "Asia/Kolkata"
  availabilityDays: number[]; // open weekdays, 0=Sun..6=Sat
  availabilityStart: string; // "HH:MM" 24h
  availabilityEnd: string; // "HH:MM" 24h
  offlineMessage: string; // shown when outside available hours
  // Visitor-experience toggles (all flow to the widget via publicBotConfig).
  showCitations: boolean; // show the sources an answer came from
  voiceInput: boolean; // mic → speech-to-text
  ttsEnabled: boolean; // read bot replies aloud
  csatEnabled: boolean; // post-chat rating prompt
  quickRepliesEnabled: boolean; // show suggested follow-up chips
  bookingEnabled: boolean;
  bookingUrl: string;
  bookingLabel: string;
  preChatEnabled: boolean;
  preChatFields: { key: string; label: string; type?: string; required?: boolean }[];
  consentEnabled: boolean;
  consentText: string;
  // Away message shown when a human is requested but none are available.
  awayMessage: string;
  // Advanced appearance.
  customCss: string; // raw CSS injected into the widget (owner-controlled)
  showBranding: boolean; // show the "Powered by" line
  // Per-page targeting: only show (or hide) the widget on matching path globs.
  pagePaths: string[];
  pagePathsMode: "show" | "hide";
  // How the proactive teaser fires: after a delay, on scroll depth, or exit-intent.
  proactiveTrigger: "delay" | "scroll" | "exit";
  proactiveScrollPercent: number; // for "scroll" trigger (0–100)
  // In-widget help-center / FAQ search.
  helpCenterEnabled: boolean;
  // Optional in-chat survey (sequence of questions).
  surveyEnabled: boolean;
  surveyQuestions: string[];
  // Let the visitor switch the widget UI language.
  languageSwitcher: boolean;
}

export interface IBotAB {
  enabled: boolean;
  promptA: string; // extra style/instruction text for variant A
  promptB: string; // extra style/instruction text for variant B
}

export interface IBot {
  ownerId: string;
  name: string;
  businessName: string;
  supportEmail: string;
  knowledge: string;
  isActive: boolean;
  isDefault: boolean;
  appearance: IBotAppearance;
  starters: string[];
  tone: BotTone;
  ab: IBotAB;
  // Cloudinary public_id of the uploaded avatar (for deleting the old one on replace).
  avatarPublicId: string;
  // Security & data governance.
  allowedDomains: string[]; // CORS allowlist; empty = open ("*")
  dataRetentionDays: number; // auto-purge conversations older than this; 0 = keep forever
  confidenceThreshold: number; // 0–1; below this top-match score the bot falls back
  // Install verification: updated when the widget loads its config on a real page.
  lastSeenAt?: Date;
  lastSeenDomain?: string;
}

export const DEFAULT_APPEARANCE: IBotAppearance = {
  primaryColor: "#000000",
  position: "right",
  launcherShape: "circle",
  launcherIcon: "💬",
  launcherIconKey: "",
  avatarIconKey: "",
  offsetBottom: 24,
  offsetSide: 24,
  botName: "Support Assistant",
  avatarUrl: "",
  welcomeMessage: "Hi! How can I help you today?",
  theme: "light",
  language: "en",
  proactiveEnabled: false,
  proactiveMessage: "👋 Hi there! Need any help?",
  proactiveDelay: 8,
  availabilityEnabled: false,
  availabilityTimezone: "Asia/Kolkata",
  availabilityDays: [1, 2, 3, 4, 5],
  availabilityStart: "09:00",
  availabilityEnd: "18:00",
  offlineMessage:
    "We're currently offline. Leave a message and we'll get back to you.",
  showCitations: false,
  voiceInput: false,
  ttsEnabled: false,
  csatEnabled: false,
  quickRepliesEnabled: true,
  bookingEnabled: false,
  bookingUrl: "",
  bookingLabel: "Book a meeting",
  preChatEnabled: false,
  preChatFields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
  ],
  consentEnabled: false,
  consentText:
    "By chatting, you agree to our privacy policy. We use your messages only to help you.",
  awayMessage:
    "Our team isn't available right now. Leave your email and we'll get back to you.",
  customCss: "",
  showBranding: true,
  pagePaths: [],
  pagePathsMode: "show",
  proactiveTrigger: "delay",
  proactiveScrollPercent: 50,
  helpCenterEnabled: false,
  surveyEnabled: false,
  surveyQuestions: [],
  languageSwitcher: false,
};

// Pre-chat form field. NOTE: the `type` property must be written as
// `type: { type: String }` — a bare `type: String` collides with Mongoose's
// reserved `type` descriptor keyword and silently turns the whole field into
// a `[String]` array (which then fails to cast the object default).
const preChatFieldSchema = new Schema(
  {
    key: { type: String },
    label: { type: String },
    type: { type: String },
    required: { type: Boolean, default: false },
  },
  { _id: false },
);

const appearanceSchema = new Schema<IBotAppearance>(
  {
    primaryColor: { type: String, default: DEFAULT_APPEARANCE.primaryColor },
    position: { type: String, enum: ["right", "left"], default: "right" },
    launcherShape: {
      type: String,
      enum: ["circle", "squircle", "rounded", "square", "teardrop", "leaf"],
      default: "circle",
    },
    launcherIcon: { type: String, default: DEFAULT_APPEARANCE.launcherIcon },
    launcherIconKey: { type: String, default: "" },
    avatarIconKey: { type: String, default: "" },
    offsetBottom: { type: Number, default: 24, min: 0, max: 200 },
    offsetSide: { type: Number, default: 24, min: 0, max: 200 },
    botName: { type: String, default: DEFAULT_APPEARANCE.botName },
    avatarUrl: { type: String, default: "" },
    welcomeMessage: {
      type: String,
      default: DEFAULT_APPEARANCE.welcomeMessage,
    },
    theme: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "light",
    },
    language: { type: String, default: "en" },
    proactiveEnabled: { type: Boolean, default: false },
    proactiveMessage: { type: String, default: DEFAULT_APPEARANCE.proactiveMessage },
    proactiveDelay: { type: Number, default: 8, min: 0, max: 600 },
    availabilityEnabled: { type: Boolean, default: false },
    availabilityTimezone: { type: String, default: "Asia/Kolkata" },
    availabilityDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    availabilityStart: { type: String, default: "09:00" },
    availabilityEnd: { type: String, default: "18:00" },
    offlineMessage: { type: String, default: DEFAULT_APPEARANCE.offlineMessage },
    showCitations: { type: Boolean, default: false },
    voiceInput: { type: Boolean, default: false },
    ttsEnabled: { type: Boolean, default: false },
    csatEnabled: { type: Boolean, default: false },
    quickRepliesEnabled: { type: Boolean, default: true },
    bookingEnabled: { type: Boolean, default: false },
    bookingUrl: { type: String, default: "" },
    bookingLabel: { type: String, default: "Book a meeting" },
    preChatEnabled: { type: Boolean, default: false },
    preChatFields: {
      type: [preChatFieldSchema],
      // Return a fresh copy per document so bots never share the default array.
      default: () => (DEFAULT_APPEARANCE.preChatFields || []).map((f) => ({ ...f })),
    },
    consentEnabled: { type: Boolean, default: false },
    consentText: { type: String, default: DEFAULT_APPEARANCE.consentText },
    awayMessage: { type: String, default: DEFAULT_APPEARANCE.awayMessage },
    customCss: { type: String, default: "" },
    showBranding: { type: Boolean, default: true },
    pagePaths: { type: [String], default: [] },
    pagePathsMode: { type: String, enum: ["show", "hide"], default: "show" },
    proactiveTrigger: {
      type: String,
      enum: ["delay", "scroll", "exit"],
      default: "delay",
    },
    proactiveScrollPercent: { type: Number, default: 50, min: 0, max: 100 },
    helpCenterEnabled: { type: Boolean, default: false },
    surveyEnabled: { type: Boolean, default: false },
    surveyQuestions: { type: [String], default: [] },
    languageSwitcher: { type: Boolean, default: false },
  },
  { _id: false },
);

const abSchema = new Schema<IBotAB>(
  {
    enabled: { type: Boolean, default: false },
    promptA: { type: String, default: "" },
    promptB: { type: String, default: "" },
  },
  { _id: false },
);

const botSchema = new Schema<IBot>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, default: "My Chatbot" },
    businessName: { type: String, default: "" },
    supportEmail: { type: String, default: "" },
    knowledge: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    appearance: { type: appearanceSchema, default: () => ({}) },
    starters: { type: [String], default: [] },
    tone: {
      type: String,
      enum: ["friendly", "professional", "concise", "playful"],
      default: "friendly",
    },
    ab: { type: abSchema, default: () => ({}) },
    avatarPublicId: { type: String, default: "" },
    allowedDomains: { type: [String], default: [] },
    dataRetentionDays: { type: Number, default: 0, min: 0 },
    confidenceThreshold: { type: Number, default: 0, min: 0, max: 1 },
    lastSeenAt: { type: Date },
    lastSeenDomain: { type: String },
  },
  { timestamps: true },
);

const Bot = mongoose.models.Bot || mongoose.model("Bot", botSchema);
export default Bot;
