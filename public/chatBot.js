(function () {
  // ---------- robustness: resolve the script tag even when currentScript is null ----------
  var scripttag =
    document.currentScript ||
    document.querySelector("script[data-bot-id]") ||
    document.querySelector("script[data-owner-id]");
  if (!scripttag) {
    console.error("Sahayak AI: unable to locate embed <script> tag.");
    return;
  }

  const botId = scripttag.getAttribute("data-bot-id");
  const ownerId = scripttag.getAttribute("data-owner-id"); // legacy support

  if (!botId && !ownerId) {
    console.error("Sahayak AI: data-bot-id (or data-owner-id) is missing.");
    return;
  }

  // API base = wherever this script was served (localhost in dev, Vercel in prod)
  let api_Base;
  try {
    api_Base =
      scripttag.getAttribute("data-api-base") ||
      new URL(scripttag.src).origin + "/api";
  } catch (e) {
    api_Base = "https://sahayak-ai-lilac.vercel.app/api";
  }
  // Visitor file/image upload is disabled in the widget. Flip to true to
  // restore the 📎 attach button, drag-and-drop, and paste-to-upload.
  const UPLOAD_ENABLED = false;

  // "Speak aloud" (text-to-speech) and the explicit language switcher are
  // removed from the widget UI. The bot still replies in the visitor's own
  // language — only these two manual controls are hidden. Flip to true to
  // restore them.
  const TTS_ENABLED = false;
  const LANG_SWITCHER_ENABLED = false;

  const chat_Url = api_Base + "/chat";
  const support_Url = api_Base + "/support-request";
  const feedback_Url = api_Base + "/chat/feedback";
  const poll_Url = api_Base + "/chat/poll";
  const human_Url = api_Base + "/chat/request-human";
  const upload_Url = api_Base + "/chat/upload";
  const rating_Url = api_Base + "/chat/rating";
  const flow_Url = api_Base + "/chat/flow";
  const help_Url = api_Base + "/chat/help";
  const survey_Url = api_Base + "/chat/survey";
  const config_Url =
    api_Base + "/bot-config?botId=" + (botId || "") + "&ownerId=" + (ownerId || "");

  // Stable visitor id + per-thread conversation id
  let visitorId;
  try {
    visitorId = localStorage.getItem("sahayak_visitor_id");
    if (!visitorId) {
      visitorId =
        (crypto.randomUUID && crypto.randomUUID()) ||
        "v-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem("sahayak_visitor_id", visitorId);
    }
  } catch (e) {
    visitorId = "v-" + Date.now();
  }
  let conversationId = null;
  let lastQuestion = "";
  let pollAfter = null;
  let pollTimer = null;
  let humanNoticeShown = false;
  let greeted = false;
  let humanMode = false;
  let agentTypingEl = null;
  let isOpen = false;
  let unread = 0;
  let restoring = false; // true while re-rendering persisted transcript (don't re-save)
  let proactiveScheduled = false;
  // visitor-experience feature state
  let userInteracted = false; // gates TTS autoplay
  let consentGiven = false;
  let prechatData = null;
  let ttsMuted = false;
  // owner-built step flows (fetched on load) + in-flow runner state
  let flows = [];
  let flow = null; // active flow: { map, order, data, awaitingField } — null when not in a flow

  // Per-bot storage keys
  const BOT_KEY = botId || ownerId || "default";
  const THREAD_KEY = "sahayak_thread_" + BOT_KEY;
  const PROACTIVE_KEY = "sahayak_proactive_" + BOT_KEY;
  const THREAD_TTL = 1000 * 60 * 60 * 24; // 24h
  const THREAD_CAP = 50;
  const PRECHAT_KEY = "sahayak_prechat_" + BOT_KEY;
  const CONSENT_KEY = "sahayak_consent_" + BOT_KEY;
  const TTS_KEY = "sahayak_tts_muted_" + BOT_KEY;
  const RATED_KEY = "sahayak_rated_" + BOT_KEY;
  const LANG_KEY = "sahayak_lang_" + BOT_KEY;
  const IDENTITY_KEY = "sahayak_identity_" + BOT_KEY;
  const SURVEY_KEY = "sahayak_survey_" + BOT_KEY;
  let visitorLang = null; // visitor-chosen UI language (overrides cfg.language)
  let storedIdentity = null; // persisted {name,email} from a prior visit
  try {
    consentGiven = localStorage.getItem(CONSENT_KEY) === "1";
    const pc = localStorage.getItem(PRECHAT_KEY);
    if (pc) prechatData = JSON.parse(pc);
    ttsMuted = localStorage.getItem(TTS_KEY) === "1";
    const vl = localStorage.getItem(LANG_KEY);
    if (vl) visitorLang = vl;
    const si = localStorage.getItem(IDENTITY_KEY);
    if (si) storedIdentity = JSON.parse(si);
  } catch (e) {}

  // Host-site identity: data-user-* attributes + window.SahayakAI.identify({...})
  const identity = {};
  try {
    const dn = scripttag.getAttribute("data-user-name");
    const de = scripttag.getAttribute("data-user-email");
    const du = scripttag.getAttribute("data-user-id");
    if (dn) identity.name = dn;
    if (de) identity.email = de;
    if (du) identity.userId = du;
  } catch (e) {}
  // Fold any persisted identity in (without clobbering host-provided values).
  if (storedIdentity && typeof storedIdentity === "object") {
    if (!identity.name && storedIdentity.name) identity.name = storedIdentity.name;
    if (!identity.email && storedIdentity.email) identity.email = storedIdentity.email;
  }
  function saveIdentity() {
    try {
      const obj = {};
      if (identity.name) obj.name = identity.name;
      if (identity.email) obj.email = identity.email;
      if (obj.name || obj.email) localStorage.setItem(IDENTITY_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  saveIdentity(); // persist any host-provided identity for returning recognition
  window.SahayakAI = window.SahayakAI || {};
  window.SahayakAI.identify = function (obj) {
    if (obj && typeof obj === "object") {
      Object.assign(identity, obj);
      saveIdentity();
    }
  };

  // Bundles identity + auto-captured context to send with each message.
  function buildVisitor() {
    const attributes = {};
    Object.keys(identity).forEach((k) => {
      if (k !== "name" && k !== "email" && k !== "userId") attributes[k] = identity[k];
    });
    let timezone = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {}
    return {
      name: identity.name,
      email: identity.email,
      userId: identity.userId,
      attributes,
      context: {
        page: location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone,
      },
    };
  }

  let cfg = {
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
    starters: [],
    // new fields (supplied by /api/bot-config appearance)
    theme: "light",
    language: "en",
    proactiveEnabled: false,
    proactiveMessage: "",
    proactiveDelay: 5,
    proactiveTrigger: "delay", // "delay" | "scroll" | "exit"
    proactiveScrollPercent: 50,
    availabilityEnabled: false,
    availabilityTimezone: "",
    availabilityDays: [],
    availabilityStart: "09:00",
    availabilityEnd: "17:00",
    offlineMessage: "",
    // visitor-experience features (supplied by /api/bot-config appearance)
    showCitations: false,
    voiceInput: false,
    ttsEnabled: false,
    csatEnabled: false,
    quickRepliesEnabled: true,
    bookingEnabled: false,
    bookingUrl: "",
    bookingLabel: "",
    preChatEnabled: false,
    preChatFields: [],
    consentEnabled: false,
    consentText: "",
    // advanced-appearance features (supplied by /api/bot-config appearance)
    awayMessage: "",
    customCss: "",
    showBranding: true,
    pagePaths: [],
    pagePathsMode: "show", // "show" | "hide"
    // end-user feature flags (supplied by /api/bot-config appearance)
    helpCenterEnabled: false,
    surveyEnabled: false,
    surveyQuestions: [],
    languageSwitcher: false,
  };

  function clampPx(v, def) {
    var n = Number(v);
    if (!isFinite(n)) n = def;
    return Math.max(0, Math.min(200, n));
  }

  /* ---------- i18n ---------- */
  const STRINGS = {
    en: {
      placeholder: "Type your message…",
      talkHuman: "💬 Talk to a human",
      online: "Online now",
      offline: "Offline",
      liveAgent: "Live with an agent",
      welcomeFallback: "Hi! How can I help you today?",
      connError: "Connection error. Please try again.",
      genError: "I'm sorry, I encountered an error. Please try again.",
      feedbackThanks: "Thanks for your feedback!",
      emailPlaceholder: "you@email.com",
      sendSupport: "Send to support",
      sending: "Sending…",
      invalidEmail: "Please enter a valid email.",
      escSuccess: "✓ Thanks! Our team will get back to you shortly.",
      escFail: "Couldn't send. Try again.",
      sendAria: "Send message",
      connectedAgent: "You're now connected with a support agent.",
      msgSentAgent: "Your message was sent to the support agent.",
      askedJoin: "We've asked a team member to join. You can keep typing meanwhile.",
      sendFirst: "Please send a message first, then we'll connect you.",
      newMessage: "New message",
      attach: "Attach image",
      uploadFail: "Upload failed. Please try again.",
      maxAttach: "You can attach up to 4 images.",
      tooBig: "Each image must be under 5MB.",
      badType: "Only PNG, JPEG, WEBP or GIF images are allowed.",
      sourcesLabel: "Sources",
      voiceTitle: "Voice input",
      ttsMute: "Mute voice",
      ttsUnmute: "Unmute voice",
      bookingDefault: "Book a meeting",
      ratePrompt: "How was your experience?",
      rateComment: "Add a comment (optional)",
      rateSubmit: "Submit",
      rateThanks: "Thanks for your feedback!",
      rateChat: "Rate this chat",
      consentAgree: "Agree & continue",
      consentDecline: "Decline",
      consentDefault: "By continuing, you agree to let us process your messages to provide support.",
      preChatStart: "Start chat",
      requiredField: "This field is required.",
      poweredBy: "Powered by Sahayak AI",
      awayFallback: "We're away at the moment. Leave your email and our team will get back to you.",
      welcomeBack: "Welcome back, {name}!",
      helpTitle: "Help center",
      helpOpen: "Help & FAQ",
      helpSearchPlaceholder: "Search for help…",
      helpEmpty: "No articles found. Try different words.",
      helpError: "Couldn't load help. Please try again.",
      helpPrompt: "Search our knowledge base for quick answers.",
      helpUse: "Add answer to chat",
      helpBack: "Back to chat",
      surveyShare: "Share feedback",
      surveyIntro: "We'd love your feedback.",
      surveyStep: "Question {n} of {total}",
      surveyNext: "Next",
      surveySubmit: "Submit",
      surveyPlaceholder: "Type your answer…",
      surveyThanks: "Thanks for sharing your feedback!",
      langTitle: "Language",
      dropHere: "Drop images to attach",
    },
    hi: {
      placeholder: "अपना संदेश लिखें…",
      talkHuman: "💬 किसी व्यक्ति से बात करें",
      online: "अभी ऑनलाइन",
      offline: "ऑफ़लाइन",
      liveAgent: "एजेंट के साथ लाइव",
      welcomeFallback: "नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?",
      connError: "कनेक्शन त्रुटि। कृपया पुनः प्रयास करें।",
      genError: "क्षमा करें, कोई त्रुटि हुई। कृपया पुनः प्रयास करें।",
      feedbackThanks: "आपकी प्रतिक्रिया के लिए धन्यवाद!",
      emailPlaceholder: "aap@email.com",
      sendSupport: "सपोर्ट को भेजें",
      sending: "भेजा जा रहा है…",
      invalidEmail: "कृपया एक मान्य ईमेल दर्ज करें।",
      escSuccess: "✓ धन्यवाद! हमारी टीम जल्द ही आपसे संपर्क करेगी।",
      escFail: "भेजा नहीं जा सका। पुनः प्रयास करें।",
      sendAria: "संदेश भेजें",
      connectedAgent: "अब आप एक सपोर्ट एजेंट से जुड़ गए हैं।",
      msgSentAgent: "आपका संदेश सपोर्ट एजेंट को भेज दिया गया है।",
      askedJoin: "हमने एक टीम सदस्य को जुड़ने के लिए कहा है। आप लिखते रह सकते हैं।",
      sendFirst: "कृपया पहले एक संदेश भेजें, फिर हम आपको जोड़ देंगे।",
      newMessage: "नया संदेश",
      attach: "चित्र संलग्न करें",
      uploadFail: "अपलोड विफल। कृपया पुनः प्रयास करें।",
      maxAttach: "आप अधिकतम 4 चित्र संलग्न कर सकते हैं।",
      tooBig: "प्रत्येक चित्र 5MB से कम होना चाहिए।",
      badType: "केवल PNG, JPEG, WEBP या GIF चित्र स्वीकार्य हैं।",
      sourcesLabel: "स्रोत",
      voiceTitle: "वॉइस इनपुट",
      ttsMute: "आवाज़ बंद करें",
      ttsUnmute: "आवाज़ चालू करें",
      bookingDefault: "मीटिंग बुक करें",
      ratePrompt: "आपका अनुभव कैसा रहा?",
      rateComment: "टिप्पणी जोड़ें (वैकल्पिक)",
      rateSubmit: "सबमिट करें",
      rateThanks: "आपकी प्रतिक्रिया के लिए धन्यवाद!",
      rateChat: "इस चैट को रेट करें",
      consentAgree: "सहमत हों और जारी रखें",
      consentDecline: "अस्वीकार करें",
      consentDefault: "जारी रखकर, आप हमें सहायता प्रदान करने के लिए अपने संदेशों को संसाधित करने की अनुमति देते हैं।",
      preChatStart: "चैट शुरू करें",
      requiredField: "यह फ़ील्ड आवश्यक है।",
      poweredBy: "Sahayak AI द्वारा संचालित",
      awayFallback: "हम इस समय उपलब्ध नहीं हैं। अपना ईमेल छोड़ें और हमारी टीम आपसे संपर्क करेगी।",
      welcomeBack: "वापसी पर स्वागत है, {name}!",
      helpTitle: "सहायता केंद्र",
      helpOpen: "सहायता और सामान्य प्रश्न",
      helpSearchPlaceholder: "सहायता खोजें…",
      helpEmpty: "कोई लेख नहीं मिला। अलग शब्द आज़माएँ।",
      helpError: "सहायता लोड नहीं हो सकी। कृपया पुनः प्रयास करें।",
      helpPrompt: "त्वरित उत्तरों के लिए हमारे नॉलेज बेस में खोजें।",
      helpUse: "उत्तर चैट में जोड़ें",
      helpBack: "चैट पर वापस जाएँ",
      surveyShare: "प्रतिक्रिया साझा करें",
      surveyIntro: "हमें आपकी प्रतिक्रिया अच्छी लगेगी।",
      surveyStep: "प्रश्न {n} / {total}",
      surveyNext: "अगला",
      surveySubmit: "सबमिट करें",
      surveyPlaceholder: "अपना उत्तर लिखें…",
      surveyThanks: "अपनी प्रतिक्रिया साझा करने के लिए धन्यवाद!",
      langTitle: "भाषा",
      dropHere: "संलग्न करने के लिए चित्र यहाँ छोड़ें",
    },
    bn: {
      placeholder: "আপনার বার্তা লিখুন…",
      talkHuman: "💬 একজন ব্যক্তির সাথে কথা বলুন",
      online: "এখন অনলাইন",
      offline: "অফলাইন",
      liveAgent: "এজেন্টের সাথে লাইভ",
      welcomeFallback: "নমস্কার! আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
      connError: "সংযোগ ত্রুটি। অনুগ্রহ করে আবার চেষ্টা করুন।",
      genError: "দুঃখিত, একটি ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
      feedbackThanks: "আপনার মতামতের জন্য ধন্যবাদ!",
      emailPlaceholder: "apni@email.com",
      sendSupport: "সাপোর্টে পাঠান",
      sending: "পাঠানো হচ্ছে…",
      invalidEmail: "অনুগ্রহ করে একটি বৈধ ইমেল লিখুন।",
      escSuccess: "✓ ধন্যবাদ! আমাদের টিম শীঘ্রই আপনার সাথে যোগাযোগ করবে।",
      escFail: "পাঠানো যায়নি। আবার চেষ্টা করুন।",
      sendAria: "বার্তা পাঠান",
      connectedAgent: "আপনি এখন একজন সাপোর্ট এজেন্টের সাথে সংযুক্ত হয়েছেন।",
      msgSentAgent: "আপনার বার্তা সাপোর্ট এজেন্টের কাছে পাঠানো হয়েছে।",
      askedJoin: "আমরা একজন টিম সদস্যকে যোগ দিতে বলেছি। ইতিমধ্যে আপনি লিখতে থাকতে পারেন।",
      sendFirst: "অনুগ্রহ করে প্রথমে একটি বার্তা পাঠান, তারপর আমরা আপনাকে সংযুক্ত করব।",
      newMessage: "নতুন বার্তা",
      attach: "ছবি সংযুক্ত করুন",
      uploadFail: "আপলোড ব্যর্থ। অনুগ্রহ করে আবার চেষ্টা করুন।",
      maxAttach: "আপনি সর্বাধিক ৪টি ছবি সংযুক্ত করতে পারেন।",
      tooBig: "প্রতিটি ছবি ৫MB-এর কম হতে হবে।",
      badType: "শুধুমাত্র PNG, JPEG, WEBP বা GIF ছবি অনুমোদিত।",
      sourcesLabel: "উৎস",
      voiceTitle: "ভয়েস ইনপুট",
      ttsMute: "আওয়াজ বন্ধ করুন",
      ttsUnmute: "আওয়াজ চালু করুন",
      bookingDefault: "মিটিং বুক করুন",
      ratePrompt: "আপনার অভিজ্ঞতা কেমন ছিল?",
      rateComment: "একটি মন্তব্য যোগ করুন (ঐচ্ছিক)",
      rateSubmit: "জমা দিন",
      rateThanks: "আপনার মতামতের জন্য ধন্যবাদ!",
      rateChat: "এই চ্যাট রেট করুন",
      consentAgree: "সম্মত হয়ে চালিয়ে যান",
      consentDecline: "প্রত্যাখ্যান করুন",
      consentDefault: "চালিয়ে গেলে, আপনি সহায়তা প্রদানের জন্য আপনার বার্তাগুলি প্রক্রিয়া করার অনুমতি দিচ্ছেন।",
      preChatStart: "চ্যাট শুরু করুন",
      requiredField: "এই ঘরটি আবশ্যক।",
      poweredBy: "Sahayak AI দ্বারা পরিচালিত",
      awayFallback: "আমরা এই মুহূর্তে উপলব্ধ নই। আপনার ইমেল রেখে যান এবং আমাদের টিম আপনার সাথে যোগাযোগ করবে।",
      welcomeBack: "আবার স্বাগতম, {name}!",
      helpTitle: "সহায়তা কেন্দ্র",
      helpOpen: "সহায়তা ও সাধারণ প্রশ্ন",
      helpSearchPlaceholder: "সহায়তা খুঁজুন…",
      helpEmpty: "কোনো নিবন্ধ পাওয়া যায়নি। ভিন্ন শব্দ চেষ্টা করুন।",
      helpError: "সহায়তা লোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।",
      helpPrompt: "দ্রুত উত্তরের জন্য আমাদের নলেজ বেসে খুঁজুন।",
      helpUse: "উত্তর চ্যাটে যোগ করুন",
      helpBack: "চ্যাটে ফিরে যান",
      surveyShare: "মতামত শেয়ার করুন",
      surveyIntro: "আমরা আপনার মতামত জানতে চাই।",
      surveyStep: "প্রশ্ন {n} / {total}",
      surveyNext: "পরবর্তী",
      surveySubmit: "জমা দিন",
      surveyPlaceholder: "আপনার উত্তর লিখুন…",
      surveyThanks: "আপনার মতামত শেয়ার করার জন্য ধন্যবাদ!",
      langTitle: "ভাষা",
      dropHere: "সংযুক্ত করতে ছবি এখানে ছাড়ুন",
    },
    ta: {
      placeholder: "உங்கள் செய்தியை தட்டச்சு செய்யவும்…",
      talkHuman: "💬 ஒரு நபருடன் பேசுங்கள்",
      online: "இப்போது ஆன்லைனில்",
      offline: "ஆஃப்லைன்",
      liveAgent: "முகவருடன் நேரலையில்",
      welcomeFallback: "வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?",
      connError: "இணைப்பு பிழை. மீண்டும் முயற்சிக்கவும்.",
      genError: "மன்னிக்கவும், ஒரு பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.",
      feedbackThanks: "உங்கள் கருத்துக்கு நன்றி!",
      emailPlaceholder: "ungal@email.com",
      sendSupport: "ஆதரவுக்கு அனுப்பு",
      sending: "அனுப்புகிறது…",
      invalidEmail: "சரியான மின்னஞ்சலை உள்ளிடவும்.",
      escSuccess: "✓ நன்றி! எங்கள் குழு விரைவில் உங்களைத் தொடர்பு கொள்ளும்.",
      escFail: "அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
      sendAria: "செய்தியை அனுப்பு",
      connectedAgent: "நீங்கள் இப்போது ஒரு ஆதரவு முகவருடன் இணைக்கப்பட்டுள்ளீர்கள்.",
      msgSentAgent: "உங்கள் செய்தி ஆதரவு முகவருக்கு அனுப்பப்பட்டது.",
      askedJoin: "ஒரு குழு உறுப்பினரை இணையுமாறு கேட்டுள்ளோம். அதுவரை நீங்கள் தட்டச்சு செய்யலாம்.",
      sendFirst: "முதலில் ஒரு செய்தியை அனுப்பவும், பிறகு நாங்கள் உங்களை இணைப்போம்.",
      newMessage: "புதிய செய்தி",
      attach: "படத்தை இணைக்கவும்",
      uploadFail: "பதிவேற்றம் தோல்வி. மீண்டும் முயற்சிக்கவும்.",
      maxAttach: "நீங்கள் அதிகபட்சம் 4 படங்களை இணைக்கலாம்.",
      tooBig: "ஒவ்வொரு படமும் 5MB-க்கு குறைவாக இருக்க வேண்டும்.",
      badType: "PNG, JPEG, WEBP அல்லது GIF படங்கள் மட்டுமே அனுமதிக்கப்படும்.",
      sourcesLabel: "ஆதாரங்கள்",
      voiceTitle: "குரல் உள்ளீடு",
      ttsMute: "குரலை நிறுத்து",
      ttsUnmute: "குரலை இயக்கு",
      bookingDefault: "சந்திப்பைப் பதிவு செய்யுங்கள்",
      ratePrompt: "உங்கள் அனுபவம் எப்படி இருந்தது?",
      rateComment: "கருத்தைச் சேர்க்கவும் (விருப்பத்திற்குரியது)",
      rateSubmit: "சமர்ப்பிக்கவும்",
      rateThanks: "உங்கள் கருத்துக்கு நன்றி!",
      rateChat: "இந்த உரையாடலை மதிப்பிடுங்கள்",
      consentAgree: "ஒப்புக்கொண்டு தொடரவும்",
      consentDecline: "நிராகரி",
      consentDefault: "தொடர்வதன் மூலம், ஆதரவை வழங்க உங்கள் செய்திகளைச் செயலாக்க நீங்கள் அனுமதிக்கிறீர்கள்.",
      preChatStart: "அரட்டையைத் தொடங்கு",
      requiredField: "இந்த புலம் அவசியம்.",
      poweredBy: "Sahayak AI மூலம் இயக்கப்படுகிறது",
      awayFallback: "நாங்கள் தற்போது கிடைக்கவில்லை. உங்கள் மின்னஞ்சலை விடுங்கள், எங்கள் குழு உங்களைத் தொடர்பு கொள்ளும்.",
      welcomeBack: "மீண்டும் வருக, {name}!",
      helpTitle: "உதவி மையம்",
      helpOpen: "உதவி & கேள்விகள்",
      helpSearchPlaceholder: "உதவியைத் தேடுங்கள்…",
      helpEmpty: "கட்டுரைகள் எதுவும் இல்லை. வேறு வார்த்தைகளை முயற்சிக்கவும்.",
      helpError: "உதவியை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
      helpPrompt: "விரைவான பதில்களுக்கு எங்கள் அறிவுத் தளத்தில் தேடுங்கள்.",
      helpUse: "பதிலை அரட்டையில் சேர்",
      helpBack: "அரட்டைக்குத் திரும்பு",
      surveyShare: "கருத்தைப் பகிரவும்",
      surveyIntro: "உங்கள் கருத்தை நாங்கள் விரும்புகிறோம்.",
      surveyStep: "கேள்வி {n} / {total}",
      surveyNext: "அடுத்து",
      surveySubmit: "சமர்ப்பிக்கவும்",
      surveyPlaceholder: "உங்கள் பதிலைத் தட்டச்சு செய்யவும்…",
      surveyThanks: "உங்கள் கருத்தைப் பகிர்ந்ததற்கு நன்றி!",
      langTitle: "மொழி",
      dropHere: "இணைக்கப் படங்களை இங்கே விடுங்கள்",
    },
    te: {
      placeholder: "మీ సందేశాన్ని టైప్ చేయండి…",
      talkHuman: "💬 ఒక వ్యక్తితో మాట్లాడండి",
      online: "ఇప్పుడు ఆన్‌లైన్‌లో",
      offline: "ఆఫ్‌లైన్",
      liveAgent: "ఏజెంట్‌తో ప్రత్యక్షంగా",
      welcomeFallback: "నమస్కారం! నేను మీకు ఎలా సహాయం చేయగలను?",
      connError: "కనెక్షన్ లోపం. దయచేసి మళ్లీ ప్రయత్నించండి.",
      genError: "క్షమించండి, ఒక లోపం సంభవించింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
      feedbackThanks: "మీ అభిప్రాయానికి ధన్యవాదాలు!",
      emailPlaceholder: "mee@email.com",
      sendSupport: "సపోర్ట్‌కు పంపండి",
      sending: "పంపుతోంది…",
      invalidEmail: "దయచేసి చెల్లుబాటు అయ్యే ఇమెయిల్‌ను నమోదు చేయండి.",
      escSuccess: "✓ ధన్యవాదాలు! మా బృందం త్వరలో మిమ్మల్ని సంప్రదిస్తుంది.",
      escFail: "పంపలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
      sendAria: "సందేశం పంపండి",
      connectedAgent: "మీరు ఇప్పుడు సపోర్ట్ ఏజెంట్‌తో కనెక్ట్ అయ్యారు.",
      msgSentAgent: "మీ సందేశం సపోర్ట్ ఏజెంట్‌కు పంపబడింది.",
      askedJoin: "ఒక బృంద సభ్యుడిని చేరమని అడిగాము. ఈలోపు మీరు టైప్ చేస్తూ ఉండవచ్చు.",
      sendFirst: "దయచేసి ముందుగా ఒక సందేశం పంపండి, తర్వాత మేము మిమ్మల్ని కనెక్ట్ చేస్తాము.",
      newMessage: "కొత్త సందేశం",
      attach: "చిత్రాన్ని జోడించండి",
      uploadFail: "అప్‌లోడ్ విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి.",
      maxAttach: "మీరు గరిష్ఠంగా 4 చిత్రాలను జోడించవచ్చు.",
      tooBig: "ప్రతి చిత్రం 5MB కంటే తక్కువగా ఉండాలి.",
      badType: "PNG, JPEG, WEBP లేదా GIF చిత్రాలు మాత్రమే అనుమతించబడతాయి.",
      sourcesLabel: "మూలాలు",
      voiceTitle: "వాయిస్ ఇన్‌పుట్",
      ttsMute: "వాయిస్ ఆఫ్ చేయండి",
      ttsUnmute: "వాయిస్ ఆన్ చేయండి",
      bookingDefault: "మీటింగ్ బుక్ చేయండి",
      ratePrompt: "మీ అనుభవం ఎలా ఉంది?",
      rateComment: "వ్యాఖ్యను జోడించండి (ఐచ్ఛికం)",
      rateSubmit: "సమర్పించండి",
      rateThanks: "మీ అభిప్రాయానికి ధన్యవాదాలు!",
      rateChat: "ఈ చాట్‌ను రేట్ చేయండి",
      consentAgree: "అంగీకరించి కొనసాగండి",
      consentDecline: "తిరస్కరించండి",
      consentDefault: "కొనసాగించడం ద్వారా, మద్దతు అందించడానికి మీ సందేశాలను ప్రాసెస్ చేయడానికి మీరు అనుమతిస్తున్నారు.",
      preChatStart: "చాట్ ప్రారంభించండి",
      requiredField: "ఈ ఫీల్డ్ తప్పనిసరి.",
      poweredBy: "Sahayak AI ద్వారా ఆధారితం",
      awayFallback: "మేము ప్రస్తుతం అందుబాటులో లేము. మీ ఇమెయిల్ ఇవ్వండి, మా బృందం మిమ్మల్ని సంప్రదిస్తుంది.",
      welcomeBack: "తిరిగి స్వాగతం, {name}!",
      helpTitle: "సహాయ కేంద్రం",
      helpOpen: "సహాయం & ప్రశ్నలు",
      helpSearchPlaceholder: "సహాయం కోసం శోధించండి…",
      helpEmpty: "ఏ కథనాలు కనుగొనబడలేదు. వేరే పదాలను ప్రయత్నించండి.",
      helpError: "సహాయం లోడ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.",
      helpPrompt: "త్వరిత సమాధానాల కోసం మా నాలెడ్జ్ బేస్‌లో శోధించండి.",
      helpUse: "సమాధానాన్ని చాట్‌కు జోడించండి",
      helpBack: "చాట్‌కు తిరిగి వెళ్లండి",
      surveyShare: "అభిప్రాయాన్ని పంచుకోండి",
      surveyIntro: "మీ అభిప్రాయం మాకు ముఖ్యం.",
      surveyStep: "ప్రశ్న {n} / {total}",
      surveyNext: "తదుపరి",
      surveySubmit: "సమర్పించండి",
      surveyPlaceholder: "మీ సమాధానాన్ని టైప్ చేయండి…",
      surveyThanks: "మీ అభిప్రాయాన్ని పంచుకున్నందుకు ధన్యవాదాలు!",
      langTitle: "భాష",
      dropHere: "జోడించడానికి చిత్రాలను ఇక్కడ వదలండి",
    },
    mr: {
      placeholder: "तुमचा संदेश टाइप करा…",
      talkHuman: "💬 एखाद्या व्यक्तीशी बोला",
      online: "आता ऑनलाइन",
      offline: "ऑफलाइन",
      liveAgent: "एजंटसोबत थेट",
      welcomeFallback: "नमस्कार! मी तुमची कशी मदत करू शकतो?",
      connError: "कनेक्शन त्रुटी. कृपया पुन्हा प्रयत्न करा.",
      genError: "माफ करा, एक त्रुटी आली. कृपया पुन्हा प्रयत्न करा.",
      feedbackThanks: "तुमच्या अभिप्रायाबद्दल धन्यवाद!",
      emailPlaceholder: "tumcha@email.com",
      sendSupport: "सपोर्टला पाठवा",
      sending: "पाठवत आहे…",
      invalidEmail: "कृपया वैध ईमेल प्रविष्ट करा.",
      escSuccess: "✓ धन्यवाद! आमची टीम लवकरच तुमच्याशी संपर्क साधेल.",
      escFail: "पाठवता आले नाही. पुन्हा प्रयत्न करा.",
      sendAria: "संदेश पाठवा",
      connectedAgent: "तुम्ही आता सपोर्ट एजंटशी जोडले गेले आहात.",
      msgSentAgent: "तुमचा संदेश सपोर्ट एजंटला पाठवला गेला आहे.",
      askedJoin: "आम्ही एका टीम सदस्याला सामील होण्यास सांगितले आहे. तोपर्यंत तुम्ही टाइप करत राहू शकता.",
      sendFirst: "कृपया आधी एक संदेश पाठवा, मग आम्ही तुम्हाला जोडू.",
      newMessage: "नवीन संदेश",
      attach: "प्रतिमा संलग्न करा",
      uploadFail: "अपलोड अयशस्वी. कृपया पुन्हा प्रयत्न करा.",
      maxAttach: "तुम्ही जास्तीत जास्त 4 प्रतिमा संलग्न करू शकता.",
      tooBig: "प्रत्येक प्रतिमा 5MB पेक्षा कमी असावी.",
      badType: "फक्त PNG, JPEG, WEBP किंवा GIF प्रतिमा स्वीकार्य आहेत.",
      sourcesLabel: "स्रोत",
      voiceTitle: "व्हॉइस इनपुट",
      ttsMute: "आवाज बंद करा",
      ttsUnmute: "आवाज चालू करा",
      bookingDefault: "मीटिंग बुक करा",
      ratePrompt: "तुमचा अनुभव कसा होता?",
      rateComment: "टिप्पणी जोडा (पर्यायी)",
      rateSubmit: "सबमिट करा",
      rateThanks: "तुमच्या अभिप्रायाबद्दल धन्यवाद!",
      rateChat: "या चॅटला रेट करा",
      consentAgree: "सहमत व्हा आणि सुरू ठेवा",
      consentDecline: "नकार द्या",
      consentDefault: "सुरू ठेवून, तुम्ही आम्हाला समर्थन देण्यासाठी तुमचे संदेश प्रक्रिया करण्याची परवानगी देता.",
      preChatStart: "चॅट सुरू करा",
      requiredField: "हे फील्ड आवश्यक आहे.",
      poweredBy: "Sahayak AI द्वारे समर्थित",
      awayFallback: "आम्ही सध्या उपलब्ध नाही. तुमचा ईमेल द्या आणि आमची टीम तुमच्याशी संपर्क साधेल.",
      welcomeBack: "पुन्हा स्वागत आहे, {name}!",
      helpTitle: "मदत केंद्र",
      helpOpen: "मदत आणि प्रश्न",
      helpSearchPlaceholder: "मदत शोधा…",
      helpEmpty: "कोणतेही लेख सापडले नाहीत. वेगळे शब्द वापरून पहा.",
      helpError: "मदत लोड करता आली नाही. कृपया पुन्हा प्रयत्न करा.",
      helpPrompt: "झटपट उत्तरांसाठी आमच्या नॉलेज बेसमध्ये शोधा.",
      helpUse: "उत्तर चॅटमध्ये जोडा",
      helpBack: "चॅटवर परत जा",
      surveyShare: "अभिप्राय शेअर करा",
      surveyIntro: "आम्हाला तुमचा अभिप्राय आवडेल.",
      surveyStep: "प्रश्न {n} / {total}",
      surveyNext: "पुढील",
      surveySubmit: "सबमिट करा",
      surveyPlaceholder: "तुमचे उत्तर लिहा…",
      surveyThanks: "तुमचा अभिप्राय शेअर केल्याबद्दल धन्यवाद!",
      langTitle: "भाषा",
      dropHere: "संलग्न करण्यासाठी प्रतिमा येथे टाका",
    },
    gu: {
      placeholder: "તમારો સંદેશ ટાઇપ કરો…",
      talkHuman: "💬 કોઈ વ્યક્તિ સાથે વાત કરો",
      online: "હમણાં ઓનલાઇન",
      offline: "ઓફલાઇન",
      liveAgent: "એજન્ટ સાથે લાઇવ",
      welcomeFallback: "નમસ્તે! હું તમારી કેવી રીતે મદદ કરી શકું?",
      connError: "કનેક્શન ભૂલ. કૃપા કરીને ફરી પ્રયાસ કરો.",
      genError: "માફ કરશો, એક ભૂલ આવી. કૃપા કરીને ફરી પ્રયાસ કરો.",
      feedbackThanks: "તમારા પ્રતિસાદ બદલ આભાર!",
      emailPlaceholder: "tamaro@email.com",
      sendSupport: "સપોર્ટને મોકલો",
      sending: "મોકલી રહ્યું છે…",
      invalidEmail: "કૃપા કરીને માન્ય ઇમેઇલ દાખલ કરો.",
      escSuccess: "✓ આભાર! અમારી ટીમ ટૂંક સમયમાં તમારો સંપર્ક કરશે.",
      escFail: "મોકલી શકાયું નહીં. ફરી પ્રયાસ કરો.",
      sendAria: "સંદેશ મોકલો",
      connectedAgent: "તમે હવે સપોર્ટ એજન્ટ સાથે જોડાયેલા છો.",
      msgSentAgent: "તમારો સંદેશ સપોર્ટ એજન્ટને મોકલવામાં આવ્યો છે.",
      askedJoin: "અમે એક ટીમ સભ્યને જોડાવા માટે કહ્યું છે. ત્યાં સુધી તમે ટાઇપ કરતા રહી શકો છો.",
      sendFirst: "કૃપા કરીને પહેલા એક સંદેશ મોકલો, પછી અમે તમને જોડીશું.",
      newMessage: "નવો સંદેશ",
      attach: "છબી જોડો",
      uploadFail: "અપલોડ નિષ્ફળ. કૃપા કરીને ફરી પ્રયાસ કરો.",
      maxAttach: "તમે વધુમાં વધુ 4 છબીઓ જોડી શકો છો.",
      tooBig: "દરેક છબી 5MB થી ઓછી હોવી જોઈએ.",
      badType: "ફક્ત PNG, JPEG, WEBP અથવા GIF છબીઓ માન્ય છે.",
      sourcesLabel: "સ્રોત",
      voiceTitle: "વૉઇસ ઇનપુટ",
      ttsMute: "અવાજ બંધ કરો",
      ttsUnmute: "અવાજ ચાલુ કરો",
      bookingDefault: "મીટિંગ બુક કરો",
      ratePrompt: "તમારો અનુભવ કેવો રહ્યો?",
      rateComment: "ટિપ્પણી ઉમેરો (વૈકલ્પિક)",
      rateSubmit: "સબમિટ કરો",
      rateThanks: "તમારા પ્રતિસાદ બદલ આભાર!",
      rateChat: "આ ચેટને રેટ કરો",
      consentAgree: "સંમત થાઓ અને ચાલુ રાખો",
      consentDecline: "નકારો",
      consentDefault: "ચાલુ રાખીને, તમે અમને સહાય પૂરી પાડવા માટે તમારા સંદેશાઓ પર પ્રક્રિયા કરવાની મંજૂરી આપો છો.",
      preChatStart: "ચેટ શરૂ કરો",
      requiredField: "આ ફીલ્ડ આવશ્યક છે.",
      poweredBy: "Sahayak AI દ્વારા સંચાલિત",
      awayFallback: "અમે હાલમાં ઉપલબ્ધ નથી. તમારો ઇમેઇલ મૂકો અને અમારી ટીમ તમારો સંપર્ક કરશે.",
      welcomeBack: "ફરી સ્વાગત છે, {name}!",
      helpTitle: "સહાય કેન્દ્ર",
      helpOpen: "સહાય અને પ્રશ્નો",
      helpSearchPlaceholder: "સહાય શોધો…",
      helpEmpty: "કોઈ લેખ મળ્યા નથી. અલગ શબ્દો અજમાવો.",
      helpError: "સહાય લોડ થઈ શકી નથી. કૃપા કરીને ફરી પ્રયાસ કરો.",
      helpPrompt: "ઝડપી જવાબો માટે અમારા નોલેજ બેઝમાં શોધો.",
      helpUse: "જવાબ ચેટમાં ઉમેરો",
      helpBack: "ચેટ પર પાછા જાઓ",
      surveyShare: "પ્રતિસાદ શેર કરો",
      surveyIntro: "અમને તમારો પ્રતિસાદ ગમશે.",
      surveyStep: "પ્રશ્ન {n} / {total}",
      surveyNext: "આગળ",
      surveySubmit: "સબમિટ કરો",
      surveyPlaceholder: "તમારો જવાબ લખો…",
      surveyThanks: "તમારો પ્રતિસાદ શેર કરવા બદલ આભાર!",
      langTitle: "ભાષા",
      dropHere: "જોડવા માટે છબીઓ અહીં મૂકો",
    },
    kn: {
      placeholder: "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ…",
      talkHuman: "💬 ಒಬ್ಬ ವ್ಯಕ್ತಿಯೊಂದಿಗೆ ಮಾತನಾಡಿ",
      online: "ಈಗ ಆನ್‌ಲೈನ್",
      offline: "ಆಫ್‌ಲೈನ್",
      liveAgent: "ಏಜೆಂಟ್ ಜೊತೆ ನೇರ",
      welcomeFallback: "ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
      connError: "ಸಂಪರ್ಕ ದೋಷ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      genError: "ಕ್ಷಮಿಸಿ, ಒಂದು ದೋಷ ಸಂಭವಿಸಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      feedbackThanks: "ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಗೆ ಧನ್ಯವಾದಗಳು!",
      emailPlaceholder: "nimma@email.com",
      sendSupport: "ಬೆಂಬಲಕ್ಕೆ ಕಳುಹಿಸಿ",
      sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
      invalidEmail: "ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಇಮೇಲ್ ನಮೂದಿಸಿ.",
      escSuccess: "✓ ಧನ್ಯವಾದಗಳು! ನಮ್ಮ ತಂಡ ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
      escFail: "ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      sendAria: "ಸಂದೇಶ ಕಳುಹಿಸಿ",
      connectedAgent: "ನೀವು ಈಗ ಬೆಂಬಲ ಏಜೆಂಟ್‌ನೊಂದಿಗೆ ಸಂಪರ್ಕಗೊಂಡಿದ್ದೀರಿ.",
      msgSentAgent: "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಬೆಂಬಲ ಏಜೆಂಟ್‌ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.",
      askedJoin: "ನಾವು ಒಬ್ಬ ತಂಡದ ಸದಸ್ಯನನ್ನು ಸೇರಲು ಕೇಳಿದ್ದೇವೆ. ಅಲ್ಲಿಯವರೆಗೆ ನೀವು ಟೈಪ್ ಮಾಡುತ್ತಿರಬಹುದು.",
      sendFirst: "ದಯವಿಟ್ಟು ಮೊದಲು ಒಂದು ಸಂದೇಶ ಕಳುಹಿಸಿ, ನಂತರ ನಾವು ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.",
      newMessage: "ಹೊಸ ಸಂದೇಶ",
      attach: "ಚಿತ್ರ ಲಗತ್ತಿಸಿ",
      uploadFail: "ಅಪ್‌ಲೋಡ್ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      maxAttach: "ನೀವು ಗರಿಷ್ಠ 4 ಚಿತ್ರಗಳನ್ನು ಲಗತ್ತಿಸಬಹುದು.",
      tooBig: "ಪ್ರತಿ ಚಿತ್ರವು 5MB ಗಿಂತ ಕಡಿಮೆ ಇರಬೇಕು.",
      badType: "ಕೇವಲ PNG, JPEG, WEBP ಅಥವಾ GIF ಚಿತ್ರಗಳನ್ನು ಅನುಮತಿಸಲಾಗಿದೆ.",
      sourcesLabel: "ಮೂಲಗಳು",
      voiceTitle: "ಧ್ವನಿ ಇನ್‌ಪುಟ್",
      ttsMute: "ಧ್ವನಿ ಆಫ್ ಮಾಡಿ",
      ttsUnmute: "ಧ್ವನಿ ಆನ್ ಮಾಡಿ",
      bookingDefault: "ಸಭೆ ಬುಕ್ ಮಾಡಿ",
      ratePrompt: "ನಿಮ್ಮ ಅನುಭವ ಹೇಗಿತ್ತು?",
      rateComment: "ಕಾಮೆಂಟ್ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ)",
      rateSubmit: "ಸಲ್ಲಿಸಿ",
      rateThanks: "ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಗೆ ಧನ್ಯವಾದಗಳು!",
      rateChat: "ಈ ಚಾಟ್ ಅನ್ನು ರೇಟ್ ಮಾಡಿ",
      consentAgree: "ಒಪ್ಪಿ ಮುಂದುವರಿಯಿರಿ",
      consentDecline: "ನಿರಾಕರಿಸಿ",
      consentDefault: "ಮುಂದುವರಿಯುವ ಮೂಲಕ, ಬೆಂಬಲ ನೀಡಲು ನಿಮ್ಮ ಸಂದೇಶಗಳನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲು ನೀವು ಅನುಮತಿಸುತ್ತೀರಿ.",
      preChatStart: "ಚಾಟ್ ಪ್ರಾರಂಭಿಸಿ",
      requiredField: "ಈ ಕ್ಷೇತ್ರ ಅಗತ್ಯವಿದೆ.",
      poweredBy: "Sahayak AI ನಿಂದ ಚಾಲಿತ",
      awayFallback: "ನಾವು ಸದ್ಯಕ್ಕೆ ಲಭ್ಯವಿಲ್ಲ. ನಿಮ್ಮ ಇಮೇಲ್ ಬಿಡಿ ಮತ್ತು ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
      welcomeBack: "ಮರಳಿ ಸ್ವಾಗತ, {name}!",
      helpTitle: "ಸಹಾಯ ಕೇಂದ್ರ",
      helpOpen: "ಸಹಾಯ ಮತ್ತು ಪ್ರಶ್ನೆಗಳು",
      helpSearchPlaceholder: "ಸಹಾಯಕ್ಕಾಗಿ ಹುಡುಕಿ…",
      helpEmpty: "ಯಾವುದೇ ಲೇಖನಗಳು ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಪದಗಳನ್ನು ಪ್ರಯತ್ನಿಸಿ.",
      helpError: "ಸಹಾಯ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      helpPrompt: "ತ್ವರಿತ ಉತ್ತರಗಳಿಗಾಗಿ ನಮ್ಮ ನಾಲೆಡ್ಜ್ ಬೇಸ್‌ನಲ್ಲಿ ಹುಡುಕಿ.",
      helpUse: "ಉತ್ತರವನ್ನು ಚಾಟ್‌ಗೆ ಸೇರಿಸಿ",
      helpBack: "ಚಾಟ್‌ಗೆ ಹಿಂತಿರುಗಿ",
      surveyShare: "ಪ್ರತಿಕ್ರಿಯೆ ಹಂಚಿಕೊಳ್ಳಿ",
      surveyIntro: "ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆ ನಮಗೆ ಇಷ್ಟ.",
      surveyStep: "ಪ್ರಶ್ನೆ {n} / {total}",
      surveyNext: "ಮುಂದೆ",
      surveySubmit: "ಸಲ್ಲಿಸಿ",
      surveyPlaceholder: "ನಿಮ್ಮ ಉತ್ತರವನ್ನು ಟೈಪ್ ಮಾಡಿ…",
      surveyThanks: "ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆ ಹಂಚಿಕೊಂಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು!",
      langTitle: "ಭಾಷೆ",
      dropHere: "ಲಗತ್ತಿಸಲು ಚಿತ್ರಗಳನ್ನು ಇಲ್ಲಿ ಬಿಡಿ",
    },
    ml: {
      placeholder: "നിങ്ങളുടെ സന്ദേശം ടൈപ്പ് ചെയ്യുക…",
      talkHuman: "💬 ഒരു വ്യക്തിയുമായി സംസാരിക്കുക",
      online: "ഇപ്പോൾ ഓൺലൈൻ",
      offline: "ഓഫ്‌ലൈൻ",
      liveAgent: "ഏജന്റുമായി തത്സമയം",
      welcomeFallback: "നമസ്കാരം! ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
      connError: "കണക്ഷൻ പിശക്. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
      genError: "ക്ഷമിക്കണം, ഒരു പിശക് സംഭവിച്ചു. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
      feedbackThanks: "നിങ്ങളുടെ അഭിപ്രായത്തിന് നന്ദി!",
      emailPlaceholder: "ningal@email.com",
      sendSupport: "സപ്പോർട്ടിലേക്ക് അയയ്ക്കുക",
      sending: "അയയ്ക്കുന്നു…",
      invalidEmail: "ദയവായി സാധുവായ ഇമെയിൽ നൽകുക.",
      escSuccess: "✓ നന്ദി! ഞങ്ങളുടെ ടീം ഉടൻ നിങ്ങളെ ബന്ധപ്പെടും.",
      escFail: "അയയ്ക്കാനായില്ല. വീണ്ടും ശ്രമിക്കുക.",
      sendAria: "സന്ദേശം അയയ്ക്കുക",
      connectedAgent: "നിങ്ങൾ ഇപ്പോൾ ഒരു സപ്പോർട്ട് ഏജന്റുമായി ബന്ധിപ്പിച്ചിരിക്കുന്നു.",
      msgSentAgent: "നിങ്ങളുടെ സന്ദേശം സപ്പോർട്ട് ഏജന്റിന് അയച്ചു.",
      askedJoin: "ഒരു ടീം അംഗത്തോട് ചേരാൻ ഞങ്ങൾ ആവശ്യപ്പെട്ടിട്ടുണ്ട്. അതുവരെ നിങ്ങൾക്ക് ടൈപ്പ് ചെയ്യുന്നത് തുടരാം.",
      sendFirst: "ദയവായി ആദ്യം ഒരു സന്ദേശം അയയ്ക്കുക, എന്നിട്ട് ഞങ്ങൾ നിങ്ങളെ ബന്ധിപ്പിക്കും.",
      newMessage: "പുതിയ സന്ദേശം",
      attach: "ചിത്രം അറ്റാച്ചുചെയ്യുക",
      uploadFail: "അപ്‌ലോഡ് പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
      maxAttach: "നിങ്ങൾക്ക് പരമാവധി 4 ചിത്രങ്ങൾ അറ്റാച്ചുചെയ്യാം.",
      tooBig: "ഓരോ ചിത്രവും 5MB-ൽ കുറവായിരിക്കണം.",
      badType: "PNG, JPEG, WEBP അല്ലെങ്കിൽ GIF ചിത്രങ്ങൾ മാത്രമേ അനുവദനീയമുള്ളൂ.",
      sourcesLabel: "ഉറവിടങ്ങൾ",
      voiceTitle: "വോയ്‌സ് ഇൻപുട്ട്",
      ttsMute: "ശബ്ദം ഓഫ് ചെയ്യുക",
      ttsUnmute: "ശബ്ദം ഓൺ ചെയ്യുക",
      bookingDefault: "മീറ്റിംഗ് ബുക്ക് ചെയ്യുക",
      ratePrompt: "നിങ്ങളുടെ അനുഭവം എങ്ങനെയായിരുന്നു?",
      rateComment: "ഒരു അഭിപ്രായം ചേർക്കുക (ഓപ്ഷണൽ)",
      rateSubmit: "സമർപ്പിക്കുക",
      rateThanks: "നിങ്ങളുടെ അഭിപ്രായത്തിന് നന്ദി!",
      rateChat: "ഈ ചാറ്റ് റേറ്റ് ചെയ്യുക",
      consentAgree: "സമ്മതിച്ച് തുടരുക",
      consentDecline: "നിരസിക്കുക",
      consentDefault: "തുടരുന്നതിലൂടെ, പിന്തുണ നൽകാൻ നിങ്ങളുടെ സന്ദേശങ്ങൾ പ്രോസസ് ചെയ്യാൻ നിങ്ങൾ അനുവദിക്കുന്നു.",
      preChatStart: "ചാറ്റ് ആരംഭിക്കുക",
      requiredField: "ഈ ഫീൽഡ് ആവശ്യമാണ്.",
      poweredBy: "Sahayak AI പവർ ചെയ്യുന്നു",
      awayFallback: "ഞങ്ങൾ ഇപ്പോൾ ലഭ്യമല്ല. നിങ്ങളുടെ ഇമെയിൽ നൽകുക, ഞങ്ങളുടെ ടീം നിങ്ങളെ ബന്ധപ്പെടും.",
      welcomeBack: "വീണ്ടും സ്വാഗതം, {name}!",
      helpTitle: "സഹായ കേന്ദ്രം",
      helpOpen: "സഹായം & ചോദ്യങ്ങൾ",
      helpSearchPlaceholder: "സഹായത്തിനായി തിരയുക…",
      helpEmpty: "ലേഖനങ്ങളൊന്നും കണ്ടെത്തിയില്ല. വ്യത്യസ്ത വാക്കുകൾ ശ്രമിക്കുക.",
      helpError: "സഹായം ലോഡ് ചെയ്യാനായില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
      helpPrompt: "വേഗത്തിലുള്ള ഉത്തരങ്ങൾക്കായി ഞങ്ങളുടെ നോളജ് ബേസിൽ തിരയുക.",
      helpUse: "ഉത്തരം ചാറ്റിൽ ചേർക്കുക",
      helpBack: "ചാറ്റിലേക്ക് മടങ്ങുക",
      surveyShare: "അഭിപ്രായം പങ്കിടുക",
      surveyIntro: "നിങ്ങളുടെ അഭിപ്രായം ഞങ്ങൾ ഇഷ്ടപ്പെടുന്നു.",
      surveyStep: "ചോദ്യം {n} / {total}",
      surveyNext: "അടുത്തത്",
      surveySubmit: "സമർപ്പിക്കുക",
      surveyPlaceholder: "നിങ്ങളുടെ ഉത്തരം ടൈപ്പ് ചെയ്യുക…",
      surveyThanks: "നിങ്ങളുടെ അഭിപ്രായം പങ്കിട്ടതിന് നന്ദി!",
      langTitle: "ഭാഷ",
      dropHere: "അറ്റാച്ചുചെയ്യാൻ ചിത്രങ്ങൾ ഇവിടെ ഇടുക",
    },
    or: {
      placeholder: "ଆପଣଙ୍କ ବାର୍ତ୍ତା ଟାଇପ୍ କରନ୍ତୁ…",
      talkHuman: "💬 ଜଣେ ବ୍ୟକ୍ତିଙ୍କ ସହିତ କଥା ହୁଅନ୍ତୁ",
      online: "ବର୍ତ୍ତମାନ ଅନଲାଇନ୍",
      offline: "ଅଫଲାଇନ୍",
      liveAgent: "ଏଜେଣ୍ଟ ସହିତ ଲାଇଭ୍",
      welcomeFallback: "ନମସ୍କାର! ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?",
      connError: "ସଂଯୋଗ ତ୍ରୁଟି। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
      genError: "କ୍ଷମା କରନ୍ତୁ, ଏକ ତ୍ରୁଟି ଘଟିଲା। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
      feedbackThanks: "ଆପଣଙ୍କ ମତାମତ ପାଇଁ ଧନ୍ୟବାଦ!",
      emailPlaceholder: "apananka@email.com",
      sendSupport: "ସପୋର୍ଟକୁ ପଠାନ୍ତୁ",
      sending: "ପଠାଯାଉଛି…",
      invalidEmail: "ଦୟାକରି ଏକ ବୈଧ ଇମେଲ୍ ପ୍ରବେଶ କରନ୍ତୁ।",
      escSuccess: "✓ ଧନ୍ୟବାଦ! ଆମ ଟିମ୍ ଶୀଘ୍ର ଆପଣଙ୍କ ସହିତ ଯୋଗାଯୋଗ କରିବ।",
      escFail: "ପଠାଯାଇ ପାରିଲା ନାହିଁ। ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
      sendAria: "ବାର୍ତ୍ତା ପଠାନ୍ତୁ",
      connectedAgent: "ଆପଣ ବର୍ତ୍ତମାନ ଏକ ସପୋର୍ଟ ଏଜେଣ୍ଟ ସହିତ ସଂଯୁକ୍ତ ଅଛନ୍ତି।",
      msgSentAgent: "ଆପଣଙ୍କ ବାର୍ତ୍ତା ସପୋର୍ଟ ଏଜେଣ୍ଟଙ୍କୁ ପଠାଯାଇଛି।",
      askedJoin: "ଆମେ ଜଣେ ଟିମ୍ ସଦସ୍ୟଙ୍କୁ ଯୋଗ ଦେବାକୁ କହିଛୁ। ସେପର୍ଯ୍ୟନ୍ତ ଆପଣ ଟାଇପ୍ କରିପାରିବେ।",
      sendFirst: "ଦୟାକରି ପ୍ରଥମେ ଏକ ବାର୍ତ୍ତା ପଠାନ୍ତୁ, ତାପରେ ଆମେ ଆପଣଙ୍କୁ ସଂଯୋଗ କରିବୁ।",
      newMessage: "ନୂଆ ବାର୍ତ୍ତା",
      attach: "ଛବି ସଂଲଗ୍ନ କରନ୍ତୁ",
      uploadFail: "ଅପଲୋଡ୍ ବିଫଳ। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
      maxAttach: "ଆପଣ ସର୍ବାଧିକ 4ଟି ଛବି ସଂଲଗ୍ନ କରିପାରିବେ।",
      tooBig: "ପ୍ରତ୍ୟେକ ଛବି 5MBରୁ କମ୍ ହେବା ଆବଶ୍ୟକ।",
      badType: "କେବଳ PNG, JPEG, WEBP କିମ୍ବା GIF ଛବି ଅନୁମତିପ୍ରାପ୍ତ।",
      sourcesLabel: "ଉତ୍ସ",
      voiceTitle: "ଭଏସ୍ ଇନପୁଟ୍",
      ttsMute: "ସ୍ୱର ବନ୍ଦ କରନ୍ତୁ",
      ttsUnmute: "ସ୍ୱର ଚାଲୁ କରନ୍ତୁ",
      bookingDefault: "ମିଟିଂ ବୁକ୍ କରନ୍ତୁ",
      ratePrompt: "ଆପଣଙ୍କ ଅନୁଭୂତି କେମିତି ଥିଲା?",
      rateComment: "ଏକ ମନ୍ତବ୍ୟ ଯୋଡ଼ନ୍ତୁ (ବୈକଳ୍ପିକ)",
      rateSubmit: "ଦାଖଲ କରନ୍ତୁ",
      rateThanks: "ଆପଣଙ୍କ ମତାମତ ପାଇଁ ଧନ୍ୟବାଦ!",
      rateChat: "ଏହି ଚାଟ୍ ରେଟ୍ କରନ୍ତୁ",
      consentAgree: "ସମ୍ମତ ହୋଇ ଆଗକୁ ବଢ଼ନ୍ତୁ",
      consentDecline: "ପ୍ରତ୍ୟାଖ୍ୟାନ କରନ୍ତୁ",
      consentDefault: "ଆଗକୁ ବଢ଼ି, ଆପଣ ସହାୟତା ପ୍ରଦାନ କରିବା ପାଇଁ ଆପଣଙ୍କ ବାର୍ତ୍ତା ପ୍ରକ୍ରିୟା କରିବାକୁ ଅନୁମତି ଦିଅନ୍ତି।",
      preChatStart: "ଚାଟ୍ ଆରମ୍ଭ କରନ୍ତୁ",
      requiredField: "ଏହି କ୍ଷେତ୍ର ଆବଶ୍ୟକ।",
      poweredBy: "Sahayak AI ଦ୍ୱାରା ଚାଳିତ",
      awayFallback: "ଆମେ ବର୍ତ୍ତମାନ ଉପଲବ୍ଧ ନାହୁଁ। ଆପଣଙ୍କ ଇମେଲ୍ ଛାଡ଼ନ୍ତୁ ଏବଂ ଆମ ଟିମ୍ ଆପଣଙ୍କ ସହିତ ଯୋଗାଯୋଗ କରିବ।",
      welcomeBack: "ପୁନର୍ବାର ସ୍ୱାଗତ, {name}!",
      helpTitle: "ସହାୟତା କେନ୍ଦ୍ର",
      helpOpen: "ସହାୟତା ଏବଂ ପ୍ରଶ୍ନ",
      helpSearchPlaceholder: "ସହାୟତା ଖୋଜନ୍ତୁ…",
      helpEmpty: "କୌଣସି ଲେଖା ମିଳିଲା ନାହିଁ। ଭିନ୍ନ ଶବ୍ଦ ଚେଷ୍ଟା କରନ୍ତୁ।",
      helpError: "ସହାୟତା ଲୋଡ୍ ହୋଇ ପାରିଲା ନାହିଁ। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
      helpPrompt: "ଶୀଘ୍ର ଉତ୍ତର ପାଇଁ ଆମ ନଲେଜ୍ ବେସ୍‌ରେ ଖୋଜନ୍ତୁ।",
      helpUse: "ଉତ୍ତର ଚାଟ୍‌ରେ ଯୋଡ଼ନ୍ତୁ",
      helpBack: "ଚାଟ୍‌କୁ ଫେରନ୍ତୁ",
      surveyShare: "ମତାମତ ସେୟାର କରନ୍ତୁ",
      surveyIntro: "ଆମେ ଆପଣଙ୍କ ମତାମତ ଚାହୁଁ।",
      surveyStep: "ପ୍ରଶ୍ନ {n} / {total}",
      surveyNext: "ପରବର୍ତ୍ତୀ",
      surveySubmit: "ଦାଖଲ କରନ୍ତୁ",
      surveyPlaceholder: "ଆପଣଙ୍କ ଉତ୍ତର ଲେଖନ୍ତୁ…",
      surveyThanks: "ଆପଣଙ୍କ ମତାମତ ସେୟାର କରିଥିବାରୁ ଧନ୍ୟବାଦ!",
      langTitle: "ଭାଷା",
      dropHere: "ସଂଲଗ୍ନ କରିବାକୁ ଛବି ଏଠାରେ ଛାଡ଼ନ୍ତୁ",
    },
    as: {
      placeholder: "আপোনাৰ বাৰ্তা টাইপ কৰক…",
      talkHuman: "💬 এজন ব্যক্তিৰ সৈতে কথা পাতক",
      online: "এতিয়া অনলাইন",
      offline: "অফলাইন",
      liveAgent: "এজেণ্টৰ সৈতে লাইভ",
      welcomeFallback: "নমস্কাৰ! মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ?",
      connError: "সংযোগ ত্ৰুটি। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
      genError: "ক্ষমা কৰিব, এটা ত্ৰুটি হ'ল। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
      feedbackThanks: "আপোনাৰ মতামতৰ বাবে ধন্যবাদ!",
      emailPlaceholder: "aponar@email.com",
      sendSupport: "সমৰ্থনলৈ পঠিয়াওক",
      sending: "পঠিওৱা হৈছে…",
      invalidEmail: "অনুগ্ৰহ কৰি এটা বৈধ ইমেইল দিয়ক।",
      escSuccess: "✓ ধন্যবাদ! আমাৰ দল সোনকালে আপোনাৰ সৈতে যোগাযোগ কৰিব।",
      escFail: "পঠিয়াব পৰা নগ'ল। পুনৰ চেষ্টা কৰক।",
      sendAria: "বাৰ্তা পঠিয়াওক",
      connectedAgent: "আপুনি এতিয়া এজন সমৰ্থন এজেণ্টৰ সৈতে সংযুক্ত হৈছে।",
      msgSentAgent: "আপোনাৰ বাৰ্তা সমৰ্থন এজেণ্টলৈ পঠিওৱা হৈছে।",
      askedJoin: "আমি এজন দলৰ সদস্যক যোগ দিবলৈ কৈছোঁ। ইমানলৈকে আপুনি টাইপ কৰি থাকিব পাৰে।",
      sendFirst: "অনুগ্ৰহ কৰি প্ৰথমে এটা বাৰ্তা পঠিয়াওক, তাৰ পিছত আমি আপোনাক সংযোগ কৰিম।",
      newMessage: "নতুন বাৰ্তা",
      attach: "ছবি সংলগ্ন কৰক",
      uploadFail: "আপল'ড বিফল। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
      maxAttach: "আপুনি সৰ্বাধিক 4খন ছবি সংলগ্ন কৰিব পাৰে।",
      tooBig: "প্ৰতিখন ছবি 5MBৰ কম হ'ব লাগে।",
      badType: "কেৱল PNG, JPEG, WEBP বা GIF ছবি অনুমোদিত।",
      sourcesLabel: "উৎস",
      voiceTitle: "ভইচ ইনপুট",
      ttsMute: "মাত বন্ধ কৰক",
      ttsUnmute: "মাত চালু কৰক",
      bookingDefault: "সভা বুক কৰক",
      ratePrompt: "আপোনাৰ অভিজ্ঞতা কেনে আছিল?",
      rateComment: "এটা মন্তব্য যোগ কৰক (বৈকল্পিক)",
      rateSubmit: "দাখিল কৰক",
      rateThanks: "আপোনাৰ মতামতৰ বাবে ধন্যবাদ!",
      rateChat: "এই চেটটো ৰে'ট কৰক",
      consentAgree: "সন্মত হৈ আগবাঢ়ক",
      consentDecline: "অস্বীকাৰ কৰক",
      consentDefault: "আগবাঢ়ি গৈ, আপুনি সহায়তা প্ৰদান কৰিবলৈ আপোনাৰ বাৰ্তাসমূহ প্ৰক্ৰিয়া কৰিবলৈ অনুমতি দিয়ে।",
      preChatStart: "চেট আৰম্ভ কৰক",
      requiredField: "এই ফিল্ডটো আৱশ্যক।",
      poweredBy: "Sahayak AI দ্বাৰা চালিত",
      awayFallback: "আমি এই মুহূৰ্তত উপলব্ধ নহয়। আপোনাৰ ইমেইল এৰি থওক আৰু আমাৰ দল আপোনাৰ সৈতে যোগাযোগ কৰিব।",
      welcomeBack: "পুনৰ স্বাগতম, {name}!",
      helpTitle: "সহায় কেন্দ্ৰ",
      helpOpen: "সহায় আৰু প্ৰশ্ন",
      helpSearchPlaceholder: "সহায় বিচাৰক…",
      helpEmpty: "কোনো প্ৰবন্ধ পোৱা নগ'ল। বেলেগ শব্দ চেষ্টা কৰক।",
      helpError: "সহায় ল'ড কৰিব পৰা নগ'ল। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
      helpPrompt: "দ্ৰুত উত্তৰৰ বাবে আমাৰ নলেজ বেছত বিচাৰক।",
      helpUse: "উত্তৰ চেটত যোগ কৰক",
      helpBack: "চেটলৈ উভতি যাওক",
      surveyShare: "মতামত শ্বেয়াৰ কৰক",
      surveyIntro: "আমি আপোনাৰ মতামত বিচাৰোঁ।",
      surveyStep: "প্ৰশ্ন {n} / {total}",
      surveyNext: "পৰৱৰ্তী",
      surveySubmit: "দাখিল কৰক",
      surveyPlaceholder: "আপোনাৰ উত্তৰ লিখক…",
      surveyThanks: "আপোনাৰ মতামত শ্বেয়াৰ কৰাৰ বাবে ধন্যবাদ!",
      langTitle: "ভাষা",
      dropHere: "সংলগ্ন কৰিবলৈ ছবি ইয়াত এৰক",
    },
    pa: {
      placeholder: "ਆਪਣਾ ਸੁਨੇਹਾ ਟਾਈਪ ਕਰੋ…",
      talkHuman: "💬 ਕਿਸੇ ਵਿਅਕਤੀ ਨਾਲ ਗੱਲ ਕਰੋ",
      online: "ਹੁਣ ਆਨਲਾਈਨ",
      offline: "ਆਫਲਾਈਨ",
      liveAgent: "ਏਜੰਟ ਨਾਲ ਲਾਈਵ",
      welcomeFallback: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
      connError: "ਕਨੈਕਸ਼ਨ ਗਲਤੀ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
      genError: "ਮਾਫ਼ ਕਰਨਾ, ਇੱਕ ਗਲਤੀ ਆਈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
      feedbackThanks: "ਤੁਹਾਡੇ ਫੀਡਬੈਕ ਲਈ ਧੰਨਵਾਦ!",
      emailPlaceholder: "tuhada@email.com",
      sendSupport: "ਸਪੋਰਟ ਨੂੰ ਭੇਜੋ",
      sending: "ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…",
      invalidEmail: "ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਵੈਧ ਈਮੇਲ ਦਰਜ ਕਰੋ।",
      escSuccess: "✓ ਧੰਨਵਾਦ! ਸਾਡੀ ਟੀਮ ਜਲਦੀ ਹੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੇਗੀ।",
      escFail: "ਭੇਜਿਆ ਨਹੀਂ ਜਾ ਸਕਿਆ। ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
      sendAria: "ਸੁਨੇਹਾ ਭੇਜੋ",
      connectedAgent: "ਤੁਸੀਂ ਹੁਣ ਇੱਕ ਸਪੋਰਟ ਏਜੰਟ ਨਾਲ ਜੁੜ ਗਏ ਹੋ।",
      msgSentAgent: "ਤੁਹਾਡਾ ਸੁਨੇਹਾ ਸਪੋਰਟ ਏਜੰਟ ਨੂੰ ਭੇਜ ਦਿੱਤਾ ਗਿਆ ਹੈ।",
      askedJoin: "ਅਸੀਂ ਇੱਕ ਟੀਮ ਮੈਂਬਰ ਨੂੰ ਜੁੜਨ ਲਈ ਕਿਹਾ ਹੈ। ਉਦੋਂ ਤੱਕ ਤੁਸੀਂ ਟਾਈਪ ਕਰਦੇ ਰਹਿ ਸਕਦੇ ਹੋ।",
      sendFirst: "ਕਿਰਪਾ ਕਰਕੇ ਪਹਿਲਾਂ ਇੱਕ ਸੁਨੇਹਾ ਭੇਜੋ, ਫਿਰ ਅਸੀਂ ਤੁਹਾਨੂੰ ਜੋੜਾਂਗੇ।",
      newMessage: "ਨਵਾਂ ਸੁਨੇਹਾ",
      attach: "ਤਸਵੀਰ ਨੱਥੀ ਕਰੋ",
      uploadFail: "ਅਪਲੋਡ ਅਸਫਲ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
      maxAttach: "ਤੁਸੀਂ ਵੱਧ ਤੋਂ ਵੱਧ 4 ਤਸਵੀਰਾਂ ਨੱਥੀ ਕਰ ਸਕਦੇ ਹੋ।",
      tooBig: "ਹਰੇਕ ਤਸਵੀਰ 5MB ਤੋਂ ਘੱਟ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।",
      badType: "ਸਿਰਫ਼ PNG, JPEG, WEBP ਜਾਂ GIF ਤਸਵੀਰਾਂ ਦੀ ਆਗਿਆ ਹੈ।",
      sourcesLabel: "ਸਰੋਤ",
      voiceTitle: "ਵੌਇਸ ਇਨਪੁੱਟ",
      ttsMute: "ਆਵਾਜ਼ ਬੰਦ ਕਰੋ",
      ttsUnmute: "ਆਵਾਜ਼ ਚਾਲੂ ਕਰੋ",
      bookingDefault: "ਮੀਟਿੰਗ ਬੁੱਕ ਕਰੋ",
      ratePrompt: "ਤੁਹਾਡਾ ਅਨੁਭਵ ਕਿਵੇਂ ਰਿਹਾ?",
      rateComment: "ਟਿੱਪਣੀ ਸ਼ਾਮਲ ਕਰੋ (ਵਿਕਲਪਿਕ)",
      rateSubmit: "ਜਮ੍ਹਾਂ ਕਰੋ",
      rateThanks: "ਤੁਹਾਡੇ ਫੀਡਬੈਕ ਲਈ ਧੰਨਵਾਦ!",
      rateChat: "ਇਸ ਚੈਟ ਨੂੰ ਰੇਟ ਕਰੋ",
      consentAgree: "ਸਹਿਮਤ ਹੋਵੋ ਅਤੇ ਜਾਰੀ ਰੱਖੋ",
      consentDecline: "ਇਨਕਾਰ ਕਰੋ",
      consentDefault: "ਜਾਰੀ ਰੱਖ ਕੇ, ਤੁਸੀਂ ਸਾਨੂੰ ਸਹਾਇਤਾ ਪ੍ਰਦਾਨ ਕਰਨ ਲਈ ਆਪਣੇ ਸੁਨੇਹਿਆਂ ਦੀ ਪ੍ਰਕਿਰਿਆ ਕਰਨ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ।",
      preChatStart: "ਚੈਟ ਸ਼ੁਰੂ ਕਰੋ",
      requiredField: "ਇਹ ਖੇਤਰ ਲੋੜੀਂਦਾ ਹੈ।",
      poweredBy: "Sahayak AI ਦੁਆਰਾ ਸੰਚਾਲਿਤ",
      awayFallback: "ਅਸੀਂ ਇਸ ਸਮੇਂ ਉਪਲਬਧ ਨਹੀਂ ਹਾਂ। ਆਪਣਾ ਈਮੇਲ ਛੱਡੋ ਅਤੇ ਸਾਡੀ ਟੀਮ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰੇਗੀ।",
      welcomeBack: "ਮੁੜ ਸੁਆਗਤ ਹੈ, {name}!",
      helpTitle: "ਮਦਦ ਕੇਂਦਰ",
      helpOpen: "ਮਦਦ ਅਤੇ ਸਵਾਲ",
      helpSearchPlaceholder: "ਮਦਦ ਲੱਭੋ…",
      helpEmpty: "ਕੋਈ ਲੇਖ ਨਹੀਂ ਮਿਲਿਆ। ਵੱਖਰੇ ਸ਼ਬਦ ਅਜ਼ਮਾਓ।",
      helpError: "ਮਦਦ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੀ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
      helpPrompt: "ਤੇਜ਼ ਜਵਾਬਾਂ ਲਈ ਸਾਡੇ ਨਾਲੇਜ ਬੇਸ ਵਿੱਚ ਖੋਜੋ।",
      helpUse: "ਜਵਾਬ ਚੈਟ ਵਿੱਚ ਸ਼ਾਮਲ ਕਰੋ",
      helpBack: "ਚੈਟ 'ਤੇ ਵਾਪਸ ਜਾਓ",
      surveyShare: "ਫੀਡਬੈਕ ਸਾਂਝਾ ਕਰੋ",
      surveyIntro: "ਸਾਨੂੰ ਤੁਹਾਡਾ ਫੀਡਬੈਕ ਪਸੰਦ ਆਵੇਗਾ।",
      surveyStep: "ਸਵਾਲ {n} / {total}",
      surveyNext: "ਅੱਗੇ",
      surveySubmit: "ਜਮ੍ਹਾਂ ਕਰੋ",
      surveyPlaceholder: "ਆਪਣਾ ਜਵਾਬ ਲਿਖੋ…",
      surveyThanks: "ਆਪਣਾ ਫੀਡਬੈਕ ਸਾਂਝਾ ਕਰਨ ਲਈ ਧੰਨਵਾਦ!",
      langTitle: "ਭਾਸ਼ਾ",
      dropHere: "ਜੋੜਨ ਲਈ ਤਸਵੀਰਾਂ ਇੱਥੇ ਛੱਡੋ",
    },
  };
  function t(key) {
    const lang = (cfg.language || "en").toLowerCase().split("-")[0];
    const d = STRINGS[lang] || STRINGS.en;
    return d[key] != null ? d[key] : STRINGS.en[key];
  }

  /* ---------- theme / palette ---------- */
  function isDark() {
    const th = (cfg.theme || "light").toLowerCase();
    if (th === "dark") return true;
    if (th === "auto") {
      try {
        return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      } catch (e) {
        return false;
      }
    }
    return false;
  }
  function palette() {
    if (isDark()) {
      return {
        boxBg: "#1f2127",
        messagesBg: "linear-gradient(#17181c,#1f2127)",
        botBubble: "#2a2d36",
        botText: "#e8eaed",
        agentBubble: rgba(cfg.primaryColor, 0.28),
        inputBg: "#2a2d36",
        inputBgFocus: "#33363f",
        inputBorder: "#3a3d46",
        inputText: "#e8eaed",
        border: "rgba(255,255,255,0.08)",
        sysBg: "#2a2d36",
        sysText: "#9ca3af",
        closeColor: "#fff",
        scrollThumb: "#3a3d46",
        humanText: "#9ca3af",
        feedbackBg: "#2a2d36",
        feedbackBorder: "#3a3d46",
        feedbackText: "#e8eaed",
        escBg: "#2a2d36",
        escBorder: "#3a3d46",
        escText: "#e8eaed",
        placeholder: "#8b8f99",
        inputRowBg: "#1f2127",
        bubbleShadow: "0 1px 3px rgba(0,0,0,0.35)",
        teaserBg: "#2a2d36",
        teaserText: "#e8eaed",
      };
    }
    return {
      boxBg: "#fff",
      messagesBg: "linear-gradient(#fafafa,#ffffff)",
      botBubble: "#f1f2f6",
      botText: "#1f2430",
      agentBubble: rgba(cfg.primaryColor, 0.08),
      inputBg: "#f8f8fb",
      inputBgFocus: "#fff",
      inputBorder: "#ececf1",
      inputText: "#1f2430",
      border: "rgba(0,0,0,0.05)",
      sysBg: "#f1f2f6",
      sysText: "#9ca3af",
      closeColor: "#fff",
      scrollThumb: "#dcdce3",
      humanText: "#9ca3af",
      feedbackBg: "#fff",
      feedbackBorder: "#ececf1",
      feedbackText: "#1f2430",
      escBg: "#fff",
      escBorder: "#ececf1",
      escText: "#1f2430",
      placeholder: "#9ca3af",
      inputRowBg: "#fff",
      bubbleShadow: "0 1px 3px rgba(0,0,0,0.05)",
      teaserBg: "#fff",
      teaserText: "#1f2430",
    };
  }

  /* ---------- scheduled availability ---------- */
  function isWithinAvailability() {
    if (!cfg.availabilityEnabled) return true;
    try {
      const tz = cfg.availabilityTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      const parts = fmt.formatToParts(new Date());
      let hh = 0, mm = 0, wd = "";
      parts.forEach((p) => {
        if (p.type === "hour") hh = parseInt(p.value, 10);
        if (p.type === "minute") mm = parseInt(p.value, 10);
        if (p.type === "weekday") wd = p.value;
      });
      if (hh === 24) hh = 0;
      const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const day = map[wd];
      const days = cfg.availabilityDays || [];
      if (days.length && days.indexOf(day) === -1) return false;
      const parse = (s, def) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
        if (!m) return def;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      };
      const cur = hh * 60 + mm;
      const start = parse(cfg.availabilityStart, 0);
      const end = parse(cfg.availabilityEnd, 24 * 60);
      if (start <= end) return cur >= start && cur < end;
      return cur >= start || cur < end; // overnight window
    } catch (e) {
      return true;
    }
  }
  function isOffline() {
    return !!cfg.availabilityEnabled && !isWithinAvailability();
  }
  function greetMsg() {
    if (isOffline() && cfg.offlineMessage) return cfg.offlineMessage;
    return cfg.welcomeMessage || t("welcomeFallback");
  }
  // Returning-visitor recognition: if we already know the visitor's name and
  // this isn't their first visit, prepend a subtle "Welcome back" line.
  function isReturningVisitor() {
    return !!(conversationId || (storedIdentity && (storedIdentity.name || storedIdentity.email)) || prechatData);
  }
  function openingGreeting() {
    const base = greetMsg();
    const name = identity.name && String(identity.name).trim();
    if (name && isReturningVisitor()) {
      return t("welcomeBack").replace("{name}", name) + "\n\n" + base;
    }
    return base;
  }

  /* ---------- per-page targeting ---------- */
  // Treat each configured entry as a simple glob where "*" matches any run of
  // characters. Everything else is matched literally.
  function globToRegExp(glob) {
    var esc = String(glob).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + esc + "$");
  }
  function pathMatchesGlob(glob) {
    var re;
    try {
      re = globToRegExp(glob);
    } catch (e) {
      return false;
    }
    // Match against both path+query and the bare path so a plain "/pricing"
    // glob still matches "/pricing?ref=x".
    var candidates = [location.pathname + (location.search || ""), location.pathname];
    for (var i = 0; i < candidates.length; i++) {
      if (re.test(candidates[i])) return true;
    }
    return false;
  }
  // Decide whether the widget should render on the current page.
  function pageAllowed() {
    var raw = Array.isArray(cfg.pagePaths) ? cfg.pagePaths : [];
    var paths = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] == null) continue;
      var p = String(raw[i]).trim();
      if (p) paths.push(p);
    }
    if (!paths.length) return true; // no targeting configured → always show
    var matched = false;
    for (var j = 0; j < paths.length; j++) {
      if (pathMatchesGlob(paths[j])) { matched = true; break; }
    }
    // "hide" → suppress on match; "show" (default) → only render on match.
    return cfg.pagePathsMode === "hide" ? !matched : matched;
  }

  /* ---------- persistence ---------- */
  let transcript = []; // array of {from, text, attachments}
  function loadThread() {
    try {
      const raw = localStorage.getItem(THREAD_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || Date.now() - obj.ts > THREAD_TTL) {
        localStorage.removeItem(THREAD_KEY);
        return;
      }
      conversationId = obj.conversationId || null;
      transcript = Array.isArray(obj.messages) ? obj.messages.slice(-THREAD_CAP) : [];
      pollAfter = obj.pollAfter || null;
      humanMode = !!obj.humanMode;
      humanNoticeShown = humanMode;
    } catch (e) {}
  }
  function saveThread() {
    try {
      const obj = {
        ts: Date.now(),
        conversationId,
        messages: transcript.slice(-THREAD_CAP),
        pollAfter,
        humanMode,
      };
      localStorage.setItem(THREAD_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  function recordMessage(from, text, attachments) {
    if (restoring) return;
    transcript.push({ from, text, attachments: attachments || [] });
    if (transcript.length > THREAD_CAP) transcript = transcript.slice(-THREAD_CAP);
    saveThread();
  }

  /* ---------- built-in icons ----------
     Keys MUST stay in sync with src/lib/botIcons.ts (BOT_ICON_KEYS).
     Each value is the inner markup of a 24x24 stroke icon. */
  const ICONS = {
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    message:
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bot:
      '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    headset:
      '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    sparkles:
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    help:
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    smile:
      '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    zap:
      '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    heart:
      '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    star:
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    bell:
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    phone:
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail:
      '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    lifebuoy:
      '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
    rocket:
      '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    flame:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    hand:
      '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    ghost:
      '<path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 21l2.5 1.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
  };
  const SHAPE_RADIUS = {
    circle: "50%",
    squircle: "38%",
    rounded: "26%",
    square: "14%",
    teardrop: "50% 50% 50% 18%",
    leaf: "50% 18% 50% 18%",
  };

  // XSS guards for values that end up in innerHTML / attributes.
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) {
    try {
      const p = new URL(u, location.href).protocol;
      return p === "http:" || p === "https:" || p === "mailto:" ? u : "";
    } catch (e) {
      return "";
    }
  }

  /* ---------- lightweight, XSS-safe Markdown ----------
     Content is HTML-escaped FIRST, then a small set of inline/block rules are
     applied. We never inject raw/unescaped user content; URLs are sanitized to
     http/https/mailto only and opened in a new tab with rel=noopener. */
  function fmtInline(s) {
    // bold then italic (escaped text only — no raw HTML can appear here)
    s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    s = s.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
    s = s.replace(/_([^_\n]+?)_/g, "<em>$1</em>");
    return s;
  }
  function renderRichHtml(raw) {
    var esc = escapeHtml(String(raw == null ? "" : raw));
    var tokens = [];
    function stash(html) { tokens.push(html); return "T" + (tokens.length - 1) + ""; }
    // inline code — protect its contents from further formatting
    esc = esc.replace(/`([^`]+?)`/g, function (_, c) {
      return stash(
        '<code style="background:' + rgba(cfg.primaryColor, 0.1) +
        ';padding:1px 5px;border-radius:5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.9em;">' +
        c + "</code>"
      );
    });
    // links [text](url) — sanitize href; drop to plain text if unsafe
    esc = esc.replace(/\[([^\]]*?)\]\(([^)\s]+?)\)/g, function (m, label, url) {
      var safe = safeUrl(url);
      var lbl = fmtInline(label);
      if (!safe) return lbl;
      return stash(
        '<a href="' + safe + '" target="_blank" rel="noopener noreferrer" ' +
        'style="color:inherit;text-decoration:underline;font-weight:600;">' + lbl + "</a>"
      );
    });
    // bold / italic on the remaining text
    esc = fmtInline(esc);
    // restore protected tokens
    esc = esc.replace(/T(\d+)/g, function (_, i) { return tokens[+i] || ""; });
    // block structure: group bullet runs into <ul>; join other lines with <br>
    var lines = esc.split("\n");
    var html = "", para = [], items = [];
    function flushPara() {
      if (para.length) { html += '<div style="margin:0;">' + para.join("<br>") + "</div>"; para = []; }
    }
    function flushList() {
      if (items.length) {
        html += '<ul style="margin:5px 0;padding-left:18px;">' +
          items.map(function (x) { return '<li style="margin:2px 0;">' + x + "</li>"; }).join("") + "</ul>";
        items = [];
      }
    }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var b = /^\s*(?:[-*•])\s+(.*)$/.exec(ln);
      if (b) { flushPara(); items.push(b[1]); }
      else if (ln.trim() === "") { flushPara(); flushList(); }
      else { flushList(); para.push(ln); }
    }
    flushPara(); flushList();
    return html;
  }
  // Pull [[Label|url]] / [[Label]] action buttons out of a reply.
  function parseActionButtons(text) {
    var buttons = [];
    var cleaned = String(text == null ? "" : text).replace(/\[\[([^\]]+?)\]\]/g, function (_, inner) {
      var parts = String(inner).split("|");
      var label = (parts[0] || "").trim();
      var url = parts.length > 1 ? (parts.slice(1).join("|") || "").trim() : "";
      if (label) buttons.push({ label: label, url: url });
      return "";
    });
    // tidy whitespace left behind by removed markers
    cleaned = cleaned.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text: cleaned, buttons: buttons };
  }

  function iconSvg(key, color, size) {
    const inner = ICONS[key];
    if (!inner) return "";
    // color goes into an SVG attribute — strip anything that could break out.
    const c = String(color || "").replace(/["'<>]/g, "");
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="' + c + '" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>"
    );
  }
  function launcherRadius() {
    return SHAPE_RADIUS[cfg.launcherShape] || "50%";
  }

  /* ---------- color helpers ---------- */
  function hexToRgb(hex) {
    let h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function shade(hex, pct) {
    const { r, g, b } = hexToRgb(hex);
    const f = (c) => Math.round(Math.min(255, Math.max(0, c + (pct / 100) * 255)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  const grad = () => `linear-gradient(135deg, ${shade(cfg.primaryColor, 8)}, ${shade(cfg.primaryColor, -20)})`;

  function launcherHTML() {
    // A chosen built-in icon wins over the emoji field.
    if (cfg.launcherIconKey && ICONS[cfg.launcherIconKey]) {
      return iconSvg(cfg.launcherIconKey, "#fff", 28);
    }
    const ic = (cfg.launcherIcon || "").trim();
    // Empty or the old default → show the 💬 speech bubble; keep any custom emoji.
    if (!ic || ic === "🗨️") return "💬";
    return escapeHtml(ic); // emoji goes into innerHTML — escape to block injection
  }

  const side = () => (cfg.position === "left" ? "left" : "right");

  // Live palette (recomputed in applyConfig)
  let pal = palette();

  // Load any persisted thread before building DOM
  loadThread();

  // ====================================================================
  //  DOM build + wiring — deferred to DOMContentLoaded if body not ready
  // ====================================================================
  function init() {
    // Fonts
    const fontLink = document.createElement("link");
    fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);

    /* ---------- launcher ---------- */
    const button = document.createElement("div");
    button.innerHTML = launcherHTML();
    Object.assign(button.style, {
      position: "fixed", bottom: "24px", right: "24px", width: "62px", height: "62px",
      borderRadius: launcherRadius(), background: grad(), color: "#fff", display: "flex",
      justifyContent: "center", alignItems: "center", fontSize: "26px", cursor: "pointer",
      boxShadow: "0 10px 30px " + rgba(cfg.primaryColor, 0.45), zIndex: "999999",
      transition: "box-shadow 0.25s ease",
    });
    button.className = "sk-launcher";
    // Hidden until the per-page targeting decision resolves (see config fetch
    // below). revealLauncher() flips this back to "flex" once allowed.
    button.style.display = "none";

    // unread badge
    const badge = document.createElement("div");
    Object.assign(badge.style, {
      position: "absolute", top: "-4px", right: "-4px", minWidth: "20px", height: "20px",
      padding: "0 5px", borderRadius: "10px", background: "#ef4444", color: "#fff",
      fontSize: "11px", fontWeight: "700", display: "none", alignItems: "center",
      justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", boxSizing: "border-box",
      fontFamily: "'Inter', system-ui, sans-serif", lineHeight: "1", pointerEvents: "none",
    });
    button.appendChild(badge);
    document.body.appendChild(button);

    // proactive teaser
    const teaser = document.createElement("div");
    Object.assign(teaser.style, {
      position: "fixed", bottom: "100px", right: "24px", maxWidth: "230px",
      padding: "12px 26px 12px 14px", borderRadius: "16px", background: "#fff",
      boxShadow: "0 12px 34px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)",
      zIndex: "999999", display: "none", cursor: "pointer",
      fontFamily: "'Inter', system-ui, sans-serif",
      animation: "skAppear 0.35s cubic-bezier(.2,.8,.2,1) both",
    });
    document.body.appendChild(teaser);

    /* ---------- chat box ---------- */
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed", bottom: "100px", right: "24px", width: "372px",
      maxWidth: "calc(100vw - 40px)", height: "560px", maxHeight: "calc(100vh - 130px)",
      background: "#fff", borderRadius: "22px",
      boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 2px 10px rgba(0,0,0,0.06)",
      display: "none", flexDirection: "column", overflow: "hidden", zIndex: "999999",
      fontFamily: "'Inter', system-ui, sans-serif", opacity: "0",
      transform: "translateY(20px) scale(0.98)", transformOrigin: "bottom right",
      transition: "opacity 0.28s ease, transform 0.28s cubic-bezier(.2,.8,.2,1)",
      border: "1px solid rgba(0,0,0,0.05)",
    });

    box.innerHTML = `
      <div id="sk-header" style="background:${grad()}; color:#fff; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; position:relative;">
        <div style="display:flex; align-items:center; gap:11px;">
          <div id="sk-avatar" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:18px;overflow:hidden;border:1.5px solid rgba(255,255,255,0.25);">🤖</div>
          <div>
            <div id="sk-botname" style="font-weight:700; font-size:15px; letter-spacing:-0.01em;">${cfg.botName}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:1px;">
              <span id="sk-dot" style="width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,0.25);"></span>
              <span id="sk-status" style="font-size:11px; opacity:0.9;">Online now</span>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <span id="sk-help" style="display:none; cursor:pointer; font-size:15px; opacity:0.9; padding:6px; line-height:1; border-radius:8px; transition:background 0.2s;">❓</span>
          <span id="sk-lang" style="display:none; cursor:pointer; font-size:15px; opacity:0.9; padding:6px; line-height:1; border-radius:8px; transition:background 0.2s; position:relative;">🌐</span>
          <span id="sk-book" style="display:none; cursor:pointer; font-size:15px; opacity:0.9; padding:6px; line-height:1; border-radius:8px; transition:background 0.2s;">📅</span>
          <span id="sk-tts" style="display:none; cursor:pointer; font-size:15px; opacity:0.9; padding:6px; line-height:1; border-radius:8px; transition:background 0.2s;">🔊</span>
          <span id="chat-close" style="cursor:pointer; font-size:16px; opacity:0.85; padding:6px; line-height:1; border-radius:8px; transition:background 0.2s;">✕</span>
        </div>
      </div>
      <div id="sk-messages" style="flex:1; padding:18px; overflow-y:auto; background:linear-gradient(#fafafa,#ffffff); display:flex; flex-direction:column; gap:12px;"></div>
      <div id="sk-starters" style="padding:0 14px 4px; display:flex; flex-wrap:wrap; gap:7px;"></div>
      <div style="padding:8px 16px 0; display:flex; justify-content:center;">
        <span id="sk-human" style="font-size:11px; color:#9ca3af; cursor:pointer; font-weight:500;">💬 Talk to a human</span>
      </div>
      <div id="sk-attachments" style="display:none; padding:6px 14px 0; flex-wrap:wrap; gap:6px; align-items:center;"></div>
      <div id="sk-inputrow" style="padding:12px 14px 14px; display:flex; gap:6px; align-items:center; background:#fff;">
        <button id="sk-attach" type="button" aria-label="Attach image" style="width:38px; height:38px; flex-shrink:0; background:transparent; border:none; cursor:pointer; font-size:18px; color:#9ca3af; display:flex; align-items:center; justify-content:center; border-radius:50%; transition:background 0.15s, color 0.15s;">📎</button>
        <button id="sk-mic" type="button" aria-label="Voice input" style="display:none; width:38px; height:38px; flex-shrink:0; background:transparent; border:none; cursor:pointer; font-size:18px; color:#9ca3af; align-items:center; justify-content:center; border-radius:50%; transition:background 0.15s, color 0.15s;">🎤</button>
        <input id="chat-input" type="text" placeholder="Type your message…" autocomplete="off" style="flex:1; padding:12px 16px; border:1.5px solid #ececf1; border-radius:24px; font-size:14px; outline:none; transition:border 0.2s, box-shadow 0.2s; font-family:inherit; background:#f8f8fb;" />
        <button id="chat-send" class="sk-send" style="width:44px; height:44px; flex-shrink:0; background:${grad()}; color:#fff; border:none; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s, filter 0.15s;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
      <div id="sk-branding" style="display:none; text-align:center; padding:0 14px 8px; font-size:10px; letter-spacing:0.01em; opacity:0.85;">Powered by Sahayak AI</div>
    `;
    document.body.appendChild(box);

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes skAppear { from {opacity:0; transform:translateY(10px) scale(0.97);} to {opacity:1; transform:translateY(0) scale(1);} }
      @keyframes skFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-9px);} }
      @keyframes skSpin { to { transform:rotate(360deg); } }
      .sk-launcher { animation: skFloat 3s ease-in-out infinite; }
      .sk-launcher:hover { animation-play-state: paused; transform: scale(1.08) !important; box-shadow: 0 16px 40px rgba(0,0,0,0.28) !important; }
      @keyframes skDot { 0%,60%,100%{transform:translateY(0);opacity:.35;} 30%{transform:translateY(-5px);opacity:1;} }
      @keyframes skPulse { 0%{box-shadow:0 0 0 0 rgba(74,222,128,0.4);} 70%{box-shadow:0 0 0 6px rgba(74,222,128,0);} 100%{box-shadow:0 0 0 0 rgba(74,222,128,0);} }
      #sk-dot { animation: skPulse 2s infinite; }
      #sk-messages::-webkit-scrollbar { width:6px; }
      #sk-messages::-webkit-scrollbar-thumb { background:var(--sk-scroll,#dcdce3); border-radius:3px; }
      #sk-messages::-webkit-scrollbar-track { background:transparent; }
      #chat-close:hover { background:rgba(255,255,255,0.18); }
      #sk-book:hover, #sk-tts:hover, #sk-help:hover, #sk-lang:hover { background:rgba(255,255,255,0.18); }
      #chat-input::placeholder { color:var(--sk-ph,#9ca3af); }
      #sk-attach:hover, #sk-mic:hover { background:rgba(127,127,127,0.12); }
      .sk-send:hover { filter:brightness(1.08); transform:scale(1.05); }
      .sk-send:active { transform:scale(0.95); }
      .sk-chip { animation: skAppear 0.3s ease both; }
      .sk-chip:hover { transform:translateY(-1px); }
      .sk-spinner { width:18px; height:18px; border:2px solid rgba(127,127,127,0.3); border-top-color:#888; border-radius:50%; animation:skSpin 0.7s linear infinite; }
      .sk-typing span { display:inline-block; width:7px; height:7px; margin:0 1.5px; border-radius:50%; background:#9ca3af; animation: skDot 1.3s infinite; }
      .sk-typing span:nth-child(2){ animation-delay:.15s; } .sk-typing span:nth-child(3){ animation-delay:.3s; }
    `;
    document.head.appendChild(styleSheet);

    // Owner-controlled custom CSS lands here; kept/updated in applyConfig().
    const customStyle = document.createElement("style");
    customStyle.setAttribute("data-sahayak-custom", "");
    document.head.appendChild(customStyle);

    const messageArea = box.querySelector("#sk-messages");
    const input = box.querySelector("#chat-input");
    const sendBtn = box.querySelector("#chat-send");
    const startersEl = box.querySelector("#sk-starters");
    const attachBtn = box.querySelector("#sk-attach");
    // Remove the attach affordance entirely when uploads are disabled.
    if (!UPLOAD_ENABLED && attachBtn) attachBtn.remove();
    const attPreview = box.querySelector("#sk-attachments");
    const humanEl = box.querySelector("#sk-human");
    const bookBtn = box.querySelector("#sk-book");
    const ttsBtn = box.querySelector("#sk-tts");
    const micBtn = box.querySelector("#sk-mic");
    const helpBtn = box.querySelector("#sk-help");
    const langBtn = box.querySelector("#sk-lang");
    if (bookBtn) bookBtn.onclick = () => { const su = safeUrl(cfg.bookingUrl); if (su) { try { window.open(su, "_blank", "noopener"); } catch (e) {} } };
    if (ttsBtn) ttsBtn.onclick = () => toggleTts();
    if (micBtn) micBtn.onclick = () => toggleListening();
    if (helpBtn) helpBtn.onclick = () => toggleHelp();
    if (langBtn) langBtn.onclick = (e) => { e.stopPropagation(); toggleLangMenu(); };

    // hidden file input for uploads
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    const scrollBottom = () => { messageArea.scrollTop = messageArea.scrollHeight; };

    /* ---------- unread badge + notification ---------- */
    function setUnread(n) {
      unread = Math.max(0, n);
      if (unread > 0) {
        badge.textContent = unread > 9 ? "9+" : String(unread);
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
    let audioCtx = null;
    function beep() {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended" && audioCtx.resume) audioCtx.resume();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = "sine"; o.frequency.value = 660;
        const now = audioCtx.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        o.start(now); o.stop(now + 0.26);
      } catch (e) {}
    }
    const origTitle = document.title;
    let titleTimer = null;
    function flashTitle() {
      if (titleTimer) return;
      let on = false;
      titleTimer = setInterval(() => {
        document.title = on ? origTitle : "💬 " + t("newMessage");
        on = !on;
      }, 1000);
    }
    function stopFlashTitle() {
      if (titleTimer) { clearInterval(titleTimer); titleTimer = null; }
      document.title = origTitle;
    }

    /* ---------- apply config ---------- */
    function updateStatus() {
      const dot = box.querySelector("#sk-dot");
      const st = box.querySelector("#sk-status");
      if (!dot || !st) return;
      if (humanMode) {
        st.textContent = t("liveAgent");
        dot.style.background = "#4ade80";
        dot.style.boxShadow = "0 0 0 3px rgba(74,222,128,0.25)";
        dot.style.animation = "";
        return;
      }
      if (isOffline()) {
        st.textContent = t("offline");
        dot.style.background = "#9ca3af";
        dot.style.boxShadow = "0 0 0 3px rgba(156,163,175,0.25)";
        dot.style.animation = "none";
      } else {
        st.textContent = t("online");
        dot.style.background = "#4ade80";
        dot.style.boxShadow = "0 0 0 3px rgba(74,222,128,0.25)";
        dot.style.animation = "";
      }
    }

    function applyConfig() {
      pal = palette();
      // launcher
      button.innerHTML = launcherHTML();
      button.appendChild(badge); // innerHTML reset wipes children — re-attach badge
      button.style.background = grad();
      button.style.borderRadius = launcherRadius();
      button.style.boxShadow = "0 10px 30px " + rgba(cfg.primaryColor, 0.45);
      var offSide = clampPx(cfg.offsetSide, 24);
      var offBottom = clampPx(cfg.offsetBottom, 24);
      button.style[side()] = offSide + "px";
      button.style[side() === "left" ? "right" : "left"] = "auto";
      button.style.bottom = offBottom + "px";
      // panel position
      box.style[side()] = offSide + "px";
      box.style[side() === "left" ? "right" : "left"] = "auto";
      box.style.bottom = offBottom + 76 + "px";
      box.style.transformOrigin = side() === "left" ? "bottom left" : "bottom right";
      // teaser position
      teaser.style[side()] = offSide + "px";
      teaser.style[side() === "left" ? "right" : "left"] = "auto";
      teaser.style.bottom = offBottom + 76 + "px";

      // theme palette
      box.style.background = pal.boxBg;
      box.style.border = "1px solid " + pal.border;
      messageArea.style.background = pal.messagesBg;
      messageArea.style.setProperty("--sk-scroll", pal.scrollThumb);
      box.querySelector("#sk-inputrow").style.background = pal.inputRowBg;
      input.style.background = pal.inputBg;
      input.style.borderColor = pal.inputBorder;
      input.style.color = pal.inputText;
      input.style.setProperty("--sk-ph", pal.placeholder);
      humanEl.style.color = pal.humanText;
      box.querySelector("#chat-close").style.color = pal.closeColor;

      // header / brand
      box.querySelector("#sk-header").style.background = grad();
      box.querySelector("#sk-botname").textContent = cfg.botName;
      sendBtn.style.background = grad();

      // localized text
      input.setAttribute("placeholder", t("placeholder"));
      sendBtn.setAttribute("aria-label", t("sendAria"));
      humanEl.textContent = t("talkHuman");
      if (attachBtn) {
        attachBtn.setAttribute("aria-label", t("attach"));
        attachBtn.setAttribute("title", t("attach"));
      }

      updateStatus();

      // booking button (header)
      if (bookBtn) {
        if (cfg.bookingEnabled && cfg.bookingUrl) {
          bookBtn.style.display = "inline-block";
          bookBtn.setAttribute("title", cfg.bookingLabel || t("bookingDefault"));
        } else {
          bookBtn.style.display = "none";
        }
      }
      // text-to-speech toggle (header)
      if (ttsBtn) {
        if (cfg.ttsEnabled && ttsSupported) {
          ttsBtn.style.display = "inline-block";
          updateTtsBtn();
        } else {
          ttsBtn.style.display = "none";
        }
      }
      // voice input mic (input row)
      if (micBtn) {
        if (cfg.voiceInput && SpeechRec) {
          micBtn.style.display = "flex";
          micBtn.setAttribute("title", t("voiceTitle"));
          micBtn.setAttribute("aria-label", t("voiceTitle"));
        } else {
          micBtn.style.display = "none";
        }
      }
      // CSAT affordance
      if (rateEl) {
        rateEl.textContent = t("rateChat");
        rateEl.style.color = pal.humanText;
        updateRateAffordance();
      }
      // help center toggle (header)
      if (helpBtn) {
        helpBtn.style.display = cfg.helpCenterEnabled ? "inline-block" : "none";
        helpBtn.setAttribute("title", t("helpOpen"));
        if (!cfg.helpCenterEnabled && typeof toggleHelp === "function") { try { toggleHelp(false); } catch (e) {} }
      }
      if (typeof refreshHelpPanelTheme === "function") refreshHelpPanelTheme();
      // language switcher (header)
      if (langBtn) {
        langBtn.style.display = cfg.languageSwitcher ? "inline-block" : "none";
        langBtn.setAttribute("title", t("langTitle"));
        if (!cfg.languageSwitcher && typeof closeLangMenu === "function") { try { closeLangMenu(); } catch (e) {} }
      }
      // survey affordance (footer)
      if (typeof surveyEl !== "undefined" && surveyEl) {
        surveyEl.textContent = t("surveyShare");
        surveyEl.style.color = pal.humanText;
        updateSurveyAffordance();
      }
      // drop-zone overlay theming
      if (typeof refreshDropOverlay === "function") refreshDropOverlay();

      // owner-controlled custom CSS (raw injection — strip any "</style"
      // sequence so the owner can't break out of the <style> element)
      if (customStyle) {
        var rawCss = typeof cfg.customCss === "string" ? cfg.customCss : "";
        customStyle.textContent = rawCss ? rawCss.replace(/<\/style/gi, "") : "";
      }

      // "Powered by" branding (shown unless explicitly disabled)
      var brandingEl = box.querySelector("#sk-branding");
      if (brandingEl) {
        if (cfg.showBranding !== false) {
          brandingEl.textContent = t("poweredBy");
          brandingEl.style.color = pal.sysText;
          brandingEl.style.display = "block";
        } else {
          brandingEl.style.display = "none";
        }
      }

      const headerAvatar = box.querySelector("#sk-avatar");
      if (cfg.avatarUrl) {
        const img = document.createElement("img");
        img.setAttribute("src", cfg.avatarUrl);
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        headerAvatar.innerHTML = "";
        headerAvatar.appendChild(img);
      } else if (cfg.avatarIconKey && ICONS[cfg.avatarIconKey]) {
        headerAvatar.innerHTML = iconSvg(cfg.avatarIconKey, "#fff", 20);
      }
    }

    input.addEventListener("focus", () => {
      input.style.borderColor = cfg.primaryColor;
      input.style.background = pal.inputBgFocus;
      input.style.boxShadow = "0 0 0 4px " + rgba(cfg.primaryColor, 0.1);
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = pal.inputBorder;
      input.style.background = pal.inputBg;
      input.style.boxShadow = "none";
    });

    /* ---------- rendering ---------- */
    function botAvatar() {
      const a = document.createElement("div");
      Object.assign(a.style, {
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: "0",
        background: rgba(cfg.primaryColor, 0.12), color: cfg.primaryColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "14px", marginTop: "auto",
      });
      if (cfg.avatarUrl) {
        const img = document.createElement("img");
        img.setAttribute("src", cfg.avatarUrl);
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.borderRadius = "50%";
        a.appendChild(img);
      } else if (cfg.avatarIconKey && ICONS[cfg.avatarIconKey]) {
        a.innerHTML = iconSvg(cfg.avatarIconKey, cfg.primaryColor, 16);
      } else {
        a.textContent = "🤖";
      }
      return a;
    }

    function bubbleStyle(from) {
      const isUser = from === "user";
      const isAgent = from === "agent";
      return {
        maxWidth: "100%", padding: "10px 14px", borderRadius: "18px",
        fontSize: "14px", lineHeight: "1.5", wordBreak: "break-word",
        background: isUser ? grad() : isAgent ? pal.agentBubble : pal.botBubble,
        color: isUser ? "#fff" : pal.botText,
        borderBottomRightRadius: isUser ? "5px" : "18px",
        borderBottomLeftRadius: isUser ? "18px" : "5px",
        boxShadow: isUser ? "0 2px 8px " + rgba(cfg.primaryColor, 0.25) : pal.bubbleShadow,
      };
    }

    function attachmentGrid(urls) {
      const g = document.createElement("div");
      Object.assign(g.style, { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end" });
      (urls || []).forEach((u) => {
        const im = document.createElement("img");
        im.setAttribute("src", u);
        Object.assign(im.style, {
          width: "120px", maxWidth: "60%", borderRadius: "12px", display: "block",
          objectFit: "cover", boxShadow: pal.bubbleShadow, cursor: "pointer",
        });
        im.onclick = () => { const su = safeUrl(u); if (su) { try { window.open(su, "_blank", "noopener"); } catch (e) {} } };
        g.appendChild(im);
      });
      return g;
    }

    // Build clickable action buttons from [[Label|url]] markers.
    function makeActionButtons(buttons) {
      const row = document.createElement("div");
      Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" });
      let added = 0;
      (buttons || []).forEach((b) => {
        if (!b || !b.label) return;
        const safe = b.url ? safeUrl(b.url) : "";
        const chip = makeChip(b.label, () => {
          if (safe) { try { window.open(safe, "_blank", "noopener"); } catch (e) {} }
          else { input.value = b.label; sendMessage(); }
        });
        chip.style.marginTop = "0";
        row.appendChild(chip);
        added++;
      });
      return added ? row : null;
    }
    // Render a bot/agent bubble with escaped-then-formatted Markdown + buttons.
    function setRichContent(bubble, text, from) {
      bubble.innerHTML = "";
      const parsed = parseActionButtons(text);
      const content = document.createElement("div");
      content.innerHTML = renderRichHtml(parsed.text);
      bubble.appendChild(content);
      const btns = makeActionButtons(parsed.buttons);
      if (btns) bubble.appendChild(btns);
      if (from === "agent") {
        const tag = document.createElement("div");
        tag.innerText = "Support agent";
        Object.assign(tag.style, { fontSize: "10px", fontWeight: "700", color: cfg.primaryColor, marginBottom: "2px", opacity: "0.85" });
        bubble.prepend(tag);
      }
    }

    // Returns the text bubble element (so streaming can append into it).
    function addMessage(text, from, opts) {
      opts = opts || {};
      const atts = opts.attachments || [];
      const record = opts.record !== false;
      let bubble = null;

      if (from === "user") {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
          alignSelf: "flex-end", display: "flex", flexDirection: "column",
          gap: "6px", maxWidth: "88%", alignItems: "flex-end",
          animation: "skAppear 0.32s cubic-bezier(.2,.8,.2,1) both",
        });
        if (atts.length) wrap.appendChild(attachmentGrid(atts));
        if (text) {
          bubble = document.createElement("div");
          bubble.innerText = text;
          Object.assign(bubble.style, bubbleStyle(from));
          wrap.appendChild(bubble);
        }
        messageArea.appendChild(wrap);
      } else {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex", gap: "8px", alignSelf: "flex-start", maxWidth: "88%",
          animation: "skAppear 0.32s cubic-bezier(.2,.8,.2,1) both",
        });
        bubble = document.createElement("div");
        Object.assign(bubble.style, bubbleStyle(from));
        setRichContent(bubble, text, from); // lightweight Markdown + action buttons
        row.appendChild(botAvatar());
        row.appendChild(bubble);
        messageArea.appendChild(row);
      }
      if (record) recordMessage(from, text, atts);
      scrollBottom();
      return bubble;
    }

    function makeTyping() {
      const row = document.createElement("div");
      Object.assign(row.style, { display: "flex", gap: "8px", alignSelf: "flex-start", animation: "skAppear 0.3s ease both" });
      const bubble = document.createElement("div");
      bubble.className = "sk-typing";
      Object.assign(bubble.style, {
        padding: "12px 16px", borderRadius: "18px", borderBottomLeftRadius: "5px",
        background: pal.botBubble, display: "flex", alignItems: "center",
      });
      bubble.innerHTML = "<span></span><span></span><span></span>";
      row.appendChild(botAvatar());
      row.appendChild(bubble);
      return row;
    }

    function addFeedback(messageId) {
      if (!messageId) return;
      const row = document.createElement("div");
      Object.assign(row.style, { display: "flex", gap: "6px", alignSelf: "flex-start", marginTop: "-4px", marginLeft: "36px" });
      const mk = (icon, val) => {
        const b = document.createElement("button");
        b.innerText = icon;
        Object.assign(b.style, {
          border: "1px solid " + pal.feedbackBorder, background: pal.feedbackBg, borderRadius: "10px",
          cursor: "pointer", fontSize: "12px", padding: "3px 9px", transition: "all 0.15s",
        });
        b.onmouseover = () => { b.style.borderColor = cfg.primaryColor; b.style.transform = "scale(1.1)"; };
        b.onmouseout = () => { b.style.borderColor = pal.feedbackBorder; b.style.transform = "scale(1)"; };
        b.onclick = () => {
          fetch(feedback_Url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, value: val, conversationId, visitorId }) }).catch(() => {});
          row.innerHTML = '<span style="font-size:11px;color:#9ca3af;margin-left:0">' + t("feedbackThanks") + "</span>";
        };
        return b;
      };
      row.appendChild(mk("👍", 1));
      row.appendChild(mk("👎", -1));
      messageArea.appendChild(row);
      scrollBottom();
    }

    function makeChip(label, onClick) {
      const chip = document.createElement("button");
      chip.className = "sk-chip";
      chip.innerText = label;
      Object.assign(chip.style, {
        border: "1.5px solid " + rgba(cfg.primaryColor, 0.25), background: rgba(cfg.primaryColor, 0.05),
        borderRadius: "16px", padding: "7px 12px", fontSize: "12.5px", cursor: "pointer",
        color: cfg.primaryColor, fontWeight: "500", fontFamily: "inherit", transition: "all 0.18s",
      });
      chip.onmouseover = () => { chip.style.background = rgba(cfg.primaryColor, 0.12); };
      chip.onmouseout = () => { chip.style.background = rgba(cfg.primaryColor, 0.05); };
      chip.onclick = onClick;
      return chip;
    }
    function renderStarters() {
      startersEl.innerHTML = "";
      if (!cfg.starters || !cfg.starters.length) return;
      cfg.starters.slice(0, 4).forEach((s) => {
        startersEl.appendChild(makeChip(s, () => { input.value = s; sendMessage(); }));
      });
    }
    function clearStarters() { startersEl.innerHTML = ""; }

    /* ---------- quick replies (suggestions) ---------- */
    let quickRepliesEl = null;
    function clearQuickReplies() {
      if (quickRepliesEl && quickRepliesEl.parentNode) quickRepliesEl.remove();
      quickRepliesEl = null;
    }
    function renderQuickReplies(list) {
      clearQuickReplies();
      if (!cfg.quickRepliesEnabled || !Array.isArray(list) || !list.length) return;
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex", flexWrap: "wrap", gap: "7px", alignSelf: "flex-start",
        maxWidth: "88%", marginLeft: "36px", marginTop: "-2px",
      });
      list.slice(0, 6).forEach((s) => {
        if (s == null || String(s).trim() === "") return;
        const label = String(s);
        row.appendChild(makeChip(label, () => { input.value = label; sendMessage(); }));
      });
      if (!row.children.length) return;
      quickRepliesEl = row;
      messageArea.appendChild(row);
      scrollBottom();
    }

    /* ---------- citations / sources ---------- */
    function renderSources(list) {
      if (!cfg.showCitations || !Array.isArray(list) || !list.length) return;
      const items = list.filter((s) => s && (s.title || s.url || s.snippet));
      if (!items.length) return;
      const wrap = document.createElement("div");
      Object.assign(wrap.style, { alignSelf: "flex-start", maxWidth: "88%", marginLeft: "36px", marginTop: "-4px" });
      const toggle = document.createElement("div");
      Object.assign(toggle.style, { fontSize: "11px", color: pal.sysText, cursor: "pointer", fontWeight: "600", userSelect: "none" });
      const listEl = document.createElement("div");
      Object.assign(listEl.style, { display: "none", flexDirection: "column", gap: "4px", marginTop: "5px" });
      items.forEach((s) => {
        const title = (s.title && String(s.title).trim()) || (s.url && String(s.url).trim()) || String(s.snippet).slice(0, 80);
        // Only linkify safe http/https/mailto URLs — a source URL can come from
        // ingested web content, so block javascript:/data: etc.
        const href = s.url ? safeUrl(String(s.url)) : "";
        let el;
        if (href) {
          el = document.createElement("a");
          el.setAttribute("href", href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        } else {
          el = document.createElement("div");
        }
        el.textContent = "• " + title;
        if (s.snippet) el.setAttribute("title", String(s.snippet));
        Object.assign(el.style, { fontSize: "11.5px", lineHeight: "1.4", wordBreak: "break-word", color: href ? cfg.primaryColor : pal.botText, textDecoration: "none" });
        listEl.appendChild(el);
      });
      let open = false;
      const label = () => (open ? "▾ " : "▸ ") + t("sourcesLabel") + " (" + items.length + ")";
      toggle.textContent = label();
      toggle.onclick = () => { open = !open; listEl.style.display = open ? "flex" : "none"; toggle.textContent = label(); scrollBottom(); };
      wrap.appendChild(toggle); wrap.appendChild(listEl);
      messageArea.appendChild(wrap); scrollBottom();
    }

    /* ---------- consent + pre-chat gates ---------- */
    let gateEl = null;
    function removeGate() { if (gateEl && gateEl.parentNode) gateEl.remove(); gateEl = null; }
    function gatesSatisfied() {
      if (conversationId) return true; // existing conversation already passed gates
      if (cfg.consentEnabled && !consentGiven) return false;
      if (cfg.preChatEnabled && !prechatData) return false;
      return true;
    }
    function setInputEnabled(on) {
      input.disabled = !on;
      input.style.opacity = on ? "1" : "0.7";
      sendBtn.style.opacity = on ? "1" : "0.5";
      sendBtn.style.pointerEvents = on ? "auto" : "none";
    }
    function maybeRenderGate() {
      if (conversationId) { setInputEnabled(true); return; }
      if (gateEl && gateEl.parentNode) return; // a gate is already showing
      if (cfg.consentEnabled && !consentGiven) { renderConsent(); setInputEnabled(false); return; }
      if (cfg.preChatEnabled && !prechatData) { renderPrechat(); setInputEnabled(false); return; }
      setInputEnabled(true);
    }
    function gateCard() {
      const card = document.createElement("div");
      Object.assign(card.style, {
        alignSelf: "flex-start", maxWidth: "88%", marginLeft: "36px", background: pal.escBg,
        border: "1px solid " + pal.escBorder, borderRadius: "16px", padding: "13px",
        display: "flex", flexDirection: "column", gap: "9px", boxShadow: pal.bubbleShadow,
        animation: "skAppear 0.32s ease both",
      });
      return card;
    }
    function renderConsent() {
      removeGate();
      const card = gateCard();
      const txt = document.createElement("div");
      txt.textContent = cfg.consentText || t("consentDefault");
      Object.assign(txt.style, { fontSize: "12.5px", lineHeight: "1.5", color: pal.escText });
      const btnRow = document.createElement("div");
      Object.assign(btnRow.style, { display: "flex", gap: "8px", alignItems: "center" });
      const agree = document.createElement("button");
      agree.innerText = t("consentAgree");
      Object.assign(agree.style, { padding: "9px 13px", background: grad(), color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" });
      const decline = document.createElement("button");
      decline.innerText = t("consentDecline");
      Object.assign(decline.style, { padding: "9px 13px", background: "transparent", color: pal.humanText, border: "none", borderRadius: "10px", fontSize: "12.5px", cursor: "pointer", fontFamily: "inherit" });
      agree.onclick = () => {
        consentGiven = true;
        try { localStorage.setItem(CONSENT_KEY, "1"); } catch (e) {}
        removeGate();
        maybeRenderGate();
        setTimeout(() => { if (!input.disabled) input.focus(); }, 50);
      };
      decline.onclick = () => { removeGate(); toggleChat(false); };
      btnRow.appendChild(agree); btnRow.appendChild(decline);
      card.appendChild(txt); card.appendChild(btnRow);
      gateEl = card; messageArea.appendChild(card); scrollBottom();
    }
    function renderPrechat() {
      removeGate();
      const card = gateCard();
      const fields = Array.isArray(cfg.preChatFields) ? cfg.preChatFields : [];
      const inputs = [];
      fields.forEach((f) => {
        if (!f || !f.key) return;
        const lbl = document.createElement("label");
        Object.assign(lbl.style, { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: pal.escText, fontWeight: "500" });
        const span = document.createElement("span");
        span.textContent = (f.label || f.key) + (f.required ? " *" : "");
        const fld = document.createElement("input");
        fld.type = f.type && /^(email|tel|number|url|text)$/i.test(f.type) ? f.type : "text";
        fld.required = !!f.required;
        Object.assign(fld.style, { padding: "9px 12px", border: "1.5px solid " + pal.escBorder, borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", background: pal.inputBg, color: pal.escText });
        lbl.appendChild(span); lbl.appendChild(fld);
        card.appendChild(lbl);
        inputs.push({ field: f, el: fld });
      });
      const note = document.createElement("div");
      Object.assign(note.style, { fontSize: "11.5px", color: "#ef4444", display: "none" });
      const btn = document.createElement("button");
      btn.innerText = t("preChatStart");
      Object.assign(btn.style, { padding: "10px 13px", background: grad(), color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" });
      const submit = () => {
        const values = {};
        for (let i = 0; i < inputs.length; i++) {
          const v = (inputs[i].el.value || "").trim();
          if (inputs[i].field.required && !v) { note.textContent = t("requiredField"); note.style.display = "block"; inputs[i].el.focus(); return; }
          if (v) values[inputs[i].field.key] = v;
        }
        prechatData = values;
        try { localStorage.setItem(PRECHAT_KEY, JSON.stringify(values)); } catch (e) {}
        Object.keys(values).forEach((k) => {
          const lk = k.toLowerCase();
          if (!identity.name && lk === "name") identity.name = values[k];
          if (!identity.email && lk === "email") identity.email = values[k];
        });
        saveIdentity(); // remember for returning-visitor recognition
        removeGate();
        maybeRenderGate();
        setTimeout(() => { if (!input.disabled) input.focus(); }, 50);
      };
      btn.onclick = submit;
      card.appendChild(note); card.appendChild(btn);
      gateEl = card; messageArea.appendChild(card); scrollBottom();
    }

    /* ---------- post-chat CSAT ---------- */
    let rateEl = null;
    let csatCardOpen = false;
    rateEl = document.createElement("span");
    rateEl.textContent = t("rateChat");
    Object.assign(rateEl.style, { fontSize: "11px", color: pal.humanText, cursor: "pointer", fontWeight: "500", marginLeft: "14px", display: "none" });
    rateEl.onclick = () => { showCsat(); };
    if (humanEl && humanEl.parentNode) humanEl.parentNode.appendChild(rateEl);
    function hasBotReply() {
      for (let i = 0; i < transcript.length; i++) { if (transcript[i].from === "bot" || transcript[i].from === "agent") return true; }
      return false;
    }
    function csatAsked() {
      try { return !!conversationId && localStorage.getItem(RATED_KEY) === conversationId; } catch (e) { return false; }
    }
    function markCsatAsked() {
      try { if (conversationId) localStorage.setItem(RATED_KEY, conversationId); } catch (e) {}
      updateRateAffordance();
    }
    function csatEligible() {
      return !!cfg.csatEnabled && !!conversationId && hasBotReply() && !csatAsked();
    }
    function updateRateAffordance() {
      if (!rateEl) return;
      rateEl.style.display = csatEligible() ? "inline" : "none";
    }
    function showCsat() {
      if (csatCardOpen) return;
      csatCardOpen = true;
      const card = document.createElement("div");
      Object.assign(card.style, {
        alignSelf: "center", maxWidth: "92%", background: pal.escBg, border: "1px solid " + pal.escBorder,
        borderRadius: "16px", padding: "13px", display: "flex", flexDirection: "column", gap: "9px",
        boxShadow: pal.bubbleShadow, animation: "skAppear 0.32s ease both", alignItems: "center",
      });
      const title = document.createElement("div");
      title.textContent = t("ratePrompt");
      Object.assign(title.style, { fontSize: "13px", fontWeight: "600", color: pal.escText, textAlign: "center" });
      const stars = document.createElement("div");
      Object.assign(stars.style, { display: "flex", gap: "4px" });
      let rating = 0;
      const starEls = [];
      const paint = (n) => { starEls.forEach((s, i) => { s.textContent = i < n ? "★" : "☆"; s.style.color = i < n ? "#f5b50a" : "#c7c9d1"; }); };
      for (let i = 1; i <= 5; i++) {
        (function (val) {
          const s = document.createElement("span");
          s.textContent = "☆";
          Object.assign(s.style, { fontSize: "26px", cursor: "pointer", color: "#c7c9d1", lineHeight: "1", transition: "color 0.12s" });
          s.onmouseover = () => paint(val);
          s.onmouseout = () => paint(rating);
          s.onclick = () => { rating = val; paint(val); };
          starEls.push(s); stars.appendChild(s);
        })(i);
      }
      const comment = document.createElement("input");
      comment.type = "text";
      comment.placeholder = t("rateComment");
      Object.assign(comment.style, { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1.5px solid " + pal.escBorder, borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", background: pal.inputBg, color: pal.escText });
      const btn = document.createElement("button");
      btn.innerText = t("rateSubmit");
      Object.assign(btn.style, { padding: "9px 16px", background: grad(), color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" });
      btn.onclick = () => {
        if (!rating) { comment.focus(); return; }
        btn.disabled = true; btn.innerText = t("sending");
        const payload = { conversationId, visitorId, rating };
        const c = (comment.value || "").trim();
        if (c) payload.comment = c;
        fetch(rating_Url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .catch(() => {})
          .then(() => { card.innerHTML = '<div style="font-size:13px;color:#059669;font-weight:600;text-align:center">' + t("rateThanks") + "</div>"; });
        markCsatAsked();
      };
      card.appendChild(title); card.appendChild(stars); card.appendChild(comment); card.appendChild(btn);
      messageArea.appendChild(card); scrollBottom();
      markCsatAsked();
    }

    /* ---------- language maps (voice + tts) ---------- */
    const LANG_BCP47 = { en: "en-US", hi: "hi-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", or: "or-IN", as: "as-IN", pa: "pa-IN" };
    function detectLang(s) {
      s = String(s || "");
      if (/[஀-௿]/.test(s)) return "ta";
      if (/[ఀ-౿]/.test(s)) return "te";
      if (/[ಀ-೿]/.test(s)) return "kn";
      if (/[ഀ-ൿ]/.test(s)) return "ml";
      if (/[઀-૿]/.test(s)) return "gu";
      if (/[਀-੿]/.test(s)) return "pa";
      if (/[଀-୿]/.test(s)) return "or";
      if (/[ঀ-৿]/.test(s)) return (cfg.language || "").toLowerCase().indexOf("as") === 0 ? "as" : "bn";
      if (/[ऀ-ॿ]/.test(s)) return (cfg.language || "").toLowerCase().indexOf("mr") === 0 ? "mr" : "hi";
      return "";
    }
    function resolveLang(hint) {
      let code = detectLang(hint);
      if (!code) code = (cfg.language || "en").toLowerCase().split("-")[0];
      return LANG_BCP47[code] || "";
    }

    /* ---------- text-to-speech ---------- */
    const ttsSupported = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
    function speak(text) {
      if (!cfg.ttsEnabled || !ttsSupported) return;
      if (ttsMuted || !userInteracted || !isOpen) return;
      if (!text || !String(text).trim()) return;
      try {
        const u = new SpeechSynthesisUtterance(String(text));
        const lg = resolveLang(text);
        if (lg) u.lang = lg;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
    function updateTtsBtn() {
      if (!ttsBtn) return;
      ttsBtn.textContent = ttsMuted ? "🔇" : "🔊";
      ttsBtn.setAttribute("title", ttsMuted ? t("ttsUnmute") : t("ttsMute"));
    }
    function toggleTts() {
      ttsMuted = !ttsMuted;
      try { localStorage.setItem(TTS_KEY, ttsMuted ? "1" : "0"); } catch (e) {}
      if (ttsMuted) { try { window.speechSynthesis.cancel(); } catch (e) {} }
      updateTtsBtn();
    }

    /* ---------- voice input (speech recognition) ---------- */
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null, listening = false, micBase = "";
    function micActive(on) {
      if (!micBtn) return;
      micBtn.style.color = on ? cfg.primaryColor : "#9ca3af";
      micBtn.style.background = on ? rgba(cfg.primaryColor, 0.12) : "transparent";
    }
    function stopListening() {
      try { if (recognition) recognition.stop(); } catch (e) {}
      listening = false; micActive(false);
    }
    function toggleListening() {
      if (!SpeechRec) return;
      if (listening) { stopListening(); return; }
      if (!recognition) {
        try { recognition = new SpeechRec(); } catch (e) { return; }
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          let finalT = "", interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalT += r[0].transcript; else interim += r[0].transcript;
          }
          const joiner = micBase && !/\s$/.test(micBase) ? " " : "";
          if (finalT) { micBase = (micBase + joiner + finalT).trim(); input.value = micBase; }
          else { input.value = micBase + joiner + interim; }
        };
        recognition.onend = () => { listening = false; micActive(false); };
        recognition.onerror = () => { listening = false; micActive(false); };
      }
      micBase = (input.value || "").trim();
      try {
        recognition.lang = resolveLang("");
        recognition.start();
        listening = true; micActive(true); input.focus();
      } catch (e) { listening = false; micActive(false); }
    }

    function addEscalationForm(question) {
      const wrap = document.createElement("div");
      Object.assign(wrap.style, {
        alignSelf: "flex-start", maxWidth: "88%", marginLeft: "36px", background: pal.escBg,
        border: "1px solid " + pal.escBorder, borderRadius: "16px", padding: "13px",
        display: "flex", flexDirection: "column", gap: "8px", boxShadow: pal.bubbleShadow,
        animation: "skAppear 0.32s ease both",
      });
      const emailInput = document.createElement("input");
      emailInput.type = "email";
      emailInput.placeholder = t("emailPlaceholder");
      Object.assign(emailInput.style, { padding: "10px 13px", border: "1.5px solid " + pal.escBorder, borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", background: pal.inputBg, color: pal.escText });
      const btn = document.createElement("button");
      btn.innerText = t("sendSupport");
      Object.assign(btn.style, { padding: "10px 13px", background: grad(), color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" });
      const note = document.createElement("div");
      note.style.fontSize = "12px"; note.style.color = "#9ca3af";
      const submit = async () => {
        const email = emailInput.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.style.color = "#ef4444"; note.innerText = t("invalidEmail"); return; }
        btn.disabled = true; btn.innerText = t("sending");
        try {
          const res = await fetch(support_Url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId, botId, conversationId, visitorEmail: email, question }) });
          const data = await res.json();
          if (res.ok && data && data.ok) {
            wrap.innerHTML = '<div style="font-size:13px;color:#059669;font-weight:500">' + t("escSuccess") + "</div>";
          } else { note.style.color = "#ef4444"; note.innerText = (data && data.message) || t("escFail"); btn.disabled = false; btn.innerText = t("sendSupport"); }
        } catch (e) { note.style.color = "#ef4444"; note.innerText = t("connError"); btn.disabled = false; btn.innerText = t("sendSupport"); }
      };
      btn.onclick = submit;
      emailInput.onkeypress = (e) => { if (e.key === "Enter") submit(); };
      wrap.appendChild(emailInput); wrap.appendChild(btn); wrap.appendChild(note);
      messageArea.appendChild(wrap);
      scrollBottom();
    }

    function systemNote(text) {
      const n = document.createElement("div");
      n.innerText = text;
      Object.assign(n.style, { alignSelf: "center", fontSize: "11px", color: pal.sysText, background: pal.sysBg, padding: "4px 12px", borderRadius: "10px", margin: "2px 0" });
      messageArea.appendChild(n);
      scrollBottom();
    }

    function renderTranscript() {
      restoring = true;
      transcript.forEach((m) => addMessage(m.text, m.from, { attachments: m.attachments || [], record: false }));
      restoring = false;
      updateStatus();
    }

    /* ---------- file / image upload ---------- */
    const attachList = []; // completed attachment URLs
    let pendingCount = 0;

    function clearAttachments() {
      attachList.length = 0;
      pendingCount = 0;
      attPreview.innerHTML = "";
      attPreview.style.display = "none";
    }
    function attError(msg) {
      const e = document.createElement("div");
      e.textContent = msg;
      Object.assign(e.style, { fontSize: "11px", color: "#ef4444", width: "100%", margin: "2px 0" });
      attPreview.style.display = "flex";
      attPreview.appendChild(e);
      setTimeout(() => {
        if (e.parentNode) e.remove();
        if (!attPreview.children.length) attPreview.style.display = "none";
      }, 3500);
    }
    function uploadFile(file) {
      if (attachList.length + pendingCount >= 4) { attError(t("maxAttach")); return; }
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { attError(t("badType")); return; }
      if (file.size > 5 * 1024 * 1024) { attError(t("tooBig")); return; }

      attPreview.style.display = "flex";
      const tile = document.createElement("div");
      Object.assign(tile.style, {
        position: "relative", width: "54px", height: "54px", borderRadius: "10px",
        overflow: "hidden", background: pal.botBubble, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: "0",
        border: "1px solid " + pal.inputBorder,
      });
      const spinner = document.createElement("div");
      spinner.className = "sk-spinner";
      tile.appendChild(spinner);
      attPreview.appendChild(tile);
      pendingCount++;

      const fd = new FormData();
      fd.append("file", file);
      fd.append("botId", botId || "");
      fd.append("ownerId", ownerId || "");

      fetch(upload_Url, { method: "POST", body: fd })
        .then((r) =>
          r.ok
            ? r.json()
            : r
                .json()
                .catch(() => ({}))
                .then((e) => Promise.reject(e && e.message)),
        )
        .then((data) => {
          pendingCount--;
          if (!data || !data.url) return Promise.reject();
          const url = data.url;
          attachList.push(url);
          tile.removeChild(spinner);
          const img = document.createElement("img");
          img.setAttribute("src", url);
          Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
          tile.appendChild(img);
          const x = document.createElement("span");
          x.textContent = "✕";
          Object.assign(x.style, {
            position: "absolute", top: "2px", right: "2px", width: "16px", height: "16px",
            borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "9px",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          });
          x.onclick = () => {
            const i = attachList.indexOf(url);
            if (i >= 0) attachList.splice(i, 1);
            tile.remove();
            if (!attPreview.children.length) attPreview.style.display = "none";
          };
          tile.appendChild(x);
        })
        .catch((msg) => {
          pendingCount--;
          tile.remove();
          attError(typeof msg === "string" && msg ? msg : t("uploadFail"));
          if (!attPreview.children.length) attPreview.style.display = "none";
        });
    }
    if (UPLOAD_ENABLED) {
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const files = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = "";
      files.forEach(uploadFile);
    };

    /* ---------- attachment upgrades: drag-and-drop + paste ---------- */
    // Full-panel drop overlay, shown while an image is dragged over the box.
    const dropOverlay = document.createElement("div");
    Object.assign(dropOverlay.style, {
      position: "absolute", inset: "0", display: "none", zIndex: "5",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      flexDirection: "column", gap: "8px", borderRadius: "22px",
      background: rgba(cfg.primaryColor, 0.08), border: "2px dashed " + cfg.primaryColor,
      color: cfg.primaryColor, fontSize: "14px", fontWeight: "600",
      fontFamily: "'Inter', system-ui, sans-serif", pointerEvents: "none",
    });
    dropOverlay.innerHTML = '<div style="font-size:30px;line-height:1;">🖼️</div><div id="sk-drop-label"></div>';
    box.appendChild(dropOverlay);
    function refreshDropOverlay() {
      dropOverlay.style.background = rgba(cfg.primaryColor, 0.08);
      dropOverlay.style.borderColor = cfg.primaryColor;
      dropOverlay.style.color = cfg.primaryColor;
      const lbl = dropOverlay.querySelector("#sk-drop-label");
      if (lbl) lbl.textContent = t("dropHere");
    }
    refreshDropOverlay();
    let dragDepth = 0;
    const hasFiles = (dt) => {
      if (!dt) return false;
      if (dt.types) { for (let i = 0; i < dt.types.length; i++) if (dt.types[i] === "Files") return true; }
      return false;
    };
    box.addEventListener("dragenter", (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault(); dragDepth++;
      refreshDropOverlay();
      dropOverlay.style.display = "flex";
    });
    box.addEventListener("dragover", (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "copy"; } catch (err) {}
    });
    box.addEventListener("dragleave", (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropOverlay.style.display = "none";
    });
    box.addEventListener("drop", (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      dragDepth = 0;
      dropOverlay.style.display = "none";
      const files = Array.prototype.slice.call(e.dataTransfer.files || []);
      files.filter((f) => f && /^image\//i.test(f.type)).forEach(uploadFile);
    });
    // Paste an image straight from the clipboard while the input is focused.
    input.addEventListener("paste", (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      const imgs = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file" && /^image\//i.test(items[i].type)) {
          const f = items[i].getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) { e.preventDefault(); imgs.forEach(uploadFile); }
    });
    } // end if (UPLOAD_ENABLED)

    /* ---------- typing indicators ---------- */
    function showAgentTyping() {
      if (agentTypingEl) return;
      agentTypingEl = makeTyping();
      messageArea.appendChild(agentTypingEl);
      scrollBottom();
    }
    function hideAgentTyping() {
      if (agentTypingEl && agentTypingEl.parentNode) messageArea.removeChild(agentTypingEl);
      agentTypingEl = null;
    }

    /* ---------- polling (adaptive: 4s open, 10s closed, paused when hidden) ---------- */
    function pollInterval() { return isOpen ? 4000 : 10000; }
    function schedulePoll() {
      stopPolling();
      if (!conversationId) return;
      pollTimer = setInterval(() => { if (!document.hidden) pollOnce(); }, pollInterval());
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
    async function pollOnce() {
      if (!conversationId) return;
      try {
        const url = poll_Url + "?conversationId=" + conversationId + "&visitorId=" + encodeURIComponent(visitorId) + (pollAfter ? "&after=" + encodeURIComponent(pollAfter) : "");
        const res = await fetch(url);
        const data = await res.json();
        const wasHuman = humanMode;
        humanMode = data.mode === "human";
        if (humanMode && !humanNoticeShown) {
          humanNoticeShown = true;
          updateStatus();
          systemNote(t("connectedAgent"));
        }
        if (humanMode !== wasHuman) { updateStatus(); saveThread(); }

        const msgs = data.messages || [];
        msgs.forEach((m) => { hideAgentTyping(); addMessage(m.content, "agent"); speak(m.content); pollAfter = m.createdAt; });
        if (msgs.length) {
          saveThread();
          updateRateAffordance();
          updateSurveyAffordance();
          if (!isOpen) { setUnread(unread + msgs.length); beep(); flashTitle(); }
        }
        if (data.agentTyping && isOpen) showAgentTyping(); else hideAgentTyping();
      } catch (e) { /* ignore */ }
    }

    /* ---------- streaming handler ---------- */
    async function handleStream(response, typing, question) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let bubble = null, acc = "", msgId = null, fallback = false, human = false;
      let suggestions = [], sources = [];
      const removeTyping = () => { if (typing && typing.parentNode) messageArea.removeChild(typing); };
      const ensureBubble = () => {
        if (!bubble) { removeTyping(); bubble = addMessage("", "bot", { record: false }); }
      };

      // A mid-stream network drop must not leave an unformatted, unsaved partial
      // bubble AND trigger sendMessage's catch (which would add a 2nd error
      // bubble). On read failure we finalize whatever we have here and swallow
      // the error so exactly one outcome is produced per send.
      try {
      while (true) {
        const read = await reader.read();
        if (read.done) break;
        buf += decoder.decode(read.value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk
            .split("\n")
            .filter((l) => l.indexOf("data:") === 0)
            .map((l) => l.slice(5).trim())
            .join("");
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line); } catch (e) { continue; }

          if (evt.type === "meta") {
            if (evt.conversationId) {
              if (!conversationId) pollAfter = new Date().toISOString();
              conversationId = evt.conversationId;
              saveThread();
              schedulePoll();
            }
          } else if (evt.type === "delta") {
            ensureBubble();
            acc += evt.text || "";
            bubble.textContent = acc;
            scrollBottom();
          } else if (evt.type === "human") {
            human = true;
            if (evt.conversationId) conversationId = evt.conversationId;
            removeTyping();
            humanMode = true;
            schedulePoll();
            systemNote(t("msgSentAgent"));
            saveThread();
          } else if (evt.type === "done") {
            msgId = evt.messageId || null;
            fallback = !!evt.fallback;
            if (evt.conversationId) conversationId = evt.conversationId;
            if (Array.isArray(evt.suggestions)) suggestions = evt.suggestions;
            if (Array.isArray(evt.sources)) sources = evt.sources;
          } else if (evt.type === "error") {
            ensureBubble();
            acc = acc || (evt.message || t("genError"));
            bubble.textContent = acc;
          }
        }
      }
      } catch (err) {
        // Mid-stream read failure (e.g. network drop). If nothing usable was
        // received, drop the empty partial bubble and show a single error
        // bubble here, then swallow the error so sendMessage's catch does NOT
        // append a SECOND error bubble. If we already have partial text, fall
        // through to the shared finalize path below so the bubble is formatted
        // and saved rather than left raw.
        if (!bubble || !acc) {
          if (bubble && bubble.parentNode) messageArea.removeChild(bubble);
          bubble = null; acc = "";
          removeTyping();
          if (!human) addMessage(t("connError"), "bot");
          return;
        }
        // else: finalize the partial reply via the normal path below.
      }
      removeTyping();
      if (!human) {
        if (bubble && acc) setRichContent(bubble, acc, "bot"); // Markdown + action buttons
        if (bubble && acc) recordMessage("bot", acc, []);
        renderSources(sources);
        if (msgId) addFeedback(msgId);
        if (fallback) addEscalationForm(question);
        renderQuickReplies(suggestions);
        if (bubble && acc) speak(acc);
        updateRateAffordance();
        updateSurveyAffordance();
      }
    }

    /* ---------- request a human (shared by the footer link + flow handoff) ---------- */
    async function requestHuman() {
      if (!conversationId) { systemNote(t("sendFirst")); return; }
      // Outside configured availability hours: don't imply a live agent will
      // join. Show the away message and offer the async email-capture path.
      if (isOffline()) {
        var away = (cfg.awayMessage && String(cfg.awayMessage).trim()) ||
          (cfg.offlineMessage && String(cfg.offlineMessage).trim()) ||
          t("awayFallback");
        systemNote(away);
        addEscalationForm(lastQuestion || "");
        return;
      }
      try {
        await fetch(human_Url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ botId, ownerId, conversationId, visitorId }) });
        systemNote(t("askedJoin"));
      } catch (e) { /* ignore */ }
    }

    /* ---------- flow runner ----------
       Owner-built step flows. When a visitor message matches a flow trigger we
       walk the steps client-side INSTEAD of calling the AI. Everything renders
       through the same XSS-safe helpers (addMessage / makeChip). No flows → this
       is entirely inert and chat behaves exactly as before. */
    function indexSteps(steps) {
      const map = {}, order = [];
      (Array.isArray(steps) ? steps : []).forEach((s) => {
        if (!s || s.id == null) return;
        const id = String(s.id);
        if (map[id]) return; // first definition wins on duplicate ids
        map[id] = s; order.push(id);
      });
      return { map: map, order: order };
    }
    // First flow whose non-empty trigger matches the text (exact or substring),
    // case-insensitive and trimmed. First match wins.
    function findFlowForText(text) {
      const q = String(text == null ? "" : text).trim().toLowerCase();
      if (!q) return null;
      for (let i = 0; i < flows.length; i++) {
        const f = flows[i];
        const trig = f && f.trigger != null ? String(f.trigger).trim().toLowerCase() : "";
        if (!trig) continue;
        if (q === trig || q.indexOf(trig) !== -1) return f;
      }
      return null;
    }
    function endFlow() { flow = null; }
    // The step to run after `step` finishes: explicit `next`, else the next step
    // in declared order, else null (ends the flow).
    function flowNextId(step) {
      if (step && step.next != null && String(step.next) !== "") return String(step.next);
      const i = flow ? flow.order.indexOf(String(step.id)) : -1;
      if (i >= 0 && i + 1 < flow.order.length) return flow.order[i + 1];
      return null;
    }
    function startFlow(f) {
      const idx = indexSteps(f.steps);
      if (!idx.order.length) return false;
      flow = { def: f, map: idx.map, order: idx.order, data: {}, awaitingField: null };
      runStep(idx.order[0]);
      return true;
    }
    function runStep(id) {
      if (!flow) return;
      if (id == null || id === "") { endFlow(); return; }
      const step = flow.map[String(id)];
      if (!step) { endFlow(); return; }
      const type = step.type || "message";
      if (type === "choices") {
        if (step.text) addMessage(step.text, "bot");
        renderFlowChoices(step);
        return; // wait for the visitor to click a choice
      }
      if (type === "collect") {
        if (step.text) addMessage(step.text, "bot");
        flow.awaitingField = { field: step.field ? String(step.field) : "value", next: flowNextId(step) };
        setTimeout(() => { if (!input.disabled) input.focus(); }, 30);
        return; // the NEXT visitor message is captured as the answer
      }
      if (type === "handoff") {
        if (step.text) addMessage(step.text, "bot");
        requestHuman(); // reuse the existing request-a-human path
        const nx = flowNextId(step);
        if (nx) runStep(nx); else endFlow();
        return;
      }
      if (type === "end") {
        if (step.text) addMessage(step.text, "bot");
        endFlow();
        return;
      }
      // default: "message"
      if (step.text) addMessage(step.text, "bot");
      const nxt = flowNextId(step);
      if (nxt) runStep(nxt); else endFlow();
    }
    function renderFlowChoices(step) {
      const list = Array.isArray(step.choices) ? step.choices : [];
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex", flexWrap: "wrap", gap: "7px", alignSelf: "flex-start",
        maxWidth: "88%", marginLeft: "36px", marginTop: "-2px",
      });
      list.forEach((c) => {
        if (!c || c.label == null || String(c.label) === "") return;
        const label = String(c.label);
        const chip = makeChip(label, () => {
          if (!flow) return;
          if (row.parentNode) row.remove(); // a choice can only be taken once
          addMessage(label, "user"); // echo the picked label as a visitor bubble
          runStep(c.next != null && String(c.next) !== "" ? String(c.next) : null);
        });
        row.appendChild(chip);
      });
      if (!row.children.length) { const nx = flowNextId(step); if (nx) runStep(nx); else endFlow(); return; }
      messageArea.appendChild(row);
      scrollBottom();
    }

    /* ---------- send ---------- */
    const sendMessage = async () => {
      const text = input.value.trim();
      const atts = attachList.slice();
      if (text === "" && !atts.length) return;
      userInteracted = true;

      // ----- in-flow handling (bypasses normal AI streaming) -----
      if (flow) {
        // A `collect` step consumes the next visitor message as its answer.
        if (flow.awaitingField) {
          const cap = flow.awaitingField;
          flow.awaitingField = null;
          addMessage(text, "user", { attachments: atts });
          input.value = "";
          clearAttachments();
          if (text) flow.data[cap.field] = text;
          if (cap.next) runStep(cap.next); else endFlow();
          return;
        }
        // Otherwise the flow is waiting on a choice click — don't fall through
        // to the AI. Leave the visitor's draft in the box untouched.
        return;
      }

      if (!gatesSatisfied()) { maybeRenderGate(); return; }

      // ----- flow trigger: start a step flow INSTEAD of calling the AI -----
      const matchedFlow = findFlowForText(text);
      if (matchedFlow) {
        clearStarters();
        clearQuickReplies();
        lastQuestion = text;
        addMessage(text, "user", { attachments: atts });
        input.value = "";
        clearAttachments();
        startFlow(matchedFlow);
        return;
      }

      clearStarters();
      clearQuickReplies();
      lastQuestion = text;
      addMessage(text, "user", { attachments: atts });
      input.value = "";
      clearAttachments();

      let typing = null;
      if (!humanMode) { typing = makeTyping(); messageArea.appendChild(typing); scrollBottom(); }

      const firstTurn = !conversationId;
      const payloadObj = {
        botId, ownerId, message: text, conversationId, visitorId,
        visitor: buildVisitor(), attachments: atts, stream: true,
      };
      if (firstTurn) {
        if (cfg.consentEnabled && consentGiven) payloadObj.consent = true;
        if (cfg.preChatEnabled && prechatData) payloadObj.prechat = prechatData;
      }
      const body = JSON.stringify(payloadObj);

      try {
        const response = await fetch(chat_Url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const ct = (response.headers.get("Content-Type") || "").toLowerCase();

        // Streaming path (SSE)
        if (response.body && response.body.getReader && ct.indexOf("text/event-stream") !== -1) {
          await handleStream(response, typing, text);
          return;
        }

        // Fallback: legacy JSON path
        const data = await response.json();
        if (typing && typing.parentNode) messageArea.removeChild(typing);

        if (data && data.conversationId) {
          if (!conversationId) pollAfter = new Date().toISOString();
          conversationId = data.conversationId;
          saveThread();
          schedulePoll();
        }

        if (data && data.human) {
          humanMode = true;
          updateStatus();
          systemNote(t("msgSentAgent"));
        } else if (data && typeof data.reply === "string") {
          addMessage(data.reply, "bot");
          renderSources(data.sources);
          if (data.messageId) addFeedback(data.messageId);
          if (data.fallback) addEscalationForm(text);
          renderQuickReplies(data.suggestions);
          speak(data.reply);
          updateRateAffordance();
          updateSurveyAffordance();
        } else if (data && data.message) {
          addMessage(data.message, "bot");
        } else {
          addMessage(t("genError"), "bot");
        }
      } catch (error) {
        if (typing && typing.parentNode) messageArea.removeChild(typing);
        addMessage(t("connError"), "bot");
      }
    };

    humanEl.onclick = () => { requestHuman(); };

    /* ---------- language switcher ---------- */
    const LANG_NAMES = {
      en: "English", hi: "हिन्दी", bn: "বাংলা", ta: "தமிழ்", te: "తెలుగు",
      mr: "मराठी", gu: "ગુજરાતી", kn: "ಕನ್ನಡ", ml: "മലയാളം", or: "ଓଡ଼ିଆ",
      as: "অসমীয়া", pa: "ਪੰਜਾਬੀ",
    };
    let langMenuEl = null;
    function closeLangMenu() { if (langMenuEl && langMenuEl.parentNode) langMenuEl.remove(); langMenuEl = null; }
    function setLanguage(code) {
      if (!STRINGS[code]) return;
      cfg.language = code; visitorLang = code;
      try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
      closeLangMenu();
      applyConfig();
    }
    function toggleLangMenu() {
      if (langMenuEl) { closeLangMenu(); return; }
      const menu = document.createElement("div");
      Object.assign(menu.style, {
        position: "absolute", top: "48px", right: "12px", background: pal.boxBg,
        border: "1px solid " + pal.border, borderRadius: "12px",
        boxShadow: "0 12px 34px rgba(0,0,0,0.18)", padding: "6px", zIndex: "10",
        maxHeight: "260px", overflowY: "auto", minWidth: "150px",
        fontFamily: "'Inter', system-ui, sans-serif",
      });
      const cur = (cfg.language || "en").toLowerCase().split("-")[0];
      Object.keys(STRINGS).forEach((code) => {
        const item = document.createElement("div");
        item.textContent = (code === cur ? "✓ " : "") + (LANG_NAMES[code] || code);
        Object.assign(item.style, {
          padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
          color: code === cur ? cfg.primaryColor : pal.botText, fontWeight: code === cur ? "600" : "400",
        });
        item.onmouseover = () => { item.style.background = rgba(cfg.primaryColor, 0.08); };
        item.onmouseout = () => { item.style.background = "transparent"; };
        item.onclick = (e) => { e.stopPropagation(); setLanguage(code); };
        menu.appendChild(item);
      });
      langMenuEl = menu;
      const hdr = box.querySelector("#sk-header");
      if (hdr) hdr.appendChild(menu);
    }

    /* ---------- help center ---------- */
    let helpPanel = null, helpInput = null, helpResults = null, helpDebounce = null;
    function helpMsg(text) {
      if (!helpResults) return;
      helpResults.innerHTML = "";
      const d = document.createElement("div");
      d.textContent = text;
      Object.assign(d.style, { fontSize: "13px", color: pal.sysText, textAlign: "center", padding: "20px 10px" });
      helpResults.appendChild(d);
    }
    function renderHelpResults(results) {
      helpResults.innerHTML = "";
      if (!results.length) { helpMsg(t("helpEmpty")); return; }
      results.forEach((r) => {
        if (!r || !r.question) return;
        const item = document.createElement("div");
        Object.assign(item.style, { border: "1px solid " + pal.border, borderRadius: "12px", overflow: "hidden", background: pal.botBubble });
        const qrow = document.createElement("div");
        Object.assign(qrow.style, { padding: "11px 13px", fontSize: "13px", fontWeight: "600", color: pal.botText, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" });
        const qLabel = document.createElement("span");
        qLabel.textContent = r.question;
        const caret = document.createElement("span");
        caret.textContent = "▸";
        caret.style.color = pal.sysText; caret.style.flexShrink = "0";
        qrow.appendChild(qLabel); qrow.appendChild(caret);
        const ans = document.createElement("div");
        Object.assign(ans.style, { padding: "0 13px", display: "none", flexDirection: "column", gap: "8px", paddingBottom: "11px" });
        const ansTxt = document.createElement("div");
        ansTxt.innerHTML = renderRichHtml(r.answer || "");
        Object.assign(ansTxt.style, { fontSize: "12.5px", lineHeight: "1.5", color: pal.botText });
        const use = document.createElement("button");
        use.textContent = t("helpUse");
        Object.assign(use.style, { alignSelf: "flex-start", padding: "6px 12px", background: rgba(cfg.primaryColor, 0.1), color: cfg.primaryColor, border: "none", borderRadius: "10px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" });
        use.onclick = (e) => { e.stopPropagation(); toggleHelp(false); addMessage(r.answer || "", "bot"); };
        ans.appendChild(ansTxt); ans.appendChild(use);
        let open = false;
        qrow.onclick = () => { open = !open; ans.style.display = open ? "flex" : "none"; caret.textContent = open ? "▾" : "▸"; };
        item.appendChild(qrow); item.appendChild(ans);
        helpResults.appendChild(item);
      });
    }
    function runHelpSearch(q) {
      if (!helpResults) return;
      if (!q) { helpMsg(t("helpPrompt")); return; }
      helpMsg("…");
      const url = help_Url + "?botId=" + encodeURIComponent(botId || "") +
        "&ownerId=" + encodeURIComponent(ownerId || "") + "&q=" + encodeURIComponent(q);
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          if (!helpInput || helpInput.value.trim() !== q) return; // stale response
          renderHelpResults(data && Array.isArray(data.results) ? data.results : []);
        })
        .catch(() => { if (helpInput && helpInput.value.trim() === q) helpMsg(t("helpError")); });
    }
    function buildHelpPanel() {
      helpPanel = document.createElement("div");
      Object.assign(helpPanel.style, {
        position: "absolute", left: "0", right: "0", top: "70px", bottom: "0",
        background: pal.boxBg, display: "none", flexDirection: "column", zIndex: "6",
        fontFamily: "'Inter', system-ui, sans-serif",
      });
      const bar = document.createElement("div");
      Object.assign(bar.style, { padding: "12px 14px", display: "flex", gap: "8px", alignItems: "center", borderBottom: "1px solid " + pal.border });
      const back = document.createElement("button");
      back.textContent = "←";
      Object.assign(back.style, { border: "none", background: "transparent", cursor: "pointer", fontSize: "18px", color: pal.botText, padding: "4px 8px", lineHeight: "1" });
      back.setAttribute("title", t("helpBack"));
      back.onclick = () => toggleHelp(false);
      helpInput = document.createElement("input");
      helpInput.type = "text";
      Object.assign(helpInput.style, { flex: "1", padding: "10px 14px", border: "1.5px solid " + pal.inputBorder, borderRadius: "20px", fontSize: "13px", outline: "none", fontFamily: "inherit", background: pal.inputBg, color: pal.inputText });
      bar.appendChild(back); bar.appendChild(helpInput);
      helpResults = document.createElement("div");
      Object.assign(helpResults.style, { flex: "1", overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" });
      helpPanel.appendChild(bar); helpPanel.appendChild(helpResults);
      box.appendChild(helpPanel);
      helpInput.addEventListener("input", () => {
        if (helpDebounce) clearTimeout(helpDebounce);
        const val = helpInput.value.trim();
        helpDebounce = setTimeout(() => runHelpSearch(val), 300);
      });
    }
    function refreshHelpPanelTheme() {
      if (!helpPanel) return;
      helpPanel.style.background = pal.boxBg;
      if (helpInput) {
        helpInput.setAttribute("placeholder", t("helpSearchPlaceholder"));
        helpInput.style.background = pal.inputBg;
        helpInput.style.color = pal.inputText;
        helpInput.style.borderColor = pal.inputBorder;
      }
    }
    function toggleHelp(force) {
      if (!cfg.helpCenterEnabled) return;
      if (!helpPanel) buildHelpPanel();
      const show = force === undefined ? helpPanel.style.display === "none" : !!force;
      if (show) {
        closeLangMenu();
        refreshHelpPanelTheme();
        const hdr = box.querySelector("#sk-header");
        helpPanel.style.top = (hdr ? hdr.offsetHeight : 70) + "px";
        helpPanel.style.display = "flex";
        if (!helpInput.value.trim()) helpMsg(t("helpPrompt"));
        setTimeout(() => { try { helpInput.focus(); } catch (e) {} }, 50);
      } else {
        helpPanel.style.display = "none";
      }
    }

    /* ---------- in-chat survey ---------- */
    let surveyCardOpen = false;
    const surveyEl = document.createElement("span");
    surveyEl.textContent = t("surveyShare");
    Object.assign(surveyEl.style, { fontSize: "11px", color: pal.humanText, cursor: "pointer", fontWeight: "500", marginLeft: "14px", display: "none" });
    surveyEl.onclick = () => showSurvey();
    if (humanEl && humanEl.parentNode) humanEl.parentNode.appendChild(surveyEl);
    function surveyQuestionsList() {
      return Array.isArray(cfg.surveyQuestions)
        ? cfg.surveyQuestions.filter((q) => q != null && String(q).trim() !== "")
        : [];
    }
    function surveyDone() {
      try { return !!conversationId && localStorage.getItem(SURVEY_KEY) === conversationId; } catch (e) { return false; }
    }
    function markSurveyDone() {
      try { if (conversationId) localStorage.setItem(SURVEY_KEY, conversationId); } catch (e) {}
      updateSurveyAffordance();
    }
    function surveyEligible() {
      return !!cfg.surveyEnabled && surveyQuestionsList().length > 0 && !!conversationId && !surveyDone();
    }
    function updateSurveyAffordance() {
      if (!surveyEl) return;
      surveyEl.style.display = surveyEligible() ? "inline" : "none";
    }
    function showSurvey() {
      if (surveyCardOpen) return;
      const qs = surveyQuestionsList();
      if (!qs.length || !conversationId) return;
      surveyCardOpen = true;
      const answers = {};
      let step = 0;
      const card = document.createElement("div");
      Object.assign(card.style, {
        alignSelf: "center", maxWidth: "92%", width: "92%", boxSizing: "border-box",
        background: pal.escBg, border: "1px solid " + pal.escBorder, borderRadius: "16px",
        padding: "13px", display: "flex", flexDirection: "column", gap: "9px",
        boxShadow: pal.bubbleShadow, animation: "skAppear 0.32s ease both",
      });
      const intro = document.createElement("div");
      intro.textContent = t("surveyIntro");
      Object.assign(intro.style, { fontSize: "12.5px", color: pal.escText });
      const stepLbl = document.createElement("div");
      Object.assign(stepLbl.style, { fontSize: "11px", color: pal.sysText, fontWeight: "600" });
      const qText = document.createElement("div");
      Object.assign(qText.style, { fontSize: "13px", fontWeight: "600", color: pal.escText });
      const field = document.createElement("input");
      field.type = "text";
      field.setAttribute("placeholder", t("surveyPlaceholder"));
      Object.assign(field.style, { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1.5px solid " + pal.escBorder, borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", background: pal.inputBg, color: pal.escText });
      const btn = document.createElement("button");
      Object.assign(btn.style, { padding: "9px 16px", background: grad(), color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" });
      const paint = () => {
        stepLbl.textContent = t("surveyStep").replace("{n}", String(step + 1)).replace("{total}", String(qs.length));
        qText.textContent = String(qs[step]);
        field.value = answers[String(qs[step])] || "";
        btn.textContent = step === qs.length - 1 ? t("surveySubmit") : t("surveyNext");
        setTimeout(() => { try { field.focus(); } catch (e) {} }, 30);
      };
      const submitSurvey = () => {
        btn.disabled = true;
        const payload = { botId: botId || undefined, ownerId: ownerId || undefined, conversationId, visitorId, answers };
        fetch(survey_Url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .catch(() => {})
          .then(() => { card.innerHTML = '<div style="font-size:13px;color:#059669;font-weight:600;text-align:center">' + t("surveyThanks") + "</div>"; });
        markSurveyDone();
      };
      btn.onclick = () => {
        const v = (field.value || "").trim();
        if (v) answers[String(qs[step])] = v;
        if (step < qs.length - 1) { step++; paint(); }
        else submitSurvey();
      };
      field.onkeypress = (e) => { if (e.key === "Enter") btn.click(); };
      card.appendChild(intro); card.appendChild(stepLbl); card.appendChild(qText); card.appendChild(field); card.appendChild(btn);
      messageArea.appendChild(card);
      paint();
      scrollBottom();
    }

    /* ---------- proactive teaser ---------- */
    function hideTeaser() { teaser.style.display = "none"; }
    function showTeaser() {
      if (isOpen || !cfg.proactiveEnabled) return;
      try { if (sessionStorage.getItem(PROACTIVE_KEY)) return; } catch (e) {}
      const msg = cfg.proactiveMessage || greetMsg();
      teaser.innerHTML = "";
      teaser.style.background = pal.teaserBg;
      const txt = document.createElement("div");
      txt.textContent = msg;
      Object.assign(txt.style, { fontSize: "13px", lineHeight: "1.4", color: pal.teaserText });
      const x = document.createElement("span");
      x.textContent = "✕";
      Object.assign(x.style, { position: "absolute", top: "6px", right: "9px", fontSize: "11px", color: "#9ca3af", cursor: "pointer" });
      x.onclick = (e) => { e.stopPropagation(); hideTeaser(); };
      teaser.onclick = () => { hideTeaser(); toggleChat(true); };
      teaser.appendChild(txt);
      teaser.appendChild(x);
      teaser.style.display = "block";
      try { sessionStorage.setItem(PROACTIVE_KEY, "1"); } catch (e) {}
    }
    // Listener/timer handles we must tear down once the teaser fires (or the
    // widget is suppressed) so we never leak work or fire twice.
    const proactiveCleanups = [];
    function cleanupProactive() {
      while (proactiveCleanups.length) {
        const fn = proactiveCleanups.pop();
        try { fn(); } catch (e) {}
      }
    }
    function fireTeaser() {
      cleanupProactive();
      if (!isOpen) showTeaser();
    }
    function scheduleProactive() {
      if (!cfg.proactiveEnabled || proactiveScheduled) return;
      proactiveScheduled = true;
      try { if (sessionStorage.getItem(PROACTIVE_KEY)) return; } catch (e) {}
      const trigger = String(cfg.proactiveTrigger || "delay").toLowerCase();
      if (trigger === "scroll") {
        const pct = Math.max(0, Math.min(100, Number(cfg.proactiveScrollPercent) || 50));
        const onScroll = () => {
          const doc = document.documentElement, body = document.body;
          const top = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
          const max = (doc.scrollHeight || body.scrollHeight || 0) - window.innerHeight;
          const reached = max <= 0 ? 100 : (top / max) * 100;
          if (reached >= pct) fireTeaser();
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        proactiveCleanups.push(() => window.removeEventListener("scroll", onScroll));
        onScroll(); // in case the page is already scrolled past the threshold
      } else if (trigger === "exit") {
        const onExit = (e) => {
          const to = e.relatedTarget || e.toElement;
          if ((!to || (to.nodeName && to.nodeName.toUpperCase() === "HTML")) && e.clientY <= 0) {
            fireTeaser();
          }
        };
        document.addEventListener("mouseout", onExit);
        proactiveCleanups.push(() => document.removeEventListener("mouseout", onExit));
      } else {
        const delay = Math.max(0, Number(cfg.proactiveDelay) || 5) * 1000;
        const id = setTimeout(() => { if (!isOpen) showTeaser(); }, delay);
        proactiveCleanups.push(() => clearTimeout(id));
      }
    }

    /* ---------- toggle ---------- */
    const toggleChat = (show) => {
      if (show) {
        isOpen = true;
        userInteracted = true;
        hideTeaser();
        cleanupProactive();
        setUnread(0);
        stopFlashTitle();
        box.style.display = "flex";
        setTimeout(() => { box.style.opacity = "1"; box.style.transform = "translateY(0) scale(1)"; }, 10);
        if (!greeted) {
          greeted = true;
          if (transcript.length) { renderTranscript(); }
          else { addMessage(openingGreeting(), "bot", { record: false }); renderStarters(); }
        }
        maybeRenderGate();
        updateRateAffordance();
        updateSurveyAffordance();
        schedulePoll();
        setTimeout(() => { if (!input.disabled) input.focus(); }, 300);
      } else {
        closeLangMenu();
        isOpen = false;
        box.style.opacity = "0";
        box.style.transform = "translateY(20px) scale(0.98)";
        setTimeout(() => (box.style.display = "none"), 280);
        schedulePoll(); // keep lightweight polling while closed
      }
    };

    button.onclick = () => toggleChat(box.style.display === "none");
    box.querySelector("#chat-close").onclick = () => {
      // offer a one-time CSAT prompt before closing
      if (csatEligible() && !csatCardOpen) { showCsat(); return; }
      toggleChat(false);
    };
    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === "Enter") sendMessage(); };

    // Page-level listeners / timers are tracked so suppressWidget() can tear
    // them down on an excluded page (otherwise a persisted conversation could
    // still poll → beep/title-flash after the widget is removed).
    let schemeMq = null, onScheme = null;

    // Close the language menu on any outside click/tap.
    const onDocClick = (e) => {
      if (!langMenuEl) return;
      if (langBtn && (e.target === langBtn || langBtn.contains(e.target))) return;
      if (langMenuEl.contains(e.target)) return;
      closeLangMenu();
    };
    document.addEventListener("click", onDocClick);

    // Resume polling / status when tab becomes visible again
    const onVisibilityChange = () => {
      if (!document.hidden && conversationId) { pollOnce(); updateStatus(); }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Keep online/offline status fresh across scheduled boundaries
    const statusInterval = setInterval(updateStatus, 60000);

    // Auto theme: react to OS scheme changes
    try {
      if (window.matchMedia) {
        schemeMq = window.matchMedia("(prefers-color-scheme: dark)");
        onScheme = () => { if ((cfg.theme || "").toLowerCase() === "auto") applyConfig(); };
        if (schemeMq.addEventListener) schemeMq.addEventListener("change", onScheme);
        else if (schemeMq.addListener) schemeMq.addListener(onScheme);
      }
    } catch (e) {}

    // ---------- per-page targeting: reveal / tear down ----------
    let suppressed = false;
    function revealLauncher() {
      if (suppressed) return;
      button.style.display = "flex";
    }
    // Clean no-op when targeting says this page is excluded: remove the injected
    // nodes and stop any background work.
    function suppressWidget() {
      suppressed = true;
      try { stopPolling(); } catch (e) {}
      try { stopFlashTitle(); } catch (e) {}
      try { cleanupProactive(); } catch (e) {}
      // Remove the page/document/matchMedia/global listeners and timers added
      // during setup so nothing keeps running on an excluded page.
      try { clearInterval(statusInterval); } catch (e) {}
      try { document.removeEventListener("click", onDocClick); } catch (e) {}
      try { document.removeEventListener("visibilitychange", onVisibilityChange); } catch (e) {}
      try {
        if (schemeMq && onScheme) {
          if (schemeMq.removeEventListener) schemeMq.removeEventListener("change", onScheme);
          else if (schemeMq.removeListener) schemeMq.removeListener(onScheme);
        }
      } catch (e) {}
      [button, teaser, box, fileInput].forEach(function (el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    }

    // A visitor-chosen UI language (persisted) overrides the configured default.
    if (visitorLang && STRINGS[visitorLang]) cfg.language = visitorLang;

    // Initial paint (defaults). The launcher stays hidden until the per-page
    // targeting decision resolves (below), so it never flashes on an excluded
    // page. Polling only starts once we know the page is allowed.
    applyConfig();

    // Fetch owner-built step flows (non-fatal — no flows on error).
    try {
      fetch(flow_Url + "?botId=" + encodeURIComponent(botId || "") + "&ownerId=" + encodeURIComponent(ownerId || ""), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.flows)) {
            flows = data.flows.filter((f) => f && Array.isArray(f.steps) && f.steps.length);
          }
        })
        .catch(() => {});
    } catch (e) {}

    fetch(config_Url + "&t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.appearance) {
          cfg = Object.assign(cfg, data.appearance, { starters: data.starters || [] });
          // Force-remove the TTS + language-switcher controls regardless of the
          // owner's saved config (the bot still answers in the visitor's language).
          if (!TTS_ENABLED) cfg.ttsEnabled = false;
          if (!LANG_SWITCHER_ENABLED) cfg.languageSwitcher = false;
          // Re-assert the visitor's own language choice over the config default.
          if (visitorLang && STRINGS[visitorLang]) cfg.language = visitorLang;
          applyConfig();
        }
        if (!pageAllowed()) { suppressWidget(); return; }
        revealLauncher();
        // Restore persisted conversation into the (hidden) panel so a refresh continues it.
        if (transcript.length && !greeted) { greeted = true; renderTranscript(); }
        if (conversationId) schedulePoll();
        if (isOpen) { maybeRenderGate(); updateRateAffordance(); updateSurveyAffordance(); }
        scheduleProactive();
      })
      .catch(() => {
        // No config → defaults (empty pagePaths) mean "always show".
        if (!pageAllowed()) { suppressWidget(); return; }
        revealLauncher();
        if (transcript.length && !greeted) { greeted = true; renderTranscript(); }
        if (conversationId) schedulePoll();
        scheduleProactive();
      });
  }

  // ---------- robustness: ensure document.body exists before building ----------
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
