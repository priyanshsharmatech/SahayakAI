/**
 * Ready-made bot starting points by industry. The dashboard offers these when
 * creating a bot; each seeds sensible starters, tone, welcome text, and a
 * knowledge skeleton the owner then fills in. Pure data — no secrets.
 */
export interface BotTemplate {
  key: string;
  name: string;
  description: string;
  emoji: string;
  tone: "friendly" | "professional" | "concise" | "playful";
  welcomeMessage: string;
  starters: string[];
  knowledge: string;
}

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    key: "blank",
    name: "Blank",
    description: "Start from scratch.",
    emoji: "📄",
    tone: "friendly",
    welcomeMessage: "Hi! How can I help you today?",
    starters: [],
    knowledge: "",
  },
  {
    key: "clinic",
    name: "Clinic / Healthcare",
    description: "Appointments, hours, services.",
    emoji: "🏥",
    tone: "professional",
    welcomeMessage: "Hello! How can we help with your health needs today?",
    starters: [
      "What are your clinic hours?",
      "How do I book an appointment?",
      "Which doctors are available?",
      "Do you accept insurance?",
    ],
    knowledge:
      "CLINIC HOURS:\n(e.g. Mon–Sat 9am–7pm)\n\nSERVICES:\n(list consultations, tests, specialties)\n\nAPPOINTMENTS:\n(how to book, cancellation policy)\n\nINSURANCE & PAYMENTS:\n(accepted insurers, payment methods)\n\nLOCATION & CONTACT:\n(address, phone, parking)",
  },
  {
    key: "store",
    name: "Store / E-commerce",
    description: "Orders, shipping, returns.",
    emoji: "🛍️",
    tone: "friendly",
    welcomeMessage: "Hey there! Looking for something or need help with an order?",
    starters: [
      "Where is my order?",
      "What is your return policy?",
      "Do you ship internationally?",
      "How do I track my package?",
    ],
    knowledge:
      "PRODUCTS:\n(categories, bestsellers)\n\nSHIPPING:\n(regions, times, costs, free-shipping threshold)\n\nRETURNS & REFUNDS:\n(window, condition, process)\n\nORDER TRACKING:\n(how to track, where to find the number)\n\nPAYMENTS:\n(accepted methods, COD?)",
  },
  {
    key: "coaching",
    name: "Coaching / Education",
    description: "Courses, fees, enrollment.",
    emoji: "🎓",
    tone: "friendly",
    welcomeMessage: "Hi! Want to know about our courses and batches?",
    starters: [
      "What courses do you offer?",
      "What are the fees?",
      "When do new batches start?",
      "Do you offer online classes?",
    ],
    knowledge:
      "COURSES:\n(list programs, levels, duration)\n\nFEES & DISCOUNTS:\n(fee per course, installments, scholarships)\n\nBATCHES & SCHEDULE:\n(start dates, timings, online/offline)\n\nENROLLMENT:\n(how to join, documents, demo class)\n\nFACULTY & RESULTS:\n(highlights)",
  },
  {
    key: "restaurant",
    name: "Restaurant / Food",
    description: "Menu, reservations, delivery.",
    emoji: "🍽️",
    tone: "playful",
    welcomeMessage: "Hungry? Ask me about our menu, timings, or reservations!",
    starters: [
      "What's on the menu?",
      "Can I book a table?",
      "Do you do delivery?",
      "What are your timings?",
    ],
    knowledge:
      "MENU:\n(popular dishes, veg/non-veg, specials)\n\nTIMINGS:\n(open hours, days closed)\n\nRESERVATIONS:\n(how to book, group size)\n\nDELIVERY & TAKEAWAY:\n(areas, platforms, min order)\n\nLOCATION:\n(address, contact)",
  },
  {
    key: "realestate",
    name: "Real Estate",
    description: "Listings, visits, pricing.",
    emoji: "🏠",
    tone: "professional",
    welcomeMessage: "Hello! Looking to buy, rent, or just exploring options?",
    starters: [
      "What properties are available?",
      "Can I schedule a site visit?",
      "What are the price ranges?",
      "Do you handle rentals?",
    ],
    knowledge:
      "LISTINGS:\n(types, locations, BHK, price range)\n\nSITE VISITS:\n(how to schedule)\n\nPRICING & PAYMENT:\n(price bands, loan assistance)\n\nRENTALS:\n(available, deposit, terms)\n\nCONTACT:\n(agent details)",
  },
  {
    key: "saas",
    name: "SaaS / Software",
    description: "Features, pricing, support.",
    emoji: "💻",
    tone: "professional",
    welcomeMessage: "Hi! Questions about features, pricing, or your account?",
    starters: [
      "What does your product do?",
      "How much does it cost?",
      "Do you offer a free trial?",
      "How do I get support?",
    ],
    knowledge:
      "PRODUCT:\n(what it does, key features)\n\nPRICING:\n(plans, limits, billing)\n\nTRIAL & ONBOARDING:\n(free trial, setup)\n\nINTEGRATIONS:\n(list)\n\nSUPPORT:\n(channels, SLAs, docs)",
  },
];
