"use client";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Consistent inline error with an optional Retry button. Used in place of the
 * bare red text / silent console.error catches across the dashboard panels so
 * nothing can get stuck on a permanent spinner.
 */
export function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
  retrying = false,
  compact = false,
  className = "",
}: {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center px-4 ${compact ? "py-6" : "py-10"} ${className}`}
    >
      <div className="w-11 h-11 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 mb-3">
        <AlertTriangle size={20} />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3 max-w-xs">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 focus-visible:border-black transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={retrying ? "animate-spin" : ""} />
          {retrying ? "Retrying…" : "Try again"}
        </button>
      )}
    </div>
  );
}
