"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, X, Rocket, ArrowRight } from "lucide-react";

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
  /** Optional steps don't count toward "all required done" auto-hide. */
  optional?: boolean;
}

/**
 * Dismissible getting-started checklist shown at the top of the Overview tab.
 * Steps are derived from real bot data by the caller. The whole card hides once
 * every required step is complete, or once the owner dismisses it (remembered
 * in localStorage under `storageKey`).
 */
export function OnboardingChecklist({
  storageKey,
  steps,
}: {
  storageKey: string;
  steps: OnboardingStep[];
}) {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1",
  );

  const requiredDone = steps.filter((s) => !s.optional).every((s) => s.done);
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || requiredDone) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  };

  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 shrink-0">
            <Rocket size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold leading-tight">Get your bot live</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {doneCount} of {steps.length} done · {pct}%
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting-started checklist"
          title="Dismiss"
          className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 cursor-pointer transition"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-4">
        <motion.div
          className="h-full rounded-full bg-black dark:bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
          >
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-full border shrink-0 ${
                s.done
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "border-zinc-300 dark:border-zinc-600 text-transparent"
              }`}
              aria-hidden="true"
            >
              <Check size={12} strokeWidth={3} />
            </span>
            <span
              className={`flex-1 text-sm min-w-0 truncate ${
                s.done
                  ? "text-zinc-400 dark:text-zinc-500 line-through"
                  : "text-zinc-700 dark:text-zinc-200 font-medium"
              }`}
            >
              {s.label}
              {s.optional && !s.done && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 dark:text-zinc-600">
                  Optional
                </span>
              )}
            </span>
            {!s.done && (
              <button
                type="button"
                onClick={s.onAction}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 focus-visible:border-black transition cursor-pointer"
              >
                {s.actionLabel}
                <ArrowRight size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
