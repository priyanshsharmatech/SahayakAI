"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Fully custom dropdown (not a native <select>), so the open menu is branded:
 * rounded popover, hover states, a check on the selected item, and animation.
 */
export function Dropdown({
  value,
  options,
  onChange,
  compact = false,
  leftIcon,
  placeholder = "Select…",
  align = "left",
  className = "",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  compact?: boolean;
  leftIcon?: React.ReactNode;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const trigger = compact
    ? "flex items-center gap-2 w-full text-sm text-zinc-800 dark:text-zinc-100 bg-transparent"
    : "flex items-center justify-between gap-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-800 hover:border-zinc-300 transition dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-600";

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${trigger} cursor-pointer outline-none focus:ring-4 focus:ring-black/5 ${
          !compact ? "focus:border-black" : ""
        }`}
      >
        {leftIcon && <span className="text-zinc-400 shrink-0">{leftIcon}</span>}
        <span className="truncate flex-1 text-left">
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-zinc-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute z-50 mt-2 min-w-[200px] w-full max-h-64 overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-xl p-1 dark:bg-zinc-900 dark:border-zinc-800 ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer ${
                    selected
                      ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {selected && <Check size={15} className="shrink-0 text-black dark:text-white" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
