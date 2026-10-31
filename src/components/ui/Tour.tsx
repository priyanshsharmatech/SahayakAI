"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface TourStep {
  /** CSS selector for the element to highlight. If not found, the step is centered. */
  selector: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Lightweight, dependency-free first-run product tour. Highlights a sequence of
 * elements with a spotlight + positioned tooltip. Shown once (tracked in
 * localStorage under `storageKey`) and fully skippable. No-ops on the server.
 */
export function Tour({
  steps,
  storageKey,
  onDone,
}: {
  steps: TourStep[];
  storageKey: string;
  onDone?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Decide on mount whether to run (client-only to avoid hydration mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      if (window.localStorage.getItem(storageKey) !== "1") setActive(true);
    } catch {
      setActive(true);
    }
  }, [storageKey]);

  const finish = useCallback(() => {
    setActive(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    onDone?.();
  }, [storageKey, onDone]);

  const step = steps[i];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    // Treat missing or hidden (e.g. the sidebar on mobile) targets as "no target"
    // so the tooltip simply centers instead of highlighting a zero-size box.
    if (!el || (el.getBoundingClientRect().width === 0 && el.getBoundingClientRect().height === 0)) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Measure after any scroll settles.
    const t = setTimeout(measure, 120);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step, measure]);

  // Keyboard controls.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (i >= steps.length - 1) finish();
        else setI((n) => n + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setI((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, i, steps.length, finish]);

  if (!mounted || !active || !step) return null;

  const pad = 6;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  // Tooltip placement: below the target when there's room, else above, else centered.
  const tipWidth = Math.min(320, vw - 24);
  let tipTop: number;
  let tipLeft: number;
  if (rect) {
    const below = rect.top + rect.height + 14;
    const spaceBelow = vh - (rect.top + rect.height);
    tipTop = spaceBelow > 180 ? below : Math.max(12, rect.top - 170);
    tipLeft = Math.min(Math.max(12, rect.left), vw - tipWidth - 12);
  } else {
    tipTop = vh / 2 - 90;
    tipLeft = vw / 2 - tipWidth / 2;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Dim background. When a target exists we use a spotlight ring instead of
          a full dark layer so the highlighted element stays visible. */}
      {rect ? (
        <div
          className="absolute rounded-xl transition-all duration-200 pointer-events-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            outline: "2px solid rgba(255,255,255,0.9)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* Click-catcher to advance by clicking the dim area. */}
      <button
        type="button"
        aria-label="Next tour step"
        onClick={() => (i >= steps.length - 1 ? finish() : setI((n) => n + 1))}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />

      <div
        className="absolute rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl p-4"
        style={{ top: tipTop, left: tipLeft, width: tipWidth }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{step.title}</h4>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip tour"
            title="Skip tour"
            className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-3">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" aria-hidden="true">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === i ? "w-4 bg-black dark:bg-white" : "w-1.5 bg-zinc-300 dark:bg-zinc-600"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={finish}
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-2 py-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-black/10 cursor-pointer"
            >
              Skip
            </button>
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI((n) => Math.max(0, n - 1))}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (i >= steps.length - 1 ? finish() : setI((n) => n + 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-zinc-900 outline-none focus-visible:ring-4 focus-visible:ring-black/20 cursor-pointer"
            >
              {i >= steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
