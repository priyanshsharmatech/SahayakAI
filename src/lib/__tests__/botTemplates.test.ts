import { describe, it, expect } from "vitest";
import { BOT_TEMPLATES, type BotTemplate } from "@/lib/botTemplates";

const TONES = ["friendly", "professional", "concise", "playful"];

describe("BOT_TEMPLATES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(BOT_TEMPLATES)).toBe(true);
    expect(BOT_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('includes a "blank" starting template', () => {
    const blank = BOT_TEMPLATES.find((t) => t.key === "blank");
    expect(blank).toBeDefined();
    expect(blank?.starters).toEqual([]);
  });

  it("has unique keys", () => {
    const keys = BOT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every template has all required fields with valid types", () => {
    for (const t of BOT_TEMPLATES as BotTemplate[]) {
      expect(typeof t.key).toBe("string");
      expect(t.key.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(typeof t.emoji).toBe("string");
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(TONES).toContain(t.tone);
      expect(typeof t.welcomeMessage).toBe("string");
      expect(t.welcomeMessage.length).toBeGreaterThan(0);
      expect(Array.isArray(t.starters)).toBe(true);
      expect(t.starters.every((s) => typeof s === "string")).toBe(true);
      expect(typeof t.knowledge).toBe("string");
    }
  });

  it("non-blank templates ship with starter questions", () => {
    for (const t of BOT_TEMPLATES) {
      if (t.key === "blank") continue;
      expect(t.starters.length).toBeGreaterThan(0);
    }
  });
});
