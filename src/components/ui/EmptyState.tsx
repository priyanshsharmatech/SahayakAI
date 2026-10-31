"use client";
import React from "react";

/**
 * Friendly empty-state block: an illustration/icon, a title, an optional hint
 * line, and an optional action (usually a button). Reused for "no bots yet",
 * empty inbox, no canned responses, no team members, no knowledge sources, etc.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  compact = false,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 ${compact ? "py-8" : "py-12"} ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{title}</h3>
      {hint && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-sm leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
