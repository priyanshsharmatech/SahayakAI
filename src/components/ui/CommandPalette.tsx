"use client";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, CornerDownLeft, Bot as BotIcon, MessagesSquare } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: React.ReactNode;
  keywords?: string;
  onRun: () => void;
}

interface SearchBot {
  _id: string;
  name: string;
}
interface SearchConversation {
  _id: string;
  visitorName?: string;
  visitorEmail?: string;
  lastMessage?: string;
  updatedAt?: string;
  botId: string | null;
}

/** One selectable row in the flattened list. */
interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

/**
 * Ctrl/Cmd+K command palette. Lists static quick actions (filtered client-side)
 * and live search results from `GET /api/client/search?q=` →
 * `{ bots:[{_id,name}], conversations:[{_id,visitorName,visitorEmail,lastMessage,updatedAt,botId}] }`.
 * Full keyboard support (↑/↓/Enter/Esc) with a focus trap. Degrades gracefully
 * if the search request fails — static actions and local bots still work.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
  bots,
  onSelectBot,
  onSelectConversation,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  bots: { _id: string; name: string }[];
  onSelectBot: (botId: string) => void;
  onSelectConversation: (c: { _id: string; botId: string | null }) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [remoteBots, setRemoteBots] = useState<SearchBot[]>([]);
  const [remoteConvos, setRemoteConvos] = useState<SearchConversation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset transient state each time the palette opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
      setActive(0);
      setRemoteBots([]);
      setRemoteConvos([]);
      setSearchFailed(false);
      // Focus the input on the next frame so the portal is mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced remote search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemoteBots([]);
      setRemoteConvos([]);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/client/search?q=${encodeURIComponent(term)}`);
        if (!alive) return;
        setRemoteBots(res.data.bots || []);
        setRemoteConvos(res.data.conversations || []);
        setSearchFailed(false);
      } catch {
        if (!alive) return;
        setRemoteBots([]);
        setRemoteConvos([]);
        setSearchFailed(true);
      } finally {
        if (alive) setSearching(false);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  const convoLabel = (c: SearchConversation) =>
    c.visitorName || c.visitorEmail || `Visitor ${c._id.slice(0, 6)}`;

  // Build the flattened, filtered item list.
  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const out: Item[] = [];

    // Static commands (client-side filtered).
    commands
      .filter((c) => {
        if (!term) return true;
        return (c.label + " " + (c.keywords || "")).toLowerCase().includes(term);
      })
      .forEach((c) =>
        out.push({
          id: c.id,
          group: c.group,
          label: c.label,
          hint: c.hint,
          icon: c.icon,
          run: c.onRun,
        }),
      );

    // Bots: local list (filtered) merged with remote hits, deduped by id.
    const seenBots = new Set<string>();
    const localBots = bots.filter((b) => (term ? b.name.toLowerCase().includes(term) : true));
    const mergedBots = [
      ...localBots,
      ...remoteBots.filter((b) => !localBots.some((lb) => lb._id === b._id)),
    ];
    mergedBots.forEach((b) => {
      if (seenBots.has(b._id)) return;
      seenBots.add(b._id);
      out.push({
        id: `bot:${b._id}`,
        group: "Bots",
        label: b.name || "Untitled bot",
        icon: <BotIcon size={16} />,
        run: () => onSelectBot(b._id),
      });
    });

    // Conversations: remote only (require a query).
    remoteConvos.forEach((c) => {
      out.push({
        id: `conv:${c._id}`,
        group: "Conversations",
        label: convoLabel(c),
        hint: c.lastMessage,
        icon: <MessagesSquare size={16} />,
        run: () => onSelectConversation({ _id: c._id, botId: c.botId }),
      });
    });

    return out;
  }, [q, commands, bots, remoteBots, remoteConvos, onSelectBot, onSelectConversation]);

  // Keep the active index in range when the list changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive((a) => (items.length ? Math.min(a, items.length - 1) : 0));
  }, [items.length]);

  // Scroll the active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runActive = () => {
    const it = items[active];
    if (it) {
      it.run();
      onClose();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runActive();
    } else if (e.key === "Tab") {
      // Focus trap — keep focus inside the panel.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Render rows with group headers.
  let lastGroup = "";
  let idx = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-start justify-center p-4 sm:pt-28 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800">
          <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search actions, bots, conversations…"
            aria-label="Search actions, bots and conversations"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder-zinc-400 dark:text-zinc-100"
          />
          {searching && (
            <span
              className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-200 rounded-full animate-spin shrink-0"
              aria-hidden="true"
            />
          )}
          <kbd className="hidden sm:inline-flex items-center justify-center leading-none h-5 px-1.5 text-[10px] font-semibold text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded shrink-0">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {searching ? "Searching…" : "No matches."}
            </div>
          ) : (
            items.map((it) => {
              idx += 1;
              const thisIdx = idx;
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              const isActive = thisIdx === active;
              return (
                <div key={it.id}>
                  {header && (
                    <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {header}
                    </div>
                  )}
                  <button
                    type="button"
                    data-idx={thisIdx}
                    role="option"
                    aria-selected={isActive}
                    onMouseMove={() => setActive(thisIdx)}
                    onClick={() => {
                      it.run();
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg text-sm transition cursor-pointer outline-none ${
                      isActive
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    {it.icon && <span className="text-zinc-400 shrink-0">{it.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-zinc-700 dark:text-zinc-200">
                        {it.label}
                      </span>
                      {it.hint && (
                        <span className="block truncate text-xs text-zinc-400 dark:text-zinc-500">
                          {it.hint}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <CornerDownLeft size={14} className="text-zinc-400 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })
          )}
          {searchFailed && (
            <div className="px-3 py-2 text-center text-xs text-amber-600 dark:text-amber-400">
              Search is unavailable right now — showing quick actions only.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
