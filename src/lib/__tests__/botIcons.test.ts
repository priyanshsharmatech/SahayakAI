import { describe, it, expect } from "vitest";
import {
  BOT_ICON_KEYS,
  BOT_ICON_LABELS,
  LAUNCHER_SHAPES,
  LAUNCHER_SHAPE_LABELS,
  LAUNCHER_SHAPE_RADIUS,
  BOT_PRESETS,
} from "@/lib/botIcons";

describe("bot icon keys and labels", () => {
  it("has a non-empty, unique set of icon keys", () => {
    expect(BOT_ICON_KEYS.length).toBeGreaterThan(0);
    expect(new Set(BOT_ICON_KEYS).size).toBe(BOT_ICON_KEYS.length);
  });

  it("every icon key has exactly one label and vice versa", () => {
    const labelKeys = Object.keys(BOT_ICON_LABELS);
    expect(labelKeys.sort()).toEqual([...BOT_ICON_KEYS].sort());
    for (const k of BOT_ICON_KEYS) {
      expect(typeof BOT_ICON_LABELS[k]).toBe("string");
      expect(BOT_ICON_LABELS[k].length).toBeGreaterThan(0);
    }
  });
});

describe("launcher shapes", () => {
  it("has a non-empty, unique set of shapes", () => {
    expect(LAUNCHER_SHAPES.length).toBeGreaterThan(0);
    expect(new Set(LAUNCHER_SHAPES).size).toBe(LAUNCHER_SHAPES.length);
  });

  it("every shape has a label and a radius entry", () => {
    for (const s of LAUNCHER_SHAPES) {
      expect(typeof LAUNCHER_SHAPE_LABELS[s]).toBe("string");
      expect(LAUNCHER_SHAPE_LABELS[s].length).toBeGreaterThan(0);
      expect(typeof LAUNCHER_SHAPE_RADIUS[s]).toBe("string");
      expect(LAUNCHER_SHAPE_RADIUS[s].length).toBeGreaterThan(0);
    }
  });

  it("radius and label maps have no extra keys", () => {
    expect(Object.keys(LAUNCHER_SHAPE_RADIUS).sort()).toEqual(
      [...LAUNCHER_SHAPES].sort(),
    );
    expect(Object.keys(LAUNCHER_SHAPE_LABELS).sort()).toEqual(
      [...LAUNCHER_SHAPES].sort(),
    );
  });
});

describe("BOT_PRESETS", () => {
  it("is non-empty with unique keys", () => {
    expect(BOT_PRESETS.length).toBeGreaterThan(0);
    const keys = BOT_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("references only valid icon keys and shapes", () => {
    for (const p of BOT_PRESETS) {
      expect(BOT_ICON_KEYS).toContain(p.launcherIconKey);
      expect(BOT_ICON_KEYS).toContain(p.avatarIconKey);
      expect(LAUNCHER_SHAPES).toContain(p.launcherShape);
      expect(p.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});
