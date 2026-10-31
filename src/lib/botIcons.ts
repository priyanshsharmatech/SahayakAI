/**
 * Single source of truth for the built-in launcher/avatar icons, launcher
 * shapes, and ready-made "versions" (presets) a customer can pick for their bot.
 *
 * The React dashboard maps each `key` here to a lucide-react component for
 * rendering (see DashboardClient's ICON_COMPONENTS). The embeddable widget
 * (public/chatBot.js) cannot import TypeScript, so it keeps its own inline copy
 * of the matching SVGs in an `ICONS` map and shape radii in `SHAPE_RADIUS` —
 * the KEYS AND VALUES MUST STAY IN SYNC with the ones below. If you add/rename
 * an icon or shape here, update chatBot.js too.
 */

export const BOT_ICON_KEYS = [
  "chat",
  "message",
  "bot",
  "headset",
  "sparkles",
  "help",
  "smile",
  "zap",
  "heart",
  "star",
  "bell",
  "phone",
  "mail",
  "lifebuoy",
  "rocket",
  "flame",
  "hand",
  "ghost",
] as const;

export type BotIconKey = (typeof BOT_ICON_KEYS)[number];

export const BOT_ICON_LABELS: Record<BotIconKey, string> = {
  chat: "Chat bubble",
  message: "Message",
  bot: "Robot",
  headset: "Headset",
  sparkles: "Sparkles",
  help: "Question",
  smile: "Smiley",
  zap: "Bolt",
  heart: "Heart",
  star: "Star",
  bell: "Bell",
  phone: "Phone",
  mail: "Envelope",
  lifebuoy: "Life ring",
  rocket: "Rocket",
  flame: "Flame",
  hand: "Wave",
  ghost: "Ghost",
};

export const LAUNCHER_SHAPES = [
  "circle",
  "squircle",
  "rounded",
  "square",
  "teardrop",
  "leaf",
] as const;
export type LauncherShape = (typeof LAUNCHER_SHAPES)[number];

export const LAUNCHER_SHAPE_LABELS: Record<LauncherShape, string> = {
  circle: "Circle",
  squircle: "Squircle",
  rounded: "Rounded",
  square: "Square",
  teardrop: "Teardrop",
  leaf: "Leaf",
};

/**
 * CSS border-radius for each launcher shape. Percentage-based so the exact same
 * value renders correctly on the 62px widget launcher and the small dashboard
 * preview swatch alike.
 */
export const LAUNCHER_SHAPE_RADIUS: Record<LauncherShape, string> = {
  circle: "50%",
  squircle: "38%",
  rounded: "26%",
  square: "14%",
  teardrop: "50% 50% 50% 18%",
  leaf: "50% 18% 50% 18%",
};

export interface BotPreset {
  key: string;
  name: string;
  description: string;
  primaryColor: string;
  launcherShape: LauncherShape;
  launcherIconKey: BotIconKey;
  avatarIconKey: BotIconKey;
}

/** Ready-made "versions" of the bot the user can apply in one click. */
export const BOT_PRESETS: BotPreset[] = [
  {
    key: "classic",
    name: "Classic",
    description: "Clean & neutral",
    primaryColor: "#111827",
    launcherShape: "circle",
    launcherIconKey: "chat",
    avatarIconKey: "bot",
  },
  {
    key: "support",
    name: "Support Pro",
    description: "Trustworthy blue",
    primaryColor: "#2563eb",
    launcherShape: "circle",
    launcherIconKey: "headset",
    avatarIconKey: "lifebuoy",
  },
  {
    key: "ai",
    name: "AI Assistant",
    description: "Modern & smart",
    primaryColor: "#7c3aed",
    launcherShape: "squircle",
    launcherIconKey: "sparkles",
    avatarIconKey: "sparkles",
  },
  {
    key: "friendly",
    name: "Friendly",
    description: "Warm & approachable",
    primaryColor: "#db2777",
    launcherShape: "rounded",
    launcherIconKey: "smile",
    avatarIconKey: "smile",
  },
  {
    key: "energetic",
    name: "Energetic",
    description: "Bold & lively",
    primaryColor: "#ea580c",
    launcherShape: "teardrop",
    launcherIconKey: "zap",
    avatarIconKey: "flame",
  },
  {
    key: "minimal",
    name: "Minimal",
    description: "Sharp & compact",
    primaryColor: "#0f172a",
    launcherShape: "square",
    launcherIconKey: "message",
    avatarIconKey: "bot",
  },
  {
    key: "playful",
    name: "Playful",
    description: "Fun & quirky",
    primaryColor: "#8b5cf6",
    launcherShape: "leaf",
    launcherIconKey: "ghost",
    avatarIconKey: "ghost",
  },
  {
    key: "love",
    name: "Boutique",
    description: "Soft & personal",
    primaryColor: "#e11d48",
    launcherShape: "circle",
    launcherIconKey: "heart",
    avatarIconKey: "heart",
  },
];
