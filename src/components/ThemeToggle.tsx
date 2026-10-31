"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sun, Moon, Monitor, ChevronDown, Check } from "lucide-react";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.setAttribute("data-theme", dark ? "dark" : "light");
}

/**
 * Apply the theme with an animated angled-wipe via the View Transitions API.
 * Falls back to an instant swap where the API is unavailable or the user
 * prefers reduced motion. The actual animation is defined in globals.css
 * (::view-transition-* rules + the `angled-in` keyframe).
 */
function applyThemeAnimated(theme: Theme) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduceMotion) {
    applyTheme(theme);
    return;
  }
  doc.startViewTransition(() => applyTheme(theme));
}

const OPTIONS: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: "light", icon: <Sun size={15} />, label: "Light" },
  { value: "dark", icon: <Moon size={15} />, label: "Dark" },
  { value: "system", icon: <Monitor size={15} />, label: "System" },
];

export default function ThemeToggle({ className = "" }: { className?: string }) {
  // Default is "system"; the real value is read from storage after mount.
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = () => {
      const stored = (localStorage.getItem("theme") as Theme) || "system";
      setTheme(stored);
      setMounted(true);
    };
    init();
  }, []);

  // Re-apply automatically when the OS theme changes while on "system".
  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") applyThemeAnimated("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, mounted]);

  // Close on outside click / Escape.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const choose = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
    applyThemeAnimated(value);
    setOpen(false);
  };

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        suppressHydrationWarning
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition shadow-sm cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        <span className="text-zinc-500 dark:text-zinc-400">{current.icon}</span>
        <span className="hidden sm:inline">{mounted ? current.label : "Theme"}</span>
        <ChevronDown
          size={14}
          className={`text-zinc-400 dark:text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            role="menu"
            className="absolute right-0 mt-2 w-40 bg-white border border-zinc-200 rounded-xl shadow-xl p-1 z-50 dark:bg-zinc-900 dark:border-zinc-800"
          >
            {OPTIONS.map((o) => {
              const active = mounted && theme === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  suppressHydrationWarning
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => choose(o.value)}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer ${
                    active
                      ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="text-zinc-500 dark:text-zinc-400">{o.icon}</span>
                  <span className="flex-1">{o.label}</span>
                  {active && <Check size={15} className="text-black dark:text-white" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
