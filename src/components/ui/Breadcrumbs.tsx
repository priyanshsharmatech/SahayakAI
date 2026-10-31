"use client";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  /** If provided (and not the last crumb), the label renders as a clickable button. */
  onClick?: () => void;
}

/**
 * Compact breadcrumb trail, e.g. "Dashboard › {Bot name} › {Tab}". The final
 * crumb is rendered as the current page.
 */
export function Breadcrumbs({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 flex-wrap">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1 min-w-0">
              {c.onClick && !last ? (
                <button
                  type="button"
                  onClick={c.onClick}
                  className="truncate max-w-[180px] rounded hover:text-zinc-700 dark:hover:text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 transition cursor-pointer"
                >
                  {c.label}
                </button>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={`truncate max-w-[180px] ${last ? "font-semibold text-zinc-600 dark:text-zinc-300" : ""}`}
                >
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight size={13} className="shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
