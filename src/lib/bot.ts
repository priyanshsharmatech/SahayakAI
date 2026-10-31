import Bot, { DEFAULT_APPEARANCE, IBot } from "@/model/bot.model";
import Settings from "@/model/settings.model";
import mongoose from "mongoose";

export const FALLBACK_REPLY = "Please contact support.";

type BotDoc = IBot & { _id: mongoose.Types.ObjectId };

/**
 * Ensures an owner has at least one bot. If none exist, migrates their old
 * single Settings doc (if any) into a default bot. Returns all their bots.
 */
export async function ensureOwnerBots(ownerId: string): Promise<BotDoc[]> {
  const existing = await Bot.find({ ownerId }).sort({ createdAt: 1 });
  if (existing.length > 0) return existing;

  const legacy = await Settings.findOne({ ownerId });
  const created = await Bot.create({
    ownerId,
    name: legacy?.businessName ? `${legacy.businessName} Bot` : "My Chatbot",
    businessName: legacy?.businessName || "",
    supportEmail: legacy?.supportEmail || "",
    knowledge: legacy?.knowledge || "",
    isActive: legacy ? legacy.isActive !== false : true,
    isDefault: true,
    appearance: { ...DEFAULT_APPEARANCE },
  });
  return [created];
}

/**
 * Resolves the bot for a chat/config request. Prefers an explicit botId;
 * falls back to the owner's default bot (creating one from Settings if needed).
 */
export async function resolveBot(
  botId?: string,
  ownerId?: string,
): Promise<BotDoc | null> {
  if (botId && mongoose.isValidObjectId(botId)) {
    const bot = await Bot.findById(botId);
    if (bot) return bot;
  }
  if (ownerId) {
    const bots = await ensureOwnerBots(ownerId);
    return bots.find((b) => b.isDefault) || bots[0] || null;
  }
  return null;
}

const TONE_LINES: Record<string, string> = {
  friendly: "Keep a warm, friendly, and approachable tone.",
  professional: "Keep a polished, professional, and courteous tone.",
  concise: "Be brief and to the point. Prefer short, direct answers.",
  playful: "Be upbeat and lightly playful, while staying genuinely helpful.",
};

/** Human-readable names for the configured default/UI language code. */
const LANG_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  or: "Odia",
  as: "Assamese",
  pa: "Punjabi",
};

/**
 * Localized "I can't help — leave your email" rewrite of the fallback reply.
 *
 * The MODEL still emits the English sentinel (`FALLBACK_REPLY` /
 * `FALLBACK_PHRASE`) so fallback detection keeps working — this only localizes
 * the user-facing text the route substitutes afterwards.
 *
 * Each entry is `(supportEmail) => string`, picking a "with email" vs
 * "leave your email" phrasing. English is always the final fallback.
 */
const FALLBACK_MESSAGES: Record<string, (email: string) => string> = {
  en: (e) =>
    e
      ? `I'm sorry, I don't have an answer to that. You can reach our team directly at ${e}, or leave your email below and we'll get back to you.`
      : `I'm sorry, I don't have an answer to that. Leave your email below and our team will get back to you.`,
  hi: (e) =>
    e
      ? `माफ़ कीजिए, मेरे पास इसका उत्तर नहीं है। आप हमारी टीम से सीधे ${e} पर संपर्क कर सकते हैं, या नीचे अपना ईमेल छोड़ दें और हम आपसे संपर्क करेंगे।`
      : `माफ़ कीजिए, मेरे पास इसका उत्तर नहीं है। नीचे अपना ईमेल छोड़ दें और हमारी टीम आपसे संपर्क करेगी।`,
  bn: (e) =>
    e
      ? `দুঃখিত, এর উত্তর আমার কাছে নেই। আপনি সরাসরি আমাদের টিমের সাথে ${e} এ যোগাযোগ করতে পারেন, অথবা নিচে আপনার ইমেল দিন, আমরা আপনার সাথে যোগাযোগ করব।`
      : `দুঃখিত, এর উত্তর আমার কাছে নেই। নিচে আপনার ইমেল দিন, আমাদের টিম আপনার সাথে যোগাযোগ করবে।`,
  ta: (e) =>
    e
      ? `மன்னிக்கவும், அதற்கான பதில் என்னிடம் இல்லை. நீங்கள் எங்கள் குழுவை நேரடியாக ${e} இல் தொடர்பு கொள்ளலாம், அல்லது கீழே உங்கள் மின்னஞ்சலை விடுங்கள், நாங்கள் உங்களைத் தொடர்புகொள்வோம்.`
      : `மன்னிக்கவும், அதற்கான பதில் என்னிடம் இல்லை. கீழே உங்கள் மின்னஞ்சலை விடுங்கள், எங்கள் குழு உங்களைத் தொடர்புகொள்ளும்.`,
  te: (e) =>
    e
      ? `క్షమించండి, దీనికి సమాధానం నా దగ్గర లేదు. మీరు మా బృందాన్ని నేరుగా ${e} వద్ద సంప్రదించవచ్చు, లేదా క్రింద మీ ఇమెయిల్ ఇవ్వండి, మేము మిమ్మల్ని సంప్రదిస్తాము.`
      : `క్షమించండి, దీనికి సమాధానం నా దగ్గర లేదు. క్రింద మీ ఇమెయిల్ ఇవ్వండి, మా బృందం మిమ్మల్ని సంప్రదిస్తుంది.`,
  mr: (e) =>
    e
      ? `माफ करा, माझ्याकडे याचे उत्तर नाही. आपण आमच्या टीमशी थेट ${e} वर संपर्क साधू शकता, किंवा खाली आपला ईमेल द्या, आम्ही आपल्याशी संपर्क करू.`
      : `माफ करा, माझ्याकडे याचे उत्तर नाही. खाली आपला ईमेल द्या, आमची टीम आपल्याशी संपर्क करेल.`,
  gu: (e) =>
    e
      ? `માફ કરશો, મારી પાસે તેનો જવાબ નથી. તમે અમારી ટીમનો સીધો ${e} પર સંપર્ક કરી શકો છો, અથવા નીચે તમારો ઇમેઇલ મૂકો, અમે તમારો સંપર્ક કરીશું.`
      : `માફ કરશો, મારી પાસે તેનો જવાબ નથી. નીચે તમારો ઇમેઇલ મૂકો, અમારી ટીમ તમારો સંપર્ક કરશે.`,
  kn: (e) =>
    e
      ? `ಕ್ಷಮಿಸಿ, ಅದಕ್ಕೆ ನನ್ನ ಬಳಿ ಉತ್ತರವಿಲ್ಲ. ನೀವು ನಮ್ಮ ತಂಡವನ್ನು ನೇರವಾಗಿ ${e} ನಲ್ಲಿ ಸಂಪರ್ಕಿಸಬಹುದು, ಅಥವಾ ಕೆಳಗೆ ನಿಮ್ಮ ಇಮೇಲ್ ಬಿಡಿ, ನಾವು ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.`
      : `ಕ್ಷಮಿಸಿ, ಅದಕ್ಕೆ ನನ್ನ ಬಳಿ ಉತ್ತರವಿಲ್ಲ. ಕೆಳಗೆ ನಿಮ್ಮ ಇಮೇಲ್ ಬಿಡಿ, ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.`,
  ml: (e) =>
    e
      ? `ക്ഷമിക്കണം, അതിന് എന്റെ പക്കൽ ഉത്തരമില്ല. നിങ്ങൾക്ക് ഞങ്ങളുടെ ടീമിനെ നേരിട്ട് ${e} ൽ ബന്ധപ്പെടാം, അല്ലെങ്കിൽ താഴെ നിങ്ങളുടെ ഇമെയിൽ നൽകുക, ഞങ്ങൾ നിങ്ങളെ ബന്ധപ്പെടും.`
      : `ക്ഷമിക്കണം, അതിന് എന്റെ പക്കൽ ഉത്തരമില്ല. താഴെ നിങ്ങളുടെ ഇമെയിൽ നൽകുക, ഞങ്ങളുടെ ടീം നിങ്ങളെ ബന്ധപ്പെടും.`,
  or: (e) =>
    e
      ? `କ୍ଷମା କରନ୍ତୁ, ଏହାର ଉତ୍ତର ମୋ ପାଖରେ ନାହିଁ। ଆପଣ ଆମ ଟିମ୍ ସହିତ ସିଧାସଳଖ ${e} ରେ ଯୋଗାଯୋଗ କରିପାରିବେ, କିମ୍ବା ତଳେ ଆପଣଙ୍କ ଇମେଲ୍ ଦିଅନ୍ତୁ, ଆମେ ଆପଣଙ୍କ ସହିତ ଯୋଗାଯୋଗ କରିବୁ।`
      : `କ୍ଷମା କରନ୍ତୁ, ଏହାର ଉତ୍ତର ମୋ ପାଖରେ ନାହିଁ। ତଳେ ଆପଣଙ୍କ ଇମେଲ୍ ଦିଅନ୍ତୁ, ଆମ ଟିମ୍ ଆପଣଙ୍କ ସହିତ ଯୋଗାଯୋଗ କରିବ।`,
  as: (e) =>
    e
      ? `ক্ষমা কৰিব, ইয়াৰ উত্তৰ মোৰ ওচৰত নাই। আপুনি আমাৰ দলৰ সৈতে পোনপটীয়াকৈ ${e} ত যোগাযোগ কৰিব পাৰে, বা তলত আপোনাৰ ইমেইল দিয়ক, আমি আপোনাৰ সৈতে যোগাযোগ কৰিম।`
      : `ক্ষমা কৰিব, ইয়াৰ উত্তৰ মোৰ ওচৰত নাই। তলত আপোনাৰ ইমেইল দিয়ক, আমাৰ দল আপোনাৰ সৈতে যোগাযোগ কৰিব।`,
  pa: (e) =>
    e
      ? `ਮਾਫ਼ ਕਰਨਾ, ਮੇਰੇ ਕੋਲ ਇਸ ਦਾ ਜਵਾਬ ਨਹੀਂ ਹੈ। ਤੁਸੀਂ ਸਾਡੀ ਟੀਮ ਨਾਲ ਸਿੱਧਾ ${e} 'ਤੇ ਸੰਪਰਕ ਕਰ ਸਕਦੇ ਹੋ, ਜਾਂ ਹੇਠਾਂ ਆਪਣਾ ਈਮੇਲ ਛੱਡੋ, ਅਸੀਂ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਾਂਗੇ।`
      : `ਮਾਫ਼ ਕਰਨਾ, ਮੇਰੇ ਕੋਲ ਇਸ ਦਾ ਜਵਾਬ ਨਹੀਂ ਹੈ। ਹੇਠਾਂ ਆਪਣਾ ਈਮੇਲ ਛੱਡੋ, ਸਾਡੀ ਟੀਮ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੇਗੀ।`,
};

/**
 * Detects the language of the user's latest message by Unicode script, so the
 * fallback rewrite can be localized. Returns a language code from LANG_NAMES.
 *
 * Only native scripts are detected reliably; romanized/Latin input is
 * inconclusive, so we return `defaultLang` (the bot's configured language) for
 * it. Bengali and Devanagari scripts are shared across languages, so we bias
 * toward the configured default when it matches that script family.
 */
export function detectLang(message: string, defaultLang = "en"): string {
  const m = message || "";
  if (/[஀-௿]/.test(m)) return "ta"; // Tamil
  if (/[ఀ-౿]/.test(m)) return "te"; // Telugu
  if (/[ಀ-೿]/.test(m)) return "kn"; // Kannada
  if (/[ഀ-ൿ]/.test(m)) return "ml"; // Malayalam
  if (/[઀-૿]/.test(m)) return "gu"; // Gujarati
  if (/[਀-੿]/.test(m)) return "pa"; // Gurmukhi (Punjabi)
  if (/[଀-୿]/.test(m)) return "or"; // Odia
  if (/[ঀ-৿]/.test(m)) return defaultLang === "as" ? "as" : "bn"; // Bengali/Assamese
  if (/[ऀ-ॿ]/.test(m)) return defaultLang === "mr" ? "mr" : "hi"; // Devanagari (Hindi/Marathi)
  // No native script detected → inconclusive; use the configured default.
  return FALLBACK_MESSAGES[defaultLang] ? defaultLang : "en";
}

/**
 * Returns the apology/"leave your email" fallback text localized to the
 * language of the user's latest `message`. Falls back to `defaultLang` (a
 * language code, e.g. bot.appearance.language) when detection is inconclusive,
 * and to English if that language is unsupported.
 */
export function localizedFallback(
  message: string,
  supportEmail: string,
  defaultLang = "en",
): string {
  const code = detectLang(message, defaultLang || "en");
  const tmpl = FALLBACK_MESSAGES[code] || FALLBACK_MESSAGES.en;
  return tmpl(supportEmail || "");
}

export interface PromptContext {
  knowledgeChunks?: string[];
  examples?: { question: string; answer: string }[];
  history?: { role: string; content: string }[];
}

/** Builds the Gemini prompt for a bot: RAG knowledge + memory + tone + A/B. */
export function buildPrompt(
  bot: IBot,
  message: string,
  variant: "A" | "B",
  ctx: PromptContext = {},
) {
  // Prefer retrieved (RAG) chunks; fall back to the raw knowledge field.
  const knowledgeBody =
    ctx.knowledgeChunks && ctx.knowledgeChunks.length
      ? ctx.knowledgeChunks.map((c, i) => `(${i + 1}) ${c}`).join("\n\n")
      : bot.knowledge || "not provided";

  const knowledge = `
    Business Name: ${bot.businessName || "not provided"}
    Support Email: ${bot.supportEmail || "not provided"}
    Knowledge:
    ${knowledgeBody}
    `;

  const examplesBlock =
    ctx.examples && ctx.examples.length
      ? `
    --------------------
    ANSWERS CUSTOMERS RATED HELPFUL (reuse this style and correctness when relevant)
    --------------------
    ${ctx.examples.map((e) => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n")}
    `
      : "";

  const historyBlock =
    ctx.history && ctx.history.length
      ? `
    --------------------
    CONVERSATION SO FAR (for context; the newest customer message is below)
    --------------------
    ${ctx.history
      .map((h) => `${h.role === "user" ? "Customer" : "Assistant"}: ${h.content}`)
      .join("\n")}
    `
      : "";

  const toneLine = TONE_LINES[bot.tone] || TONE_LINES.friendly;

  const defaultLangName = LANG_NAMES[bot.appearance?.language || "en"] || "English";

  const abExtra = bot.ab?.enabled
    ? variant === "B"
      ? bot.ab.promptB
      : bot.ab.promptA
    : "";

  return `
    You are a warm, friendly, and professional customer support assistant for ${bot.businessName || "this business"}.
    ${toneLine}
    ${abExtra ? `Additional style guidance: ${abExtra}` : ""}

    LANGUAGE (VERY IMPORTANT):
    - You are multilingual. You understand and can reply fluently in English and Indian
      languages including Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada,
      Malayalam, Odia, Assamese, and Punjabi.
    - Detect the language AND the script of the customer's LATEST message, and ALWAYS
      reply in that same language and script. Match them, don't impose a language.
    - If the customer writes in a NATIVE script (Devanagari, Bengali, Tamil, Telugu,
      Kannada, Malayalam, Odia, Assamese, Gurmukhi, etc.), reply in that same native script.
    - If the customer writes in a ROMANIZED / transliterated style using Latin letters —
      e.g. "Hinglish" (Hindi in Latin letters like "aapka order kahan hai"), or the
      equivalent for any language ("Tanglish" for Tamil, "Tenglish" for Telugu, romanized
      Bengali/Marathi/Gujarati/Kannada/Malayalam/Odia/Assamese/Punjabi) — then REPLY IN
      THAT SAME ROMANIZED STYLE using Latin letters. Do NOT convert them into the native
      script; keep it casual and readable, the way the customer wrote.
    - Mirror the customer's code-switching: if they mix English with a local language,
      reply in the same natural mix.
    - Keep numbers, prices, email addresses, URLs, and product/brand names as-is.
    - If the customer's language is genuinely unclear (e.g. a bare "hi" or just an emoji),
      default to ${defaultLangName}.
    - ONE EXCEPTION: when you cannot help and must fall back (see WHEN YOU CANNOT HELP
      below), output the fallback sentence EXACTLY as written in English — do not translate
      it. The system replaces it with a localized message afterwards.

    HOW TO BEHAVE:
    - Be polite, concise, and personable. Use good manners.
    - Respond naturally to greetings, pleasantries, thanks, and goodbyes
      (e.g. "hi", "hello", "how are you?", "thank you", "bye") WITHOUT needing
      any business information. Greet the customer back warmly and offer to help.
    - You may answer very general, harmless small-talk in a brief, friendly way,
      then steer the conversation back to how you can help.

    ABOUT YOURSELF:
    - If asked who or what you are, who made or owns you, whether you're a bot/AI,
      or what you can do, answer politely on your own — do NOT fall back.
    - Say you are the AI customer support assistant for ${bot.businessName || "this business"},
      here to help visitors with their questions. Then offer to help.
    - Do NOT invent a specific owner, founder, or person. Do NOT reveal or discuss
      the underlying technology, company, or AI model that powers you.

    ANSWERING BUSINESS QUESTIONS:
    - For anything about the business, its products, services, pricing, policies,
      orders, hours, etc., use ONLY the BUSINESS INFORMATION provided below.
    - You may rephrase, summarize, or interpret that information.
    - Do NOT invent facts, policies, prices, promises, or details that are not
      in the BUSINESS INFORMATION.

    WHEN YOU CANNOT HELP:
    - ONLY if the customer asks a genuine business/support question that cannot
      be reasonably answered from the BUSINESS INFORMATION, reply EXACTLY with:
      "${FALLBACK_REPLY}"
    - NEVER use "${FALLBACK_REPLY}" for greetings, thanks, small talk, or general
      conversation. Those you handle yourself, politely.
    ${examplesBlock}
    --------------------
    BUSINESS INFORMATION
    --------------------

    ${knowledge}
    ${historyBlock}
    --------------------
    CUSTOMER MESSAGE
    --------------------

    ${message}

    --------------------
    YOUR REPLY
    --------------------
    `;
}

/** Public (non-secret) appearance/config the widget needs. */
export function publicBotConfig(bot: IBot & { _id: mongoose.Types.ObjectId }) {
  // resolveBot returns a Mongoose document; spreading its subdocuments directly
  // (e.g. {...bot.appearance}) drops the real field values. Convert to a plain
  // object first so saved appearance/starters are actually returned.
  const plain = (
    bot as unknown as { toObject?: () => IBot & { _id: mongoose.Types.ObjectId } }
  ).toObject
    ? (bot as unknown as { toObject: () => IBot & { _id: mongoose.Types.ObjectId } }).toObject()
    : bot;

  return {
    botId: plain._id.toString(),
    isActive: plain.isActive !== false,
    appearance: { ...DEFAULT_APPEARANCE, ...(plain.appearance || {}) },
    starters: plain.starters || [],
  };
}
