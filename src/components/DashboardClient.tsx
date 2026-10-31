"use client";
import axios from "axios";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  ShieldCheck,
  LayoutDashboard,
  Inbox as InboxIcon,
  SlidersHorizontal,
  Copy,
  CopyCheck,
  Save,
  MessageCircle,
  MessagesSquare,
  Calendar,
  HelpCircle,
  ThumbsUp,
  Send,
  Bot as BotIcon,
  Headphones,
  Sparkles,
  Smile,
  Zap,
  Check,
  Heart,
  Star,
  Bell,
  Phone,
  Mail,
  LifeBuoy,
  Rocket,
  Flame,
  Hand,
  Ghost,
  ChevronDown,
  Upload,
  Image as ImageIcon,
  Users,
  Clock,
  Search,
  Globe,
  Download,
  FileText,
  Link2,
  X,
  Tag as TagIcon,
  Volume2,
  SmilePlus,
  Gauge,
  BellOff,
  ShieldAlert,
  LogOut,
  UserCog,
  StickyNote,
  RefreshCw,
  Trash2,
  Lock,
  AlertTriangle,
  MessageSquareQuote,
  Menu,
  FlaskConical,
  CheckCircle2,
  Activity,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  FolderInput,
  Workflow,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { Dropdown } from "./Dropdown";
import ThemeToggle from "@/components/ThemeToggle";
import TrainedAnswers from "@/components/TrainedAnswers";
import Logo from "@/components/Logo";
import { Skeleton, SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { OnboardingChecklist, type OnboardingStep } from "@/components/ui/OnboardingChecklist";
import { Tour } from "@/components/ui/Tour";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import {
  BOT_ICON_KEYS,
  BOT_ICON_LABELS,
  BOT_PRESETS,
  LAUNCHER_SHAPES,
  LAUNCHER_SHAPE_LABELS,
  LAUNCHER_SHAPE_RADIUS,
  type BotIconKey,
  type LauncherShape,
} from "@/lib/botIcons";
import { BOT_TEMPLATES, type BotTemplate } from "@/lib/botTemplates";

/** Maps each built-in icon key to its lucide-react component for the dashboard. */
const ICON_COMPONENTS: Record<BotIconKey, React.ComponentType<{ size?: number }>> = {
  chat: MessageCircle,
  message: MessagesSquare,
  bot: BotIcon,
  headset: Headphones,
  sparkles: Sparkles,
  help: HelpCircle,
  smile: Smile,
  zap: Zap,
  heart: Heart,
  star: Star,
  bell: Bell,
  phone: Phone,
  mail: Mail,
  lifebuoy: LifeBuoy,
  rocket: Rocket,
  flame: Flame,
  hand: Hand,
  ghost: Ghost,
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

interface Bot {
  _id: string;
  name: string;
  businessName: string;
  supportEmail: string;
  knowledge: string;
  isActive: boolean;
  isDefault: boolean;
  tone: "friendly" | "professional" | "concise" | "playful";
  starters: string[];
  avatarPublicId: string;
  appearance: {
    primaryColor: string;
    position: "right" | "left";
    launcherShape: LauncherShape;
    launcherIcon: string;
    launcherIconKey: string;
    avatarIconKey: string;
    offsetBottom: number;
    offsetSide: number;
    botName: string;
    avatarUrl: string;
    welcomeMessage: string;
    theme: "light" | "dark" | "auto";
    language: string;
    proactiveEnabled: boolean;
    proactiveMessage: string;
    proactiveDelay: number;
    proactiveTrigger: "delay" | "scroll" | "exit";
    proactiveScrollPercent: number;
    helpCenterEnabled: boolean;
    surveyEnabled: boolean;
    surveyQuestions: string[];
    languageSwitcher: boolean;
    availabilityEnabled: boolean;
    availabilityTimezone: string;
    availabilityDays: number[];
    availabilityStart: string;
    availabilityEnd: string;
    offlineMessage: string;
    showCitations?: boolean;
    voiceInput?: boolean;
    ttsEnabled?: boolean;
    csatEnabled?: boolean;
    quickRepliesEnabled?: boolean;
    bookingEnabled?: boolean;
    bookingUrl?: string;
    bookingLabel?: string;
    preChatEnabled?: boolean;
    preChatFields?: PreChatField[];
    consentEnabled?: boolean;
    consentText?: string;
    awayMessage: string;
    customCss: string;
    showBranding: boolean;
    pagePaths: string[];
    pagePathsMode: "show" | "hide";
  };
  ab: { enabled: boolean; promptA: string; promptB: string };
  allowedDomains?: string[];
  dataRetentionDays?: number;
  confidenceThreshold?: number;
  lastSeenAt?: string;
  lastSeenDomain?: string;
}

interface PreChatField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
}

type Tab = "overview" | "inbox" | "configure" | "flows" | "team" | "account" | "activity";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** ISO timestamp → compact relative string like "3m ago" / "2d ago". */
function fmtRelative(d?: string | null) {
  if (!d) return "";
  const t = Date.parse(d);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(d);
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Seconds → compact "Xs" / "Xm" string. */
function fmtDuration(s?: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

/** Percent formatter. The analytics API returns values ALREADY scaled to 0–100
 * (e.g. csat/resolutionRate = Math.round(x*100)), so render them as-is — do NOT
 * re-scale, or a real 1% would wrongly show as 100%. */
function fmtPct(v?: number | null) {
  if (v == null) return "—";
  return `${Math.max(0, Math.min(100, Math.round(v)))}%`;
}

/** Seconds elapsed between two ISO timestamps (or from `from` until now). */
function elapsedSeconds(from?: string | null, to?: string | null): number | null {
  if (!from) return null;
  const start = Date.parse(from);
  if (Number.isNaN(start)) return null;
  const end = to ? Date.parse(to) : Date.now();
  if (Number.isNaN(end)) return null;
  return Math.max(0, (end - start) / 1000);
}

const PRESENCE_COLOR: Record<Presence, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  offline: "bg-zinc-300 dark:bg-zinc-600",
};

/** Small colored dot indicating a member's presence. */
function PresenceDot({ presence, className = "" }: { presence?: Presence; className?: string }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${PRESENCE_COLOR[presence || "offline"]} ${className}`}
      title={presence || "offline"}
    />
  );
}


/* ------------------------------------------------------------------ */
/* Analytics panel                                                     */
/* ------------------------------------------------------------------ */
function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-5 shadow-sm">
      <div className={`flex items-center gap-2 mb-2 ${accent ?? "text-zinc-400 dark:text-zinc-500"}`}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

interface Analytics {
  totals: { conversations: number; messages: number; messagesThisMonth: number; unanswered: number; thumbsUp: number; thumbsDown: number };
  daily: { date: string; count: number }[];
  topUnanswered: { _id: string; content: string; createdAt: string }[];
  abStats: { variant: string; total: number; up: number; down: number; fallbacks: number }[];
  csat?: number;
  avgResponseSeconds?: number;
  resolutionRate?: number;
  series?: { date: string; conversations: number; messages: number }[];
  busiestHours?: number[];
  deflectionRate?: number;
  avgMessagesPerConversation?: number;
  csatSeries?: { date: string; rating: number }[];
}

interface Gap {
  question: string;
  count: number;
  lastAt?: string;
  exampleMessageId?: string;
}

/* Top unanswered questions (aggregated gaps) with inline "Answer" → knowledge base. */
function KnowledgeGaps({ botId, onAnswered }: { botId: string; onAnswered?: () => void }) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await axios.get(`/api/client/knowledge-gaps?botId=${botId}`);
      setGaps(res.data.gaps || []);
    } catch (e) {
      console.error(e);
      setErr("Couldn't load unanswered questions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const submit = async (q: string) => {
    if (!answerText.trim()) return;
    setSaving(true);
    try {
      await axios.post("/api/client/knowledge", { botId, question: q, answer: answerText });
      setGaps((list) => list.filter((g) => g.question !== q));
      setAnswering(null);
      setAnswerText("");
      onAnswered?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mb-1">
        <HelpCircle size={18} className="text-amber-500" />
        <h3 className="font-bold">Top unanswered questions</h3>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
        The questions visitors ask most that the bot couldn&apos;t answer. Answer one to add it to the knowledge base.
      </p>
      {loading ? (
        <SkeletonList rows={3} />
      ) : err ? (
        <ErrorState compact message={err} onRetry={load} />
      ) : gaps.length === 0 ? (
        <EmptyState compact icon={<span className="text-2xl">🎉</span>} title="No recurring gaps" hint="Your bot is answering the questions visitors ask most." />
      ) : (
        <ul className="space-y-2">
          {gaps.map((g) => (
            <li
              key={g.question}
              className="text-sm p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800"
            >
              <div className="flex items-start gap-3">
                <span className="text-zinc-700 dark:text-zinc-300 flex-1">{g.question}</span>
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15 px-2 py-0.5 rounded-full whitespace-nowrap">
                  ×{g.count}
                </span>
              </div>
              {answering === g.question ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    autoFocus
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Write the answer the bot should give…"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 px-3 py-2 text-sm h-24 resize-none outline-none focus:border-black dark:focus:border-zinc-100"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submit(g.question)}
                      disabled={saving || !answerText.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-zinc-900 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? "Saving…" : "Save answer"}
                    </button>
                    <button
                      onClick={() => { setAnswering(null); setAnswerText(""); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setAnswering(g.question); setAnswerText(""); }}
                  className="mt-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  + Answer this
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalyticsPanel({ botId }: { botId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(7);
  const [unanswered, setUnanswered] = useState<
    { _id: string; content: string; createdAt: string }[]
  >([]);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);
  const [kbReload, setKbReload] = useState(0);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await axios.get(`/api/client/analytics?botId=${botId}&days=${days}`);
        if (!alive) return;
        setErr("");
        setData(res.data);
        setUnanswered(res.data.topUnanswered || []);
      } catch (e) {
        console.error(e);
        if (alive) setErr("Couldn't load analytics. Please try again.");
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [botId, days, reload]);

  const submitAnswer = async (q: { _id: string; content: string }) => {
    if (!answerText.trim()) return;
    setSaving(true);
    try {
      await axios.post("/api/client/knowledge", {
        botId,
        question: q.content,
        answer: answerText,
      });
      setUnanswered((list) => list.filter((u) => u._id !== q._id));
      setAnsweringId(null);
      setAnswerText("");
      setKbReload((k) => k + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const series = useMemo(
    () =>
      data?.series && data.series.length
        ? data.series
        : (data?.daily ?? []).map((d) => ({ date: d.date, conversations: 0, messages: d.count })),
    [data],
  );
  const maxSeries = useMemo(
    () => Math.max(1, ...series.map((d) => Math.max(d.conversations, d.messages))),
    [series],
  );
  if (!data && err)
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm">
        <ErrorState message={err} onRetry={() => setReload((r) => r + 1)} />
      </div>
    );
  if (!data)
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading analytics">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
          <Skeleton className="h-4 w-40 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );

  const abActive = data.abStats.some((s) => s.total > 0 && s.variant === "B");

  const rangeOptions = [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Analytics</h2>
        <div className="w-[170px]">
          <Dropdown
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            leftIcon={<Calendar size={15} />}
            options={rangeOptions}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<MessagesSquare size={16} />} label="Conversations" value={String(data.totals.conversations)} />
        <StatCard icon={<MessageCircle size={16} />} label="Messages" value={String(data.totals.messages)} />
        <StatCard icon={<Calendar size={16} />} label="This month" value={String(data.totals.messagesThisMonth)} />
        <StatCard icon={<HelpCircle size={16} />} label="Unanswered" value={String(data.totals.unanswered)} accent="text-red-400" />
        <StatCard icon={<SmilePlus size={16} />} label="CSAT" value={fmtPct(data.csat)} accent="text-emerald-500 dark:text-emerald-400" />
        <StatCard icon={<Clock size={16} />} label="Avg response" value={fmtDuration(data.avgResponseSeconds)} accent="text-indigo-500 dark:text-indigo-400" />
        <StatCard icon={<Gauge size={16} />} label="Resolution" value={fmtPct(data.resolutionRate)} accent="text-sky-500 dark:text-sky-400" />
        <StatCard icon={<ThumbsUp size={16} />} label="Helpful" value={`${data.totals.thumbsUp} / ${data.totals.thumbsDown}`} accent="text-emerald-500 dark:text-emerald-400" />
        <StatCard
          icon={<ShieldCheck size={16} />}
          label="Deflection"
          value={fmtPct(data.deflectionRate)}
          accent="text-violet-500 dark:text-violet-400"
        />
        <StatCard
          icon={<MessagesSquare size={16} />}
          label="Avg msgs / conv"
          value={data.avgMessagesPerConversation != null ? data.avgMessagesPerConversation.toFixed(1) : "—"}
          accent="text-amber-500 dark:text-amber-400"
        />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
            Activity · last {days} days
          </div>
          <div className="flex items-center gap-4 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-black dark:bg-zinc-100" /> Messages</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Conversations</span>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-32 overflow-x-auto">
          {series.length === 0 && <div className="text-zinc-400 dark:text-zinc-500 text-sm">No activity yet.</div>}
          {series.map((d) => (
            <div key={d.date} className="flex-1 min-w-[10px] flex flex-col items-center gap-1.5" title={`${fmtDate(d.date)} · ${d.messages} messages · ${d.conversations} conversations`}>
              <div className="w-full flex items-end justify-center gap-0.5 h-full">
                <div className="w-1/2 bg-black dark:bg-zinc-100 rounded-t-sm min-h-[2px]" style={{ height: `${(d.messages / maxSeries) * 100}%` }} />
                <div className="w-1/2 bg-indigo-500 rounded-t-sm min-h-[2px]" style={{ height: `${(d.conversations / maxSeries) * 100}%` }} />
              </div>
              {days <= 30 && (
                <div className="text-[9px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  {new Date(d.date).toLocaleDateString(undefined, days <= 7 ? { weekday: "short" } : { day: "numeric" })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Busiest hours + CSAT trend */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mb-1">
            <Clock size={18} className="text-indigo-500" />
            <h3 className="font-bold">Busiest hours</h3>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
            When your visitors chat the most (local 24-hour clock).
          </p>
          {(() => {
            const hours = data.busiestHours && data.busiestHours.length === 24 ? data.busiestHours : null;
            if (!hours || hours.every((h) => !h))
              return (
                <EmptyState compact icon={<Clock size={22} />} title="Not enough data yet" hint="Hourly activity appears once visitors start chatting." />
              );
            const maxH = Math.max(1, ...hours);
            const peak = hours.indexOf(maxH);
            return (
              <>
                <div className="flex items-end gap-0.5 h-28">
                  {hours.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                      title={`${i}:00 — ${h} ${h === 1 ? "message" : "messages"}`}
                    >
                      <div
                        className={`w-full rounded-t-sm min-h-[2px] ${i === peak ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        style={{ height: `${(h / maxH) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                  <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                  Peak around <span className="font-bold">{peak}:00</span>.
                </p>
              </>
            );
          })()}
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mb-1">
            <SmilePlus size={18} className="text-emerald-500" />
            <h3 className="font-bold">CSAT trend</h3>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
            Average satisfaction rating over time.
          </p>
          {(() => {
            const cs = data.csatSeries || [];
            if (cs.length === 0 || cs.every((d) => !d.rating))
              return (
                <EmptyState compact icon={<SmilePlus size={22} />} title="No ratings yet" hint="Enable post-chat rating in Configure to collect CSAT." />
              );
            // Ratings are on a 1–5 scale; bars are relative to a fixed max of 5.
            return (
              <div className="flex items-end gap-1 h-28 overflow-x-auto">
                {cs.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 min-w-[8px] flex flex-col items-center justify-end h-full gap-1"
                    title={`${fmtDate(d.date)} · ${d.rating ? d.rating.toFixed(1) + "★" : "—"}`}
                  >
                    <div
                      className="w-full bg-emerald-500 rounded-t-sm min-h-[2px]"
                      style={{ height: `${(Math.min(5, d.rating) / 5) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      <KnowledgeGaps botId={botId} onAnswered={() => setKbReload((k) => k + 1)} />

      {abActive && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
          <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">A/B test results</div>
          <div className="grid grid-cols-2 gap-4">
            {data.abStats.map((s) => {
              const rate = s.total ? Math.round((s.up / s.total) * 100) : 0;
              return (
                <div key={s.variant} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                  <div className="font-bold mb-1">Variant {s.variant}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{s.total} replies · 👍 {s.up} · 👎 {s.down}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Fallbacks: {s.fallbacks}</div>
                  <div className="mt-2 text-lg font-extrabold">{rate}% 👍</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Unanswered — answer inline */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mb-1">
            <HelpCircle size={18} className="text-red-400" />
            <h3 className="font-bold">Questions your bot couldn&apos;t answer</h3>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
            Answer one and it&apos;s added to the knowledge base automatically.
          </p>
          {unanswered.length === 0 ? (
            <div className="text-sm text-zinc-400 dark:text-zinc-500">
              Nothing here — your bot is answering everything. 🎉
            </div>
          ) : (
            <ul className="space-y-2">
              {unanswered.map((q) => (
                <li
                  key={q._id}
                  className="text-sm p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-zinc-700 dark:text-zinc-300 flex-1">{q.content}</span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{fmtDate(q.createdAt)}</span>
                  </div>
                  {answeringId === q._id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        autoFocus
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="Write the answer the bot should give…"
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 px-3 py-2 text-sm h-24 resize-none outline-none focus:border-black dark:focus:border-zinc-100"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => submitAnswer(q)}
                          disabled={saving || !answerText.trim()}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-zinc-900 disabled:opacity-50 cursor-pointer"
                        >
                          {saving ? "Saving…" : "Save answer"}
                        </button>
                        <button
                          onClick={() => { setAnsweringId(null); setAnswerText(""); }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAnsweringId(q._id); setAnswerText(""); }}
                      className="mt-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white cursor-pointer"
                    >
                      + Answer this
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Answered → added to knowledge base */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mb-1">
            <HelpCircle size={18} className="text-emerald-500" />
            <h3 className="font-bold">Added to knowledge base</h3>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
            Answers you&apos;ve trained. Edit or remove them anytime — also editable in Configure.
          </p>
          <TrainedAnswers botId={botId} reloadKey={kbReload} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inbox panel (live chat takeover)                                    */
/* ------------------------------------------------------------------ */
interface ConvRow {
  _id: string;
  visitorId: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorConversations?: number;
  messageCount: number;
  escalated: boolean;
  needsHuman: boolean;
  mode: "ai" | "human";
  updatedAt: string;
  createdAt?: string;
  firstResponseAt?: string | null;
  lastMessage: string;
  status?: "open" | "resolved";
  tags?: string[];
  assignedTo?: string | null;
}
type Presence = "online" | "away" | "offline";
interface TeamMember {
  _id: string;
  name: string;
  email: string;
  createdAt?: string;
  presence?: Presence;
  presenceAt?: string;
  agentPermission?: "viewer" | "agent" | "manager";
}
interface Msg {
  _id: string;
  role: "user" | "bot" | "agent";
  content: string;
  createdAt: string;
}
interface ConvDetail {
  _id: string;
  visitorId: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorUserId?: string;
  visitorAttributes?: Record<string, string>;
  status?: "open" | "resolved";
  tags?: string[];
  assignedTo?: string | null;
  createdAt?: string;
  firstResponseAt?: string | null;
  survey?: Record<string, string>;
  prechat?: Record<string, string>;
  meta?: {
    page?: string;
    referrer?: string;
    browser?: string;
    os?: string;
    device?: string;
    language?: string;
    timezone?: string;
    country?: string;
    city?: string;
  };
}

function visitorLabel(c: { visitorName?: string; visitorEmail?: string; visitorId: string }) {
  return c.visitorName || c.visitorEmail || `Visitor ${c.visitorId.slice(0, 6)}`;
}

function hasVisitorDetails(c: ConvDetail | null): boolean {
  if (!c) return false;
  const m = c.meta || {};
  return Boolean(
    c.visitorEmail ||
      c.visitorUserId ||
      m.page ||
      m.referrer ||
      m.browser ||
      m.os ||
      m.device ||
      m.language ||
      m.timezone ||
      m.city ||
      m.country ||
      (c.visitorAttributes && Object.keys(c.visitorAttributes).length),
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-zinc-400 dark:text-zinc-500 shrink-0 w-20 capitalize">{label}</span>
      {link ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="truncate text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="truncate font-medium">{value}</span>
      )}
    </div>
  );
}

interface CannedItem {
  _id: string;
  title: string;
  shortcut?: string;
  content: string;
  category?: string;
}

interface ConvNote {
  authorId?: string;
  authorName?: string;
  text: string;
  createdAt: string;
}

function InboxPanel({ botId, focusId }: { botId: string; focusId?: string | null }) {
  const [convos, setConvos] = useState<ConvRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [convInfo, setConvInfo] = useState<ConvDetail | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [reply, setReply] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [listErr, setListErr] = useState("");
  const lastPing = useRef(0);

  // Deep-link from the command palette: open a specific conversation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focusId) setActiveId(focusId);
  }, [focusId]);

  // Filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">("open");
  const qRef = useRef(q);
  const statusRef = useRef(statusFilter);
  const didMount = useRef(false);

  // Conversation management
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [patching, setPatching] = useState(false);

  // Presence — current user's status + a map of memberId → presence
  const [myPresence, setMyPresence] = useState<Presence>("online");
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>({});

  // Internal notes (per open conversation)
  const [notes, setNotes] = useState<ConvNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  // Canned replies + AI assist
  const [canned, setCanned] = useState<CannedItem[]>([]);
  const [assisting, setAssisting] = useState(false);
  const [assistErr, setAssistErr] = useState("");

  // Handoff alerts — pref persisted in localStorage.
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("sahayak-inbox-alerts") === "1",
  );
  const alertsRef = useRef(false);
  const prevWaitingRef = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Keep the interval closure's view of the pref in sync (ref write only — no re-render).
  useEffect(() => {
    alertsRef.current = alertsEnabled;
  }, [alertsEnabled]);

  const playBeep = () => {
    try {
      const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const Ctx = window.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current || (audioCtxRef.current = new Ctx());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start();
      o.stop(ctx.currentTime + 0.42);
    } catch {
      /* audio unavailable */
    }
  };

  const notifyWaiting = (c: ConvRow) => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("A visitor needs a human", { body: visitorLabel(c) });
      } catch {
        /* ignore */
      }
    }
    playBeep();
  };

  const toggleAlerts = async () => {
    if (!alertsEnabled) {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          /* ignore */
        }
      }
      try {
        await audioCtxRef.current?.resume();
      } catch {
        /* ignore */
      }
      setAlertsEnabled(true);
      window.localStorage.setItem("sahayak-inbox-alerts", "1");
    } else {
      setAlertsEnabled(false);
      window.localStorage.setItem("sahayak-inbox-alerts", "0");
    }
  };

  // Throttled "agent is typing" ping so the visitor's widget can show it live.
  const pingTyping = () => {
    const now = Date.now();
    if (!activeId || now - lastPing.current < 2500) return;
    lastPing.current = now;
    axios.post(`/api/client/conversations/${activeId}/typing`).catch(() => {});
  };

  const loadConvos = async () => {
    try {
      const params = new URLSearchParams({ botId });
      if (statusRef.current !== "all") params.set("status", statusRef.current);
      if (qRef.current.trim()) params.set("q", qRef.current.trim());
      const res = await axios.get(`/api/client/conversations?${params.toString()}`);
      const list: ConvRow[] = res.data.conversations || [];

      // Detect conversations that NEWLY entered a waiting/needs-human state.
      const waiting = new Set(list.filter((c) => c.needsHuman).map((c) => c._id));
      if (prevWaitingRef.current && alertsRef.current) {
        const fresh = list.find((c) => c.needsHuman && !prevWaitingRef.current!.has(c._id));
        if (fresh) notifyWaiting(fresh);
      }
      prevWaitingRef.current = waiting;

      setConvos(list);
      setListErr("");
    } catch (e) {
      console.error(e);
      setListErr("Couldn't load conversations.");
    }
  };

  // Initial + periodic conversation list refresh
  useEffect(() => {
    let alive = true;
    prevWaitingRef.current = null;
    const run = async () => {
      setLoadingList(true);
      await loadConvos();
      if (alive) setLoadingList(false);
    };
    run();
    const t = setInterval(loadConvos, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  // Refetch when filters change (debounced), skipping the initial mount.
  useEffect(() => {
    qRef.current = q;
    statusRef.current = statusFilter;
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(loadConvos, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter]);

  // Load team members for the assignee picker (empty if the user is an invited agent).
  useEffect(() => {
    axios
      .get("/api/client/team")
      .then((r) => setTeam(r.data.members || []))
      .catch(() => setTeam([]));
  }, []);

  // Load the owner's canned replies once.
  useEffect(() => {
    axios
      .get("/api/client/canned")
      .then((r) => setCanned(r.data.items || []))
      .catch(() => setCanned([]));
  }, []);

  // Presence: send an "online" heartbeat every ~60s while the inbox is open and
  // keep a map of teammate presence for assignee dots. A ref keeps the interval's
  // view of the current status in sync without re-subscribing.
  const myPresenceRef = useRef<Presence>("online");
  useEffect(() => {
    let alive = true;
    const beat = () => {
      axios.post("/api/client/presence", { status: myPresenceRef.current }).catch(() => {});
    };
    const loadPresence = async () => {
      try {
        const r = await axios.get("/api/client/presence");
        if (!alive) return;
        const map: Record<string, Presence> = {};
        (r.data.members || []).forEach((m: { _id: string; presence?: Presence }) => {
          map[m._id] = m.presence || "offline";
        });
        setPresenceMap(map);
      } catch {
        /* ignore */
      }
    };
    beat();
    loadPresence();
    const t = setInterval(() => {
      beat();
      loadPresence();
    }, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const setPresence = (status: Presence) => {
    setMyPresence(status);
    myPresenceRef.current = status;
    axios.post("/api/client/presence", { status }).catch(() => {});
  };

  // Load internal notes for the open conversation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes([]);
    setNoteText("");
    setAssistErr("");
    if (!activeId) return;
    let alive = true;
    axios
      .get(`/api/client/conversations/${activeId}/notes`)
      .then((r) => alive && setNotes(r.data.notes || []))
      .catch(() => alive && setNotes([]));
    return () => {
      alive = false;
    };
  }, [activeId]);

  const addNote = async () => {
    const text = noteText.trim();
    if (!text || !activeId) return;
    setNoteBusy(true);
    try {
      const res = await axios.post(`/api/client/conversations/${activeId}/notes`, { text });
      setNotes(res.data.notes || []);
      setNoteText("");
    } catch (e) {
      console.error(e);
    } finally {
      setNoteBusy(false);
    }
  };

  const suggestReply = async () => {
    if (!activeId || assisting) return;
    setAssisting(true);
    setAssistErr("");
    try {
      const res = await axios.post(`/api/client/conversations/${activeId}/assist`);
      const s = (res.data.suggestion as string) || "";
      if (s) setReply(s);
      else setAssistErr("No suggestion available yet.");
    } catch {
      setAssistErr("Couldn't generate a suggestion.");
    } finally {
      setAssisting(false);
    }
  };

  const insertCanned = (c: CannedItem) => {
    setReply((r) => (r.trim() ? `${r} ${c.content}` : c.content));
  };

  // Poll the open conversation's messages
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await axios.get(`/api/client/conversations/${activeId}`);
        if (!alive) return;
        setMessages(res.data.messages);
        setMode(res.data.conversation?.mode || "ai");
        setConvInfo(res.data.conversation || null);
      } catch (e) {
        console.error(e);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [activeId]);

  const sendReply = async () => {
    if (!reply.trim() || !activeId) return;
    const text = reply.trim();
    setReply("");
    try {
      const res = await axios.post(`/api/client/conversations/${activeId}/reply`, { content: text });
      setMessages((m) => [...m, res.data.message]);
      setMode("human");
      loadConvos();
    } catch (e) {
      console.error(e);
    }
  };

  const setConvMode = async (m: "ai" | "human") => {
    if (!activeId) return;
    try {
      await axios.post(`/api/client/conversations/${activeId}/mode`, { mode: m });
      setMode(m);
      loadConvos();
    } catch (e) {
      console.error(e);
    }
  };

  const patchConv = async (patch: { status?: "open" | "resolved"; tags?: string[]; assignedTo?: string | null }) => {
    if (!activeId) return;
    setPatching(true);
    try {
      const res = await axios.patch(`/api/client/conversations/${activeId}`, patch);
      const updated = res.data.conversation || {};
      setConvInfo((ci) => (ci ? { ...ci, ...updated } : updated));
      loadConvos();
    } catch (e) {
      console.error(e);
    } finally {
      setPatching(false);
    }
  };

  const convStatus = convInfo?.status ?? "open";
  const convTags = convInfo?.tags ?? [];

  // SLA: first-response time (created → firstResponseAt) or current wait time.
  const activeRow = convos.find((c) => c._id === activeId) || null;
  const convCreatedAt = convInfo?.createdAt || activeRow?.createdAt || null;
  const convFirstResponseAt = convInfo?.firstResponseAt ?? activeRow?.firstResponseAt ?? null;
  const frtSeconds = convFirstResponseAt ? elapsedSeconds(convCreatedAt, convFirstResponseAt) : null;
  const waitingSeconds = !convFirstResponseAt ? elapsedSeconds(convCreatedAt) : null;
  const assignedPresence = convInfo?.assignedTo ? presenceMap[convInfo.assignedTo] : undefined;

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (convTags.includes(t)) {
      setTagInput("");
      return;
    }
    patchConv({ tags: [...convTags, t] });
    setTagInput("");
  };
  const removeTag = (t: string) => patchConv({ tags: convTags.filter((x) => x !== t) });

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];
  const assigneeOptions = [
    { value: "", label: "Unassigned" },
    ...team.map((m) => ({ value: m._id, label: m.name || m.email })),
  ];

  // @mention autocomplete for the internal-notes box.
  const mentionMatch = /(^|\s)@([\w.-]*)$/.exec(noteText);
  const mentionQuery = mentionMatch ? mentionMatch[2].toLowerCase() : null;
  const mentionMatches =
    mentionQuery !== null
      ? team
          .filter((m) => (m.name || m.email).toLowerCase().includes(mentionQuery))
          .slice(0, 5)
      : [];
  const applyMention = (m: TeamMember) => {
    const handle = (m.name || m.email).replace(/\s+/g, "");
    setNoteText((t) => t.replace(/(^|\s)@([\w.-]*)$/, `$1@${handle} `));
  };

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr] md:h-[560px]">
      {/* Conversation list */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm flex flex-col overflow-hidden max-h-[420px] md:max-h-none">
        {/* Filters */}
        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
          {/* Current-user presence */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mr-0.5">You</span>
            {(["online", "away", "offline"] as Presence[]).map((p) => {
              const on = myPresence === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPresence(p)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize transition cursor-pointer ${
                    on
                      ? "border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 hover:border-zinc-400"
                  }`}
                >
                  <PresenceDot presence={p} className={on ? "ring-2 ring-white/40" : ""} />
                  {p}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-xl border border-zinc-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <Dropdown
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as "open" | "resolved" | "all")}
                options={statusOptions}
              />
            </div>
            <button
              type="button"
              onClick={toggleAlerts}
              aria-label={alertsEnabled ? "Handoff alerts on — click to disable" : "Enable handoff alerts"}
              aria-pressed={alertsEnabled}
              title={alertsEnabled ? "Handoff alerts on" : "Enable handoff alerts"}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                alertsEnabled
                  ? "border-indigo-200 text-indigo-600 bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:bg-indigo-500/10"
                  : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 hover:border-zinc-400"
              }`}
            >
              {alertsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              <Volume2 size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList && convos.length === 0 ? (
            <SkeletonList rows={5} className="p-3" />
          ) : listErr && convos.length === 0 ? (
            <ErrorState
              compact
              message={listErr}
              onRetry={() => {
                setLoadingList(true);
                loadConvos().finally(() => setLoadingList(false));
              }}
            />
          ) : convos.length === 0 ? (
            <EmptyState
              compact
              icon={<InboxIcon size={22} />}
              title="No conversations yet"
              hint="When visitors chat with your bot, their conversations show up here."
            />
          ) : (
            convos.map((c) => (
              <button
                key={c._id}
                onClick={() => setActiveId(c._id)}
                className={`w-full text-left p-4 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition ${activeId === c._id ? "bg-zinc-50 dark:bg-zinc-800" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{visitorLabel(c)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.needsHuman && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15 px-1.5 py-0.5 rounded-full">WAITING</span>}
                    {c.mode === "human" && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/15 px-1.5 py-0.5 rounded-full">LIVE</span>}
                    {c.status === "resolved" && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15 px-1.5 py-0.5 rounded-full">RESOLVED</span>}
                    {(c.visitorConversations ?? 1) > 1 && <span className="text-[9px] font-bold text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">RETURNING</span>}
                  </div>
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-1">{c.lastMessage || `${c.messageCount} messages`}</div>
                {c.tags && c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.tags.map((t) => (
                      <span key={t} className="text-[9px] font-semibold text-zinc-500 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-1">{fmtDate(c.updatedAt)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Transcript + reply */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm flex flex-col min-h-[480px] md:min-h-0">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<MessagesSquare size={22} />}
              title="Select a conversation"
              hint="Pick a conversation from the list to read the transcript and reply."
            />
          </div>
        ) : (
          <>
            <div className="px-4 sm:px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">
                    {convInfo ? visitorLabel(convInfo) : "Conversation"}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {mode === "human" ? "Live chat" : "AI handled"}
                    {(convos.find((c) => c._id === activeId)?.visitorConversations ?? 1) > 1
                      ? " · Returning visitor"
                      : " · New visitor"}
                  </div>
                  {/* SLA */}
                  {(frtSeconds != null || waitingSeconds != null) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {frtSeconds != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          <Clock size={11} /> First reply {fmtDuration(frtSeconds)}
                        </span>
                      )}
                      {waitingSeconds != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15 px-2 py-0.5 rounded-full">
                          <Clock size={11} /> Waiting {fmtDuration(waitingSeconds)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowNotes((s) => !s)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                      showNotes
                        ? "border-amber-200 text-amber-600 bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:bg-amber-500/10"
                        : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <StickyNote size={13} /> Notes{notes.length ? ` (${notes.length})` : ""}
                  </button>
                  <button
                    onClick={() => setShowInfo((s) => !s)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    {showInfo ? "Hide info" : "Visitor info"}
                  </button>
                  <button
                    onClick={() => setConvMode(mode === "human" ? "ai" : "human")}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${mode === "human" ? "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10"}`}
                  >
                    {mode === "human" ? "Return to AI" : "Take over"}
                  </button>
                </div>
              </div>

              {/* Management toolbar */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => patchConv({ status: convStatus === "resolved" ? "open" : "resolved" })}
                  disabled={patching}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                    convStatus === "resolved"
                      ? "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  }`}
                >
                  {convStatus === "resolved" ? "Reopen" : "Mark resolved"}
                </button>

                <div className="flex items-center gap-1.5">
                  <div className="w-[190px]" title="Transfer this conversation to a teammate">
                    <Dropdown
                      value={convInfo?.assignedTo || ""}
                      onChange={(v) => patchConv({ assignedTo: v || null })}
                      leftIcon={<Users size={14} />}
                      placeholder="Transfer / assign…"
                      options={assigneeOptions}
                    />
                  </div>
                  {convInfo?.assignedTo && (
                    <span
                      className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400"
                      title={`Assignee is ${assignedPresence || "offline"}`}
                    >
                      <PresenceDot presence={assignedPresence} />
                    </span>
                  )}
                </div>

                <a
                  href={`/api/client/conversations/${activeId}/export`}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <Download size={14} /> Export CSV
                </a>
              </div>

              {/* Tags */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <TagIcon size={14} className="text-zinc-400" />
                {convTags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800 pl-2 pr-1 py-0.5 rounded-full"
                  >
                    #{t}
                    <button onClick={() => removeTag(t)} className="hover:text-red-500 cursor-pointer" title="Remove tag" aria-label={`Remove tag ${t}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add tag…"
                  className="w-24 rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] outline-none focus:border-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>

              {showInfo && convInfo && (
                <div className="mt-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5">
                  {convInfo.visitorEmail && <InfoRow label="Email" value={convInfo.visitorEmail} />}
                  {convInfo.visitorUserId && <InfoRow label="User ID" value={convInfo.visitorUserId} />}
                  {(convInfo.meta?.city || convInfo.meta?.country) && (
                    <InfoRow label="Location" value={[convInfo.meta?.city, convInfo.meta?.country].filter(Boolean).join(" · ")} />
                  )}
                  {(convInfo.meta?.browser || convInfo.meta?.os || convInfo.meta?.device) && (
                    <InfoRow label="Device" value={[convInfo.meta?.browser, convInfo.meta?.os, convInfo.meta?.device].filter(Boolean).join(" · ")} />
                  )}
                  {convInfo.meta?.language && <InfoRow label="Language" value={convInfo.meta.language} />}
                  {convInfo.meta?.timezone && <InfoRow label="Timezone" value={convInfo.meta.timezone} />}
                  {convInfo.meta?.page && <InfoRow label="On page" value={convInfo.meta.page} link />}
                  {convInfo.meta?.referrer && <InfoRow label="Referrer" value={convInfo.meta.referrer} link />}
                  {convInfo.visitorAttributes &&
                    Object.entries(convInfo.visitorAttributes).map(([k, v]) => (
                      <InfoRow key={k} label={k} value={String(v)} />
                    ))}
                  {!hasVisitorDetails(convInfo) && (
                    <div className="text-zinc-400 dark:text-zinc-500">
                      No visitor details captured for this conversation. New chats
                      (after deploying the updated widget) will show details here.
                    </div>
                  )}
                </div>
              )}

              {/* Survey / form responses */}
              {convInfo &&
                ((convInfo.prechat && Object.keys(convInfo.prechat).length > 0) ||
                  (convInfo.survey && Object.keys(convInfo.survey).length > 0)) && (
                  <div className="mt-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      <FileText size={13} /> Survey / form responses
                    </div>
                    {convInfo.prechat && Object.keys(convInfo.prechat).length > 0 && (
                      <div className="space-y-1.5">
                        {Object.entries(convInfo.prechat).map(([k, v]) => (
                          <InfoRow key={`pc-${k}`} label={k} value={String(v)} />
                        ))}
                      </div>
                    )}
                    {convInfo.survey && Object.keys(convInfo.survey).length > 0 && (
                      <div className="space-y-1.5">
                        {Object.entries(convInfo.survey).map(([q, a]) => (
                          <div key={`sv-${q}`} className="space-y-0.5">
                            <div className="text-zinc-400 dark:text-zinc-500">{q}</div>
                            <div className="font-medium whitespace-pre-wrap">{String(a) || "—"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {/* Internal notes */}
              {showNotes && (
                <div className="mt-3 rounded-xl bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
                    <StickyNote size={13} /> Internal notes — not shown to visitor
                  </div>
                  {notes.length === 0 ? (
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">No notes yet.</div>
                  ) : (
                    <ul className="space-y-2 mb-2 max-h-40 overflow-y-auto">
                      {notes.map((n, i) => (
                        <li key={i} className="text-xs text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 rounded-lg border border-amber-100 dark:border-amber-500/10 p-2">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="font-semibold">{n.authorName || "Teammate"}</span>
                            <span className="text-[10px] text-zinc-400">{fmtDate(n.createdAt)}</span>
                          </div>
                          <div className="whitespace-pre-wrap">{n.text}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      {mentionMatches.length > 0 && (
                        <div className="absolute bottom-full mb-1 left-0 w-full max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-1 z-20">
                          {mentionMatches.map((m) => (
                            <button
                              key={m._id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applyMention(m);
                              }}
                              className="w-full flex items-center gap-2 text-left rounded-md px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <span className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                                {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
                              </span>
                              <span className="font-semibold truncate">{m.name || m.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addNote();
                          }
                        }}
                        placeholder="Add an internal note… (type @ to mention)"
                        className="w-full rounded-lg border border-amber-200 dark:border-amber-500/20 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs outline-none focus:border-amber-400 dark:text-zinc-100 dark:placeholder-zinc-500"
                      />
                    </div>
                    <button
                      onClick={addNote}
                      disabled={noteBusy || !noteText.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white disabled:opacity-50 cursor-pointer"
                    >
                      {noteBusy ? "…" : "Add"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3" aria-live="polite" aria-label="Conversation messages">
              {messages.map((m) => (
                <div
                  key={m._id}
                  className={`max-w-[85%] sm:max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words ${
                    m.role === "user"
                      ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 rounded-tl-sm"
                      : m.role === "agent"
                        ? "bg-indigo-600 text-white ml-auto rounded-tr-sm"
                        : "bg-black text-white ml-auto rounded-tr-sm"
                  }`}
                >
                  {m.role === "agent" && <div className="text-[9px] font-bold opacity-70 mb-0.5">You</div>}
                  {m.role === "bot" && <div className="text-[9px] font-bold opacity-70 mb-0.5">AI</div>}
                  {m.content}
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
              {/* Reply tools: AI assist + canned replies */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={suggestReply}
                  disabled={assisting}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition cursor-pointer disabled:opacity-50"
                >
                  {assisting ? (
                    <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {assisting ? "Thinking…" : "Suggest reply"}
                </button>

                <div className="w-[190px]">
                  <SelectPopover
                    panelClass="max-h-72 overflow-y-auto"
                    display={
                      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                        <MessageSquareQuote size={14} /> Canned replies
                      </span>
                    }
                  >
                    {(close) =>
                      canned.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-zinc-400">
                          No canned replies yet. Add them in Configure.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {canned.map((c) => (
                            <button
                              key={c._id}
                              type="button"
                              onClick={() => {
                                insertCanned(c);
                                close();
                              }}
                              className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold truncate">{c.title}</span>
                                {c.shortcut && (
                                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">/{c.shortcut}</span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{c.content}</div>
                            </button>
                          ))}
                        </div>
                      )
                    }
                  </SelectPopover>
                </div>

                {assistErr && <span className="text-[11px] text-red-500">{assistErr}</span>}
              </div>

              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => {
                    setReply(e.target.value);
                    pingTyping();
                  }}
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  placeholder="Type a reply as a human agent…"
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                <button onClick={sendReply} className="px-4 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 flex items-center gap-1 text-sm font-semibold cursor-pointer">
                  <Send size={15} /> Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Appearance sub-controls                                             */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COLOR_SWATCHES = [
  "#111827",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#e11d48",
  "#ea580c",
  "#059669",
  "#0ea5e9",
];

/** Compact dropdown shell: a trigger showing the current value + a popover panel. */
function SelectPopover({
  display,
  children,
  panelClass,
  hideChevron = false,
}: {
  display: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  panelClass?: string;
  hideChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 rounded-xl border border-zinc-200 px-2.5 py-2 text-sm hover:border-zinc-400 focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 cursor-pointer ${hideChevron ? "justify-center" : "justify-between"}`}
      >
        <span className="flex items-center gap-2.5 min-w-0">{display}</span>
        {!hideChevron && (
          <ChevronDown
            size={16}
            className={`text-zinc-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && (
        <div
          className={`absolute z-50 mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-2 ${panelClass || ""}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function IconSelect({
  value,
  onChange,
  color,
  noneLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  color: string;
  noneLabel: string;
}) {
  const Selected = value ? ICON_COMPONENTS[value as BotIconKey] : null;
  return (
    <SelectPopover
      display={
        <>
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white shrink-0"
            style={{ background: color }}
          >
            {Selected ? <Selected size={16} /> : <span className="text-[11px] font-bold">Aa</span>}
          </span>
          <span className="font-medium text-zinc-700 dark:text-zinc-200 truncate">
            {value ? BOT_ICON_LABELS[value as BotIconKey] : noneLabel}
          </span>
        </>
      }
    >
      {(close) => (
        <>
          <button
            type="button"
            onClick={() => {
              onChange("");
              close();
            }}
            className={`w-full mb-1.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              !value
                ? "bg-zinc-100 dark:bg-zinc-800 font-semibold"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            <span className="w-7 h-7 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center text-[10px] text-zinc-400">
              —
            </span>
            {noneLabel}
          </button>
          <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto p-0.5">
            {BOT_ICON_KEYS.map((k) => {
              const Ic = ICON_COMPONENTS[k];
              const on = value === k;
              return (
                <button
                  key={k}
                  type="button"
                  title={BOT_ICON_LABELS[k]}
                  onClick={() => {
                    onChange(k);
                    close();
                  }}
                  className={`flex items-center justify-center h-10 rounded-lg border transition-all cursor-pointer ${
                    on
                      ? "border-transparent text-white"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400"
                  }`}
                  style={on ? { background: color } : undefined}
                >
                  <Ic size={17} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </SelectPopover>
  );
}

function ShapeSelect({
  value,
  onChange,
  color,
}: {
  value: LauncherShape;
  onChange: (v: LauncherShape) => void;
  color: string;
}) {
  return (
    <SelectPopover
      display={
        <>
          <span
            className="w-8 h-8 shrink-0"
            style={{ background: color, borderRadius: LAUNCHER_SHAPE_RADIUS[value] }}
          />
          <span className="font-medium text-zinc-700 dark:text-zinc-200 truncate">
            {LAUNCHER_SHAPE_LABELS[value]}
          </span>
        </>
      }
    >
      {(close) => (
        <div className="grid grid-cols-3 gap-1.5">
          {LAUNCHER_SHAPES.map((s) => {
            const on = value === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s);
                  close();
                }}
                className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all cursor-pointer ${
                  on
                    ? "border-transparent ring-2 ring-black dark:ring-white bg-zinc-50 dark:bg-zinc-800"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                }`}
              >
                <span
                  className="w-8 h-8"
                  style={{
                    background: color,
                    borderRadius: LAUNCHER_SHAPE_RADIUS[s],
                    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                  }}
                />
                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                  {LAUNCHER_SHAPE_LABELS[s]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </SelectPopover>
  );
}

function ColorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const hex = (value || "").replace(/^#/, "");
  return (
    <SelectPopover
      display={
        <>
          <span
            className="w-8 h-8 rounded-lg border border-black/10 dark:border-white/15 shrink-0"
            style={{ background: value }}
          />
          <span className="font-mono uppercase text-zinc-700 dark:text-zinc-200 truncate">
            {value || "#000000"}
          </span>
        </>
      }
    >
      {() => (
        <div className="space-y-3 p-1">
          <div className="grid grid-cols-8 gap-1.5">
            {COLOR_SWATCHES.map((c) => {
              const on = (value || "").toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => onChange(c)}
                  className={`w-full aspect-square rounded-full transition-transform hover:scale-110 cursor-pointer ${
                    on
                      ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-white ring-offset-white dark:ring-offset-zinc-900"
                      : "ring-1 ring-black/5"
                  }`}
                  style={{ background: c }}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2.5">
            {/* Swatch: native picker scaled up + transparent so only the color shows */}
            <div
              className="relative w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm shrink-0"
              style={{ background: value }}
            >
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-label="Pick primary color"
                className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] cursor-pointer opacity-0"
              />
            </div>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono select-none pointer-events-none">
                #
              </span>
              <input
                value={hex}
                onChange={(e) =>
                  onChange("#" + e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))
                }
                maxLength={6}
                spellCheck={false}
                className="w-full rounded-lg border border-zinc-200 pl-7 pr-3 py-2 text-sm font-mono uppercase focus:ring-4 focus:ring-black/5 focus:border-black outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>
      )}
    </SelectPopover>
  );
}

function AvatarUpload({
  value,
  publicId,
  onUploaded,
  onClear,
}: {
  value: string;
  publicId?: string;
  onUploaded: (url: string, publicId: string) => void;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (publicId) fd.append("oldPublicId", publicId);
      const res = await axios.post("/api/client/upload", fd);
      onUploaded(res.data.url, res.data.publicId || "");
    } catch (e) {
      const msg =
        (axios.isAxiosError(e) && e.response?.data?.message) ||
        "Upload failed. Please try again.";
      setErr(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-zinc-300 dark:text-zinc-600" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:border-zinc-400 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {uploading ? (
                <span className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {uploading ? "Uploading…" : value ? "Replace" : "Upload image"}
            </button>
            {value && !uploading && (
              <button
                type="button"
                onClick={onClear}
                className="text-sm text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            PNG, JPG, WEBP, GIF or SVG · max 3 MB
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  );
}

function LauncherPreview({ appearance }: { appearance: Bot["appearance"] }) {
  const color = appearance.primaryColor || "#000000";
  const LauncherIcon =
    (appearance.launcherIconKey &&
      ICON_COMPONENTS[appearance.launcherIconKey as BotIconKey]) ||
    null;
  const AvatarIcon =
    (appearance.avatarIconKey &&
      ICON_COMPONENTS[appearance.avatarIconKey as BotIconKey]) ||
    null;
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-4 flex items-center gap-5">
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <div
          className="flex items-center justify-center w-14 h-14 text-white shadow-lg"
          style={{ background: color, borderRadius: LAUNCHER_SHAPE_RADIUS[appearance.launcherShape] }}
        >
          {LauncherIcon ? (
            <LauncherIcon size={26} />
          ) : (
            <span className="text-2xl">{appearance.launcherIcon || "💬"}</span>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Launcher
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2 px-3 py-2.5 text-white" style={{ background: color }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 overflow-hidden shrink-0">
              {appearance.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appearance.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : AvatarIcon ? (
                <AvatarIcon size={17} />
              ) : (
                <BotIcon size={17} />
              )}
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-xs font-bold truncate">
                {appearance.botName || "Support Assistant"}
              </div>
              <div className="text-[10px] opacity-80">Online now</div>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900 px-3 py-2.5">
            <span className="inline-block text-[11px] rounded-lg rounded-bl-sm px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {appearance.welcomeMessage || "Hi! How can I help you today?"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Knowledge sources (files + URLs the bot ingests)                    */
/* ------------------------------------------------------------------ */
interface KnowledgeSource {
  _id: string;
  type: string;
  name: string;
  url?: string;
  status: string;
  error?: string;
  charCount?: number;
  chunkCount?: number;
  createdAt?: string;
  autoSync?: boolean;
  lastSyncedAt?: string | null;
}

function KnowledgeSources({ botId }: { botId: string }) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [url, setUrl] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const sInput =
    "w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500";

  const load = async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await axios.get(`/api/client/knowledge-sources?botId=${botId}`);
      setSources(res.data.sources || []);
    } catch (e) {
      console.error(e);
      setLoadErr("Couldn't load knowledge sources.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const toErr = (e: unknown, fallback: string) =>
    (axios.isAxiosError(e) && (e.response?.data?.message as string)) || fallback;

  const addUrl = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setErr("");
    try {
      await axios.post("/api/client/knowledge-sources", { botId, url: u, autoSync });
      setUrl("");
      await load();
    } catch (e) {
      setErr(toErr(e, "Couldn't add that URL."));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async (id: string) => {
    setSyncingId(id);
    setErr("");
    try {
      await axios.post(`/api/client/knowledge-sources/${id}/sync`);
      await load();
    } catch (e) {
      setErr(toErr(e, "Couldn't sync that source."));
    } finally {
      setSyncingId(null);
    }
  };

  const addFile = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("botId", botId);
      fd.append("file", file);
      await axios.post("/api/client/knowledge-sources", fd);
      await load();
    } catch (e) {
      setErr(toErr(e, "Upload failed. Please try again."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    try {
      await axios.delete(`/api/client/knowledge-sources/${id}`);
      setSources((l) => l.filter((s) => s._id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const statusBadge = (s: KnowledgeSource) => {
    if (s.status === "ready")
      return <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full">READY</span>;
    if (s.status === "error")
      return <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/15 px-2 py-0.5 rounded-full">ERROR</span>;
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15 px-2 py-0.5 rounded-full">
        <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        PROCESSING
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 hover:border-zinc-400 disabled:opacity-50 cursor-pointer transition-colors shrink-0"
        >
          <FileText size={15} /> Upload file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => addFile(e.target.files?.[0])}
        />
        <div className="relative flex-1">
          <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="https://your-site.com/faq"
            className={`${sInput} pl-9`}
          />
        </div>
        <button
          type="button"
          onClick={addUrl}
          disabled={busy || !url.trim()}
          className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer shrink-0"
        >
          {busy ? "…" : "Add"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
          Auto-sync this URL periodically
        </label>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Tip: add a <code className="font-mono">sitemap.xml</code> URL to ingest many pages at once.
        </span>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadErr ? (
        <ErrorState compact message={loadErr} onRetry={load} />
      ) : sources.length === 0 ? (
        <EmptyState
          compact
          icon={<FileText size={22} />}
          title="No sources yet"
          hint="Upload a document or add a page URL to expand what your bot knows."
        />
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s._id}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3"
            >
              <div className="shrink-0 text-zinc-400">
                {s.type === "url" ? <Link2 size={18} /> : <FileText size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{s.name || s.url || "Source"}</div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-2 flex-wrap">
                  <span className="uppercase">{s.type}</span>
                  {typeof s.chunkCount === "number" && <span>· {s.chunkCount} chunks</span>}
                  {typeof s.charCount === "number" && <span>· {s.charCount.toLocaleString()} chars</span>}
                  {s.autoSync && <span className="text-indigo-500 dark:text-indigo-400 font-semibold">· auto-sync</span>}
                  {s.lastSyncedAt && <span>· synced {fmtDate(s.lastSyncedAt)}</span>}
                </div>
                {s.status === "error" && s.error && (
                  <div className="text-[11px] text-red-500 mt-0.5 truncate">{s.error}</div>
                )}
              </div>
              {statusBadge(s)}
              {s.type === "url" && (
                <button
                  type="button"
                  onClick={() => syncNow(s._id)}
                  disabled={syncingId === s._id}
                  title="Sync now"
                  aria-label={`Sync ${s.name || s.url || "source"} now`}
                  className="shrink-0 text-zinc-400 hover:text-indigo-500 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={15} className={syncingId === s._id ? "animate-spin" : ""} />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(s._id)}
                title="Remove source"
                aria-label={`Remove ${s.name || s.url || "source"}`}
                className="shrink-0 text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A labeled checkbox row with an optional description. */
function ToggleRow({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="mt-1 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="text-sm font-semibold block">{title}</span>
        {desc && <span className="text-xs text-zinc-400 dark:text-zinc-500">{desc}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Canned responses manager (CRUD)                                     */
/* ------------------------------------------------------------------ */
function CannedManager() {
  const [items, setItems] = useState<CannedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [err, setErr] = useState("");
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const label = "text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1";
  const inputCls =
    "w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500";

  const toErr = (e: unknown, fallback: string) =>
    (axios.isAxiosError(e) && (e.response?.data?.message as string)) || fallback;

  const load = async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const r = await axios.get("/api/client/canned");
      setItems(r.data.items || []);
    } catch (e) {
      console.error(e);
      setLoadErr("Couldn't load canned replies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setShortcut("");
    setCategory("");
    setContent("");
  };

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setErr("");
    const body = {
      title: title.trim(),
      shortcut: shortcut.trim() || undefined,
      category: category.trim() || undefined,
      content: content.trim(),
    };
    try {
      if (editingId) {
        const res = await axios.patch(`/api/client/canned/${editingId}`, body);
        const updated: CannedItem = res.data.item;
        setItems((l) => l.map((x) => (x._id === editingId ? updated : x)));
      } else {
        const res = await axios.post("/api/client/canned", body);
        setItems((l) => [...l, res.data.item]);
      }
      resetForm();
    } catch (e) {
      setErr(toErr(e, "Couldn't save that reply."));
    } finally {
      setBusy(false);
    }
  };

  const edit = (c: CannedItem) => {
    setEditingId(c._id);
    setTitle(c.title);
    setShortcut(c.shortcut || "");
    setCategory(c.category || "");
    setContent(c.content);
  };

  const remove = async (id: string) => {
    try {
      await axios.delete(`/api/client/canned/${id}`);
      setItems((l) => l.filter((x) => x._id !== id));
      if (editingId === id) resetForm();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className={label}>Title</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Refund policy" />
        </div>
        <div className="space-y-1">
          <label className={label}>Shortcut (optional)</label>
          <input className={inputCls} value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="refund" />
        </div>
        <div className="space-y-1">
          <label className={label}>Category (optional)</label>
          <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Billing" />
        </div>
      </div>
      <div className="space-y-1">
        <label className={label}>Content</label>
        <textarea
          className={`${inputCls} h-24 resize-none`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="The message your agents can insert with one click…"
        />
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy || !title.trim() || !content.trim()}
          className="flex items-center gap-1.5 text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer"
        >
          <Plus size={16} /> {busy ? "Saving…" : editingId ? "Save changes" : "Add reply"}
        </button>
        {editingId && (
          <button
            onClick={resetForm}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadErr ? (
        <ErrorState compact message={loadErr} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<MessageSquareQuote size={22} />}
          title="No canned replies yet"
          hint="Create reusable replies your agents can insert in the Inbox with one click."
        />
      ) : (
        (() => {
          // Group by category, preserving first-seen order; uncategorised last.
          const groups = new Map<string, CannedItem[]>();
          for (const c of items) {
            const key = (c.category || "").trim() || "Uncategorised";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(c);
          }
          const ordered = [...groups.entries()].sort((a, b) => {
            if (a[0] === "Uncategorised") return 1;
            if (b[0] === "Uncategorised") return -1;
            return 0;
          });
          return (
            <div className="space-y-5">
              {ordered.map(([cat, list]) => (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{cat}</span>
                    <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">{list.length}</span>
                    <span className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                  <ul className="space-y-2">
                    {list.map((c) => (
                      <li key={c._id} className="flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                        <MessageSquareQuote size={16} className="text-zinc-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{c.title}</span>
                            {c.shortcut && <span className="text-[10px] font-mono text-zinc-400 shrink-0">/{c.shortcut}</span>}
                          </div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 line-clamp-2">{c.content}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => edit(c)}
                          title="Edit"
                          className="shrink-0 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer transition-colors text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c._id)}
                          title="Delete"
                          aria-label={`Delete canned reply ${c.title}`}
                          className="shrink-0 text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Test-your-bot sandbox                                               */
/* ------------------------------------------------------------------ */
const freshVisitorId = () =>
  "sandbox_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

function BotSandbox({ botId }: { botId: string }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "bot"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const visitorId = useRef(freshVisitorId());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, sending]);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setErr("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setSending(true);
    try {
      const res = await axios.post("/api/chat", {
        botId,
        message,
        visitorId: visitorId.current,
        stream: false,
      });
      const reply = (res.data?.reply as string) || "…";
      setMsgs((m) => [...m, { role: "bot", content: reply }]);
    } catch {
      setErr("Couldn't get a reply. Make sure the bot is active, then try again.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMsgs([]);
    setErr("");
    setInput("");
    visitorId.current = freshVisitorId();
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-800/40">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          <FlaskConical size={15} className="text-indigo-500" /> Sandbox chat
        </span>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer transition-colors"
          title="Reset conversation"
        >
          <RefreshCw size={13} /> Reset
        </button>
      </div>
      <div ref={scrollRef} className="h-72 overflow-y-auto p-4 space-y-3" aria-live="polite">
        {msgs.length === 0 && !sending && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              compact
              icon={<FlaskConical size={22} />}
              title="Try your bot"
              hint="Send a message below to see how your bot replies — no installation needed."
            />
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] sm:max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
              m.role === "user"
                ? "bg-black text-white dark:bg-white dark:text-zinc-900 ml-auto rounded-tr-sm"
                : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-tl-sm"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="max-w-[80%] px-3 py-2.5 rounded-2xl rounded-tl-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" />
            </span>
          </div>
        )}
      </div>
      {err && <p className="px-4 pb-2 text-xs text-red-500">{err}</p>}
      <div className="flex gap-2 p-3 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask your bot something…"
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-black dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="px-4 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 flex items-center gap-1 text-sm font-semibold cursor-pointer disabled:opacity-50"
        >
          <Send size={15} /> Send
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Install verification                                                */
/* ------------------------------------------------------------------ */
function InstallStatus({ botId }: { botId: string }) {
  const [state, setState] = useState<{ installed: boolean; lastSeenAt?: string; lastSeenDomain?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const check = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await axios.get(`/api/client/bots/${botId}/install-status`);
      setState(res.data);
    } catch {
      setErr("Couldn't check install status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  if (loading && !state) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (err)
    return <ErrorState compact message={err} onRetry={check} />;

  const installed = !!state?.installed;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 ${
        installed
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
      }`}
    >
      <span className={installed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
        {installed ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
      </span>
      <div className="min-w-0 flex-1">
        {installed ? (
          <>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Installed</div>
            <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
              Last seen{state?.lastSeenDomain ? ` on ${state.lastSeenDomain}` : ""}
              {state?.lastSeenAt ? ` ${fmtRelative(state.lastSeenAt)}` : ""}.
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold text-amber-700 dark:text-amber-300">Not detected yet</div>
            <div className="text-xs text-amber-700/80 dark:text-amber-300/80">
              Paste the snippet above before your site&apos;s closing &lt;/body&gt; tag, then open a page with the widget.
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={check}
        disabled={loading}
        className="shrink-0 flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/50 px-3 py-1.5 hover:border-zinc-400 cursor-pointer disabled:opacity-50"
      >
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Re-check
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Configure form                                                      */
/* ------------------------------------------------------------------ */
function ConfigureForm({ bot, onSaved }: { bot: Bot; onSaved: (b: Bot) => void }) {
  const [draft, setDraft] = useState<Bot>(bot);
  const [startersText, setStartersText] = useState((bot.starters || []).join("\n"));
  const [domainsText, setDomainsText] = useState((bot.allowedDomains || []).join("\n"));
  const [pagePathsText, setPagePathsText] = useState((bot.appearance.pagePaths || []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [copied, setCopied] = useState(false);

  const embedCode = `<script src="${APP_URL}/chatBot.js" data-bot-id="${bot._id}"></script>`;

  const set = (patch: Partial<Bot>) => setDraft((d) => ({ ...d, ...patch }));
  const setAppearance = (patch: Partial<Bot["appearance"]>) =>
    setDraft((d) => ({ ...d, appearance: { ...d.appearance, ...patch } }));
  const setAb = (patch: Partial<Bot["ab"]>) => setDraft((d) => ({ ...d, ab: { ...d.ab, ...patch } }));
  const preChatFields: PreChatField[] = draft.appearance.preChatFields ?? [];
  const setPreChatFields = (fields: PreChatField[]) => setAppearance({ preChatFields: fields });
  const applyPreset = (p: (typeof BOT_PRESETS)[number]) =>
    setAppearance({
      primaryColor: p.primaryColor,
      launcherShape: p.launcherShape,
      launcherIconKey: p.launcherIconKey,
      avatarIconKey: p.avatarIconKey,
    });

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveErr("");
    try {
      const starters = startersText.split("\n").map((s) => s.trim()).filter(Boolean);
      const allowedDomains = domainsText.split("\n").map((s) => s.trim()).filter(Boolean);
      const pagePaths = pagePathsText.split("\n").map((s) => s.trim()).filter(Boolean);
      const surveyQuestions = (draft.appearance.surveyQuestions || [])
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await axios.put(`/api/client/bots/${bot._id}`, {
        ...draft,
        starters,
        allowedDomains,
        appearance: { ...draft.appearance, pagePaths, surveyQuestions },
      });
      onSaved(res.data.bot);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } } };
      setSaveErr(ax?.response?.data?.message || "Couldn't save your changes. Please try again.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const label = "text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1";
  const inputCls = "w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500";
  const card = "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm space-y-4";

  return (
    <div className="space-y-6 pb-10">
      {/* Identity & Knowledge */}
      <section className={card}>
        <h2 className="text-lg font-bold">Identity &amp; Knowledge</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1"><label className={label}>Bot name (internal)</label><input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1"><label className={label}>Business name</label><input className={inputCls} value={draft.businessName} onChange={(e) => set({ businessName: e.target.value })} /></div>
        </div>
        <div className="space-y-1"><label className={label}>Support email</label><input className={inputCls} value={draft.supportEmail} onChange={(e) => set({ supportEmail: e.target.value })} placeholder="help@brand.com" /></div>
        <div className="space-y-1">
          <label className={label}>Knowledge base</label>
          <textarea className={`${inputCls} h-52 resize-none leading-relaxed`} value={draft.knowledge} onChange={(e) => set({ knowledge: e.target.value })} placeholder="Paste FAQs, policies, product info…" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          Bot is active (answering)
        </label>
      </section>

      {/* Knowledge sources */}
      <section className={card}>
        <h2 className="text-lg font-bold">Knowledge sources</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Upload documents (PDF, DOCX, TXT, MD) or add page URLs. They&apos;re ingested and searched alongside the knowledge base above.
        </p>
        <KnowledgeSources botId={bot._id} />
      </section>

      {/* Trained Q&A */}
      <section className={card}>
        <h2 className="text-lg font-bold">Trained Q&amp;A</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Answers added by resolving questions from the Overview tab. Edit or remove them here.
        </p>
        <TrainedAnswers botId={bot._id} />
      </section>

      {/* Appearance */}
      <section className={card}>
        <h2 className="text-lg font-bold">Appearance</h2>

        {/* Quick styles (presets) */}
        <div className="space-y-2">
          <label className={label}>Quick styles</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {BOT_PRESETS.map((p) => {
              const Ic = ICON_COMPONENTS[p.launcherIconKey];
              const a = draft.appearance;
              const active =
                a.primaryColor?.toLowerCase() === p.primaryColor.toLowerCase() &&
                a.launcherShape === p.launcherShape &&
                a.launcherIconKey === p.launcherIconKey &&
                a.avatarIconKey === p.avatarIconKey;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`relative text-left rounded-xl border p-3 transition-all cursor-pointer ${
                    active
                      ? "border-black dark:border-white ring-2 ring-black/10 dark:ring-white/20"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {active && <Check size={14} className="absolute top-2 right-2 text-emerald-500" />}
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex items-center justify-center w-9 h-9 text-white shrink-0"
                      style={{ background: p.primaryColor, borderRadius: LAUNCHER_SHAPE_RADIUS[p.launcherShape] }}
                    >
                      <Ic size={18} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{p.name}</div>
                      <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{p.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <label className={label}>Live preview</label>
          <LauncherPreview appearance={draft.appearance} />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Primary color</label>
            <ColorSelect
              value={draft.appearance.primaryColor}
              onChange={(v) => setAppearance({ primaryColor: v })}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Launcher shape</label>
            <ShapeSelect
              value={draft.appearance.launcherShape}
              onChange={(v) => setAppearance({ launcherShape: v })}
              color={draft.appearance.primaryColor}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Position</label>
            <Dropdown
              value={draft.appearance.position}
              onChange={(v) => setAppearance({ position: v as "left" | "right" })}
              options={[
                { value: "right", label: "Bottom right" },
                { value: "left", label: "Bottom left" },
              ]}
            />
          </div>
        </div>

        {/* Spacing from screen edges */}
        <div className="space-y-1.5">
          <label className={label}>Spacing from edges</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <input
                type="number"
                min={0}
                max={200}
                value={draft.appearance.offsetSide}
                onChange={(e) =>
                  setAppearance({ offsetSide: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })
                }
                className={`${inputCls} pr-24`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">
                px from side
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={200}
                value={draft.appearance.offsetBottom}
                onChange={(e) =>
                  setAppearance({ offsetBottom: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })
                }
                className={`${inputCls} pr-28`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">
                px from bottom
              </span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">
            Nudge the launcher inward to avoid overlapping other floating buttons (cookie banners, back-to-top, etc.).
          </p>
        </div>

        {/* Launcher icon & avatar */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Launcher icon</label>
            <IconSelect
              value={draft.appearance.launcherIconKey}
              onChange={(v) => setAppearance({ launcherIconKey: v })}
              color={draft.appearance.primaryColor}
              noneLabel="Custom emoji"
            />
            {!draft.appearance.launcherIconKey && (
              <input
                className={inputCls}
                value={draft.appearance.launcherIcon}
                onChange={(e) => setAppearance({ launcherIcon: e.target.value })}
                placeholder="Emoji, e.g. 💬"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <label className={label}>Bot avatar</label>
            <IconSelect
              value={draft.appearance.avatarIconKey}
              onChange={(v) => setAppearance({ avatarIconKey: v })}
              color={draft.appearance.primaryColor}
              noneLabel="Default robot"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={label}>Avatar image (overrides the icon)</label>
          <AvatarUpload
            value={draft.appearance.avatarUrl}
            publicId={draft.avatarPublicId}
            onUploaded={(url, pid) =>
              setDraft((d) => ({ ...d, avatarPublicId: pid, appearance: { ...d.appearance, avatarUrl: url } }))
            }
            onClear={() =>
              setDraft((d) => ({ ...d, avatarPublicId: "", appearance: { ...d.appearance, avatarUrl: "" } }))
            }
          />
          <input
            className={`${inputCls} mt-1`}
            value={draft.appearance.avatarUrl}
            onChange={(e) => setAppearance({ avatarUrl: e.target.value })}
            placeholder="…or paste an image URL"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1"><label className={label}>Header title</label><input className={inputCls} value={draft.appearance.botName} onChange={(e) => setAppearance({ botName: e.target.value })} /></div>
          <div className="space-y-1"><label className={label}>Welcome message</label><input className={inputCls} value={draft.appearance.welcomeMessage} onChange={(e) => setAppearance({ welcomeMessage: e.target.value })} /></div>
        </div>
      </section>

      {/* Behavior & availability */}
      <section className={card}>
        <h2 className="text-lg font-bold">Behavior &amp; availability</h2>

        {/* Theme & language */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Widget theme</label>
            <Dropdown
              value={draft.appearance.theme || "auto"}
              onChange={(v) => setAppearance({ theme: v as Bot["appearance"]["theme"] })}
              leftIcon={<Sparkles size={15} />}
              options={[
                { value: "auto", label: "Auto (match site)" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Language</label>
            <Dropdown
              value={draft.appearance.language || "en"}
              onChange={(v) => setAppearance({ language: v })}
              leftIcon={<Globe size={15} />}
              options={[
                { value: "en", label: "English" },
                { value: "hi", label: "Hindi — हिन्दी" },
                { value: "bn", label: "Bengali — বাংলা" },
                { value: "ta", label: "Tamil — தமிழ்" },
                { value: "te", label: "Telugu — తెలుగు" },
                { value: "mr", label: "Marathi — मराठी" },
                { value: "gu", label: "Gujarati — ગુજરાતી" },
                { value: "kn", label: "Kannada — ಕನ್ನಡ" },
                { value: "ml", label: "Malayalam — മലയാളം" },
                { value: "or", label: "Odia — ଓଡ଼ିଆ" },
                { value: "as", label: "Assamese — অসমীয়া" },
                { value: "pa", label: "Punjabi — ਪੰਜਾਬੀ" },
              ]}
            />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
              Sets the widget&apos;s button/label language. The bot itself auto-detects and
              replies in whatever language &amp; script (native or Hinglish-style) each visitor uses.
            </p>
          </div>
        </div>

        {/* Proactive message */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={!!draft.appearance.proactiveEnabled}
              onChange={(e) => setAppearance({ proactiveEnabled: e.target.checked })}
            />
            Proactive message
          </label>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-1 ml-6">
            Pop a message open automatically after the visitor has been on the page a while.
          </p>
          {draft.appearance.proactiveEnabled && (
            <div className="ml-6 space-y-4">
              <div className="grid sm:grid-cols-[1fr_160px] gap-4">
                <div className="space-y-1">
                  <label className={label}>Message</label>
                  <input
                    className={inputCls}
                    value={draft.appearance.proactiveMessage || ""}
                    onChange={(e) => setAppearance({ proactiveMessage: e.target.value })}
                    placeholder="Need a hand? I'm here to help 👋"
                  />
                </div>
                <div className="space-y-1">
                  <label className={label}>Delay</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={draft.appearance.proactiveDelay ?? 0}
                      onChange={(e) =>
                        setAppearance({ proactiveDelay: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })
                      }
                      className={`${inputCls} pr-16`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">
                      seconds
                    </span>
                  </div>
                </div>
              </div>

              {/* Trigger + (scroll) depth */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={label}>Trigger</label>
                  <Dropdown
                    value={draft.appearance.proactiveTrigger || "delay"}
                    onChange={(v) =>
                      setAppearance({ proactiveTrigger: v as Bot["appearance"]["proactiveTrigger"] })
                    }
                    leftIcon={<Zap size={15} />}
                    options={[
                      { value: "delay", label: "After the delay" },
                      { value: "scroll", label: "On scroll depth" },
                      { value: "exit", label: "On exit intent" },
                    ]}
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
                    When the proactive message opens. Exit intent fires when the visitor moves to leave the page.
                  </p>
                </div>
                {(draft.appearance.proactiveTrigger || "delay") === "scroll" && (
                  <div className="space-y-1.5">
                    <label className={label}>
                      Scroll depth · {Math.max(0, Math.min(100, draft.appearance.proactiveScrollPercent ?? 50))}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.max(0, Math.min(100, draft.appearance.proactiveScrollPercent ?? 50))}
                      onChange={(e) =>
                        setAppearance({
                          proactiveScrollPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        })
                      }
                      aria-label="Scroll depth percent"
                      className="w-full accent-black dark:accent-white cursor-pointer"
                    />
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
                      Open once the visitor scrolls this far down the page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scheduled availability */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={!!draft.appearance.availabilityEnabled}
              onChange={(e) => setAppearance({ availabilityEnabled: e.target.checked })}
            />
            Scheduled availability
          </label>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-1 ml-6">
            Show an offline message outside your support hours.
          </p>
          {draft.appearance.availabilityEnabled && (
            <div className="ml-6 space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className={label}>Timezone</label>
                  <input
                    className={inputCls}
                    value={draft.appearance.availabilityTimezone || ""}
                    onChange={(e) => setAppearance({ availabilityTimezone: e.target.value })}
                    placeholder="e.g. Asia/Kolkata"
                  />
                </div>
                <div className="space-y-1">
                  <label className={label}>Start</label>
                  <input
                    type="time"
                    className={inputCls}
                    value={draft.appearance.availabilityStart || ""}
                    onChange={(e) => setAppearance({ availabilityStart: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className={label}>End</label>
                  <input
                    type="time"
                    className={inputCls}
                    value={draft.appearance.availabilityEnd || ""}
                    onChange={(e) => setAppearance({ availabilityEnd: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={label}>Days available</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d, i) => {
                    const on = (draft.appearance.availabilityDays || []).includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const cur = draft.appearance.availabilityDays || [];
                          const next = cur.includes(i)
                            ? cur.filter((x) => x !== i)
                            : [...cur, i].sort((a, b) => a - b);
                          setAppearance({ availabilityDays: next });
                        }}
                        className={`w-11 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          on
                            ? "border-transparent bg-black text-white dark:bg-white dark:text-zinc-900"
                            : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <label className={label}>Offline message</label>
                <input
                  className={inputCls}
                  value={draft.appearance.offlineMessage || ""}
                  onChange={(e) => setAppearance({ offlineMessage: e.target.value })}
                  placeholder="We're away right now — leave a message and we'll reply soon."
                />
              </div>
            </div>
          )}
        </div>

        {/* Help center + language switcher */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 grid sm:grid-cols-2 gap-3">
          <ToggleRow
            checked={!!draft.appearance.helpCenterEnabled}
            onChange={(v) => setAppearance({ helpCenterEnabled: v })}
            title="In-widget help center"
            desc="Add an FAQ / help search that draws from your Trained Q&A."
          />
          <ToggleRow
            checked={!!draft.appearance.languageSwitcher}
            onChange={(v) => setAppearance({ languageSwitcher: v })}
            title="Language switcher"
            desc="Let visitors change the widget's UI language themselves."
          />
        </div>

        {/* In-chat survey */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <ToggleRow
            checked={!!draft.appearance.surveyEnabled}
            onChange={(v) => setAppearance({ surveyEnabled: v })}
            title="In-chat survey"
            desc="Ask visitors a few short questions during the conversation."
          />
          {draft.appearance.surveyEnabled && (
            <div className="ml-6 space-y-2">
              {(draft.appearance.surveyQuestions || []).length === 0 && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">No questions yet — add one below.</p>
              )}
              {(draft.appearance.surveyQuestions || []).map((qn, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    value={qn}
                    onChange={(e) => {
                      const next = [...(draft.appearance.surveyQuestions || [])];
                      next[i] = e.target.value;
                      setAppearance({ surveyQuestions: next });
                    }}
                    placeholder={`Question ${i + 1} (e.g. How did you hear about us?)`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAppearance({
                        surveyQuestions: (draft.appearance.surveyQuestions || []).filter((_, j) => j !== i),
                      })
                    }
                    title="Remove question"
                    aria-label={`Remove survey question ${i + 1}`}
                    className="text-zinc-400 hover:text-red-500 cursor-pointer transition-colors shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setAppearance({ surveyQuestions: [...(draft.appearance.surveyQuestions || []), ""] })
                }
                className="flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:border-zinc-400 cursor-pointer"
              >
                <Plus size={14} /> Add question
              </button>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-0.5">
                Blank questions are dropped when saved.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Visitor experience */}
      <section className={card}>
        <h2 className="text-lg font-bold">Visitor experience</h2>

        {/* Feature toggles */}
        <div className="space-y-1.5">
          <label className={label}>Chat features</label>
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <ToggleRow
              checked={!!draft.appearance.showCitations}
              onChange={(v) => setAppearance({ showCitations: v })}
              title="Show source citations"
              desc="Reveal which knowledge sources an answer came from."
            />
            <ToggleRow
              checked={!!draft.appearance.quickRepliesEnabled}
              onChange={(v) => setAppearance({ quickRepliesEnabled: v })}
              title="Quick replies"
              desc="Offer tappable suggested replies in-chat."
            />
            <ToggleRow
              checked={!!draft.appearance.voiceInput}
              onChange={(v) => setAppearance({ voiceInput: v })}
              title="Voice input"
              desc="Let visitors dictate messages with the mic."
            />
            <ToggleRow
              checked={!!draft.appearance.ttsEnabled}
              onChange={(v) => setAppearance({ ttsEnabled: v })}
              title="Read answers aloud (TTS)"
              desc="Add a play button to spoken bot replies."
            />
            <ToggleRow
              checked={!!draft.appearance.csatEnabled}
              onChange={(v) => setAppearance({ csatEnabled: v })}
              title="Post-chat rating (CSAT)"
              desc="Ask visitors to rate the conversation when it ends."
            />
          </div>
        </div>

        {/* Booking */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <ToggleRow
            checked={!!draft.appearance.bookingEnabled}
            onChange={(v) => setAppearance({ bookingEnabled: v })}
            title="Meeting booking"
            desc="Show a button that opens your scheduling link."
          />
          {draft.appearance.bookingEnabled && (
            <div className="grid sm:grid-cols-2 gap-4 ml-6">
              <div className="space-y-1">
                <label className={label}>Booking URL</label>
                <input
                  className={inputCls}
                  value={draft.appearance.bookingUrl || ""}
                  onChange={(e) => setAppearance({ bookingUrl: e.target.value })}
                  placeholder="https://cal.com/you/30min"
                />
              </div>
              <div className="space-y-1">
                <label className={label}>Button label</label>
                <input
                  className={inputCls}
                  value={draft.appearance.bookingLabel || ""}
                  onChange={(e) => setAppearance({ bookingLabel: e.target.value })}
                  placeholder="Book a call"
                />
              </div>
            </div>
          )}
        </div>

        {/* Consent */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <ToggleRow
            checked={!!draft.appearance.consentEnabled}
            onChange={(v) => setAppearance({ consentEnabled: v })}
            title="Consent notice"
            desc="Require visitors to accept a notice before chatting."
          />
          {draft.appearance.consentEnabled && (
            <div className="ml-6 space-y-1">
              <label className={label}>Consent text</label>
              <textarea
                className={`${inputCls} h-20 resize-none`}
                value={draft.appearance.consentText || ""}
                onChange={(e) => setAppearance({ consentText: e.target.value })}
                placeholder="By chatting you agree to our privacy policy…"
              />
            </div>
          )}
        </div>

        {/* Pre-chat form */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <ToggleRow
            checked={!!draft.appearance.preChatEnabled}
            onChange={(v) => setAppearance({ preChatEnabled: v })}
            title="Pre-chat form"
            desc="Collect details before the conversation starts."
          />
          {draft.appearance.preChatEnabled && (
            <div className="ml-6 space-y-2">
              {preChatFields.length === 0 && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">No fields yet — add one below.</p>
              )}
              {preChatFields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${inputCls} flex-1 min-w-[120px]`}
                    value={f.label}
                    onChange={(e) => {
                      const next = [...preChatFields];
                      next[i] = { ...f, label: e.target.value };
                      setPreChatFields(next);
                    }}
                    placeholder="Label (e.g. Full name)"
                  />
                  <input
                    className={`${inputCls} w-32`}
                    value={f.key}
                    onChange={(e) => {
                      const next = [...preChatFields];
                      next[i] = { ...f, key: e.target.value.replace(/\s+/g, "_") };
                      setPreChatFields(next);
                    }}
                    placeholder="key"
                  />
                  <div className="w-32">
                    <Dropdown
                      value={f.type || "text"}
                      onChange={(v) => {
                        const next = [...preChatFields];
                        next[i] = { ...f, type: v };
                        setPreChatFields(next);
                      }}
                      options={[
                        { value: "text", label: "Text" },
                        { value: "email", label: "Email" },
                        { value: "tel", label: "Phone" },
                        { value: "number", label: "Number" },
                      ]}
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => {
                        const next = [...preChatFields];
                        next[i] = { ...f, required: e.target.checked };
                        setPreChatFields(next);
                      }}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setPreChatFields(preChatFields.filter((_, j) => j !== i))}
                    title="Remove field"
                    aria-label={`Remove field ${f.label || i + 1}`}
                    className="text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPreChatFields([...preChatFields, { key: "", label: "", type: "text", required: false }])}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:border-zinc-400 cursor-pointer"
              >
                <Plus size={14} /> Add field
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Security & data */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-zinc-400" />
          <h2 className="text-lg font-bold">Security &amp; data</h2>
        </div>

        <div className="space-y-1">
          <label className={label}>Allowed domains</label>
          <textarea
            className={`${inputCls} h-24 resize-none font-mono text-xs`}
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            placeholder={"example.com\napp.example.com"}
          />
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
            One domain per line. Leave empty to allow the widget on any site.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={label}>
              Confidence threshold · {(draft.confidenceThreshold ?? 0).toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.confidenceThreshold ?? 0}
              onChange={(e) => set({ confidenceThreshold: Number(e.target.value) })}
              className="w-full accent-black dark:accent-white cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
              Below this score the bot hands off / says it isn&apos;t sure. 0 = always answer.
            </p>
          </div>
          <div className="space-y-1">
            <label className={label}>Data retention (days)</label>
            <input
              type="number"
              min={0}
              value={draft.dataRetentionDays ?? 0}
              onChange={(e) => set({ dataRetentionDays: Math.max(0, Number(e.target.value) || 0) })}
              className={inputCls}
            />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
              Auto-delete conversations older than this. 0 = keep forever.
            </p>
          </div>
        </div>
      </section>

      {/* Canned responses */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <MessageSquareQuote size={18} className="text-zinc-400" />
          <h2 className="text-lg font-bold">Canned responses</h2>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Reusable replies your agents can insert in the Inbox with one click.
        </p>
        <CannedManager />
      </section>

      {/* Conversation starters */}
      <section className={card}>
        <h2 className="text-lg font-bold">Conversation starters</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">One per line. Shown as clickable chips when the chat opens (max 4).</p>
        <textarea className={`${inputCls} h-28 resize-none`} value={startersText} onChange={(e) => setStartersText(e.target.value)} placeholder={"What are your hours?\nDo you offer refunds?\nHow do I track my order?"} />
      </section>

      {/* Tone & A/B */}
      <section className={card}>
        <h2 className="text-lg font-bold">Tone &amp; A/B testing</h2>
        <div className="space-y-1">
          <label className={label}>Tone</label>
          <Dropdown
            value={draft.tone}
            onChange={(v) => set({ tone: v as Bot["tone"] })}
            options={[
              { value: "friendly", label: "Friendly" },
              { value: "professional", label: "Professional" },
              { value: "concise", label: "Concise" },
              { value: "playful", label: "Playful" },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.ab.enabled} onChange={(e) => setAb({ enabled: e.target.checked })} />
          Enable A/B testing (randomly assign each new visitor variant A or B)
        </label>
        {draft.ab.enabled && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1"><label className={label}>Variant A extra instructions</label><textarea className={`${inputCls} h-24 resize-none`} value={draft.ab.promptA} onChange={(e) => setAb({ promptA: e.target.value })} placeholder="e.g. Keep answers very short." /></div>
            <div className="space-y-1"><label className={label}>Variant B extra instructions</label><textarea className={`${inputCls} h-24 resize-none`} value={draft.ab.promptB} onChange={(e) => setAb({ promptB: e.target.value })} placeholder="e.g. Add a friendly emoji and a follow-up question." /></div>
          </div>
        )}
      </section>

      {/* Advanced */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-zinc-400" />
          <h2 className="text-lg font-bold">Advanced</h2>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Fine-tune messaging, branding and where the widget appears. Most sites can leave these as-is.
        </p>

        <div className="space-y-1">
          <label className={label}>Away message</label>
          <textarea
            className={`${inputCls} h-20 resize-none`}
            value={draft.appearance.awayMessage || ""}
            onChange={(e) => setAppearance({ awayMessage: e.target.value })}
            placeholder="We're away at the moment — leave your question and we'll get back to you."
          />
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
            Shown when no agent is available (e.g. after a human handoff request outside hours).
          </p>
        </div>

        <ToggleRow
          checked={draft.appearance.showBranding !== false}
          onChange={(v) => setAppearance({ showBranding: v })}
          title="Show “Powered by” branding"
          desc="Display a small Sahayak AI credit in the widget footer."
        />

        <div className="space-y-1.5">
          <label className={label}>Where to show the widget</label>
          <div className="grid sm:grid-cols-[180px_1fr] gap-3">
            <Dropdown
              value={draft.appearance.pagePathsMode || "show"}
              onChange={(v) => setAppearance({ pagePathsMode: v as "show" | "hide" })}
              options={[
                { value: "show", label: "Show only on these" },
                { value: "hide", label: "Hide on these" },
              ]}
            />
            <textarea
              className={`${inputCls} h-24 resize-none font-mono text-xs`}
              value={pagePathsText}
              onChange={(e) => setPagePathsText(e.target.value)}
              placeholder={"/pricing\n/support/*\n/blog/**"}
            />
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
            One URL path glob per line (e.g. <code className="font-mono">/support/*</code>). Leave empty to show everywhere.
          </p>
        </div>

        <div className="space-y-1">
          <label className={label}>Custom CSS</label>
          <textarea
            className={`${inputCls} h-28 resize-none font-mono text-xs`}
            value={draft.appearance.customCss || ""}
            onChange={(e) => setAppearance({ customCss: e.target.value })}
            placeholder={".sahayak-widget { border-radius: 20px; }"}
            spellCheck={false}
          />
          <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 ml-1">
            <AlertTriangle size={12} className="shrink-0" />
            Advanced — invalid or heavy CSS can break the widget&apos;s layout.
          </p>
        </div>
      </section>

      {/* Test your bot */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-zinc-400" />
          <h2 className="text-lg font-bold">Test your bot</h2>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Chat with your bot here to try its answers before installing it anywhere. Save your changes first so the sandbox reflects them.
        </p>
        <BotSandbox botId={bot._id} />
      </section>

      {/* Embed */}
      <section className={card}>
        <h2 className="text-lg font-bold">Embed this bot</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">Paste before the closing &lt;/body&gt; tag on your site.</p>
        <div className="relative">
          <pre className="bg-zinc-900 dark:bg-black text-emerald-300 text-xs rounded-xl p-4 overflow-x-auto border border-zinc-800 dark:border-zinc-700">{embedCode}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="absolute top-2 right-2 flex items-center gap-1 text-xs bg-white/10 text-white px-2 py-1 rounded-md hover:bg-white/20"
          >
            {copied ? <><CopyCheck size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
        {/* Install verification */}
        <div className="space-y-1.5 pt-2">
          <label className={label}>Installation</label>
          <InstallStatus botId={bot._id} />
        </div>
      </section>

      {/* Sticky save bar */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {saveErr && (
          <div className="max-w-xs rounded-xl bg-red-600 text-white text-xs font-medium px-4 py-2.5 shadow-xl shadow-black/20">
            {saveErr}
          </div>
        )}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50 cursor-pointer shadow-xl shadow-black/20"
        >
          {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? "Saved ✓" : <><Save size={18} /> Save changes</>}
        </motion.button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team panel                                                          */
/* ------------------------------------------------------------------ */
function TeamPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const label = "text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1";
  const inputCls =
    "w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500";
  const card =
    "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm space-y-4";

  const is403 = (e: unknown) => axios.isAxiosError(e) && e.response?.status === 403;

  const load = async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await axios.get("/api/client/team");
      setMembers(res.data.members || []);
      setForbidden(false);
    } catch (e) {
      if (is403(e)) setForbidden(true);
      else {
        console.error(e);
        setLoadErr("Couldn't load team members.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setAdding(true);
    setErr("");
    try {
      const res = await axios.post("/api/client/team", { name, email, password });
      setMembers((m) => [...m, res.data.member]);
      setName("");
      setEmail("");
      setPassword("");
    } catch (e) {
      if (is403(e)) setForbidden(true);
      else setErr((axios.isAxiosError(e) && (e.response?.data?.message as string)) || "Couldn't add member.");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await axios.delete(`/api/client/team/${id}`);
      setMembers((m) => m.filter((x) => x._id !== id));
    } catch (e) {
      if (is403(e)) setForbidden(true);
      else console.error(e);
    }
  };

  const setPermission = async (id: string, agentPermission: "viewer" | "agent" | "manager") => {
    const prev = members;
    setMembers((m) => m.map((x) => (x._id === id ? { ...x, agentPermission } : x)));
    try {
      await axios.patch(`/api/client/team/${id}`, { agentPermission });
    } catch (e) {
      setMembers(prev); // revert on failure
      if (is403(e)) setForbidden(true);
      else console.error(e);
    }
  };

  const permissionOptions = [
    { value: "viewer", label: "Viewer — read only" },
    { value: "agent", label: "Agent — can reply" },
    { value: "manager", label: "Manager — full access" },
  ];

  if (forbidden)
    return (
      <div className={card}>
        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <ShieldCheck size={18} className="text-zinc-400" />
          <p className="text-sm">Only the workspace owner can manage the team.</p>
        </div>
      </div>
    );

  return (
    <div className="space-y-6 max-w-2xl">
      <section className={card}>
        <h2 className="text-lg font-bold">Invite a teammate</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Agents can view the inbox and reply to conversations.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1"><label className={label}>Name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan" /></div>
          <div className="space-y-1"><label className={label}>Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@brand.com" /></div>
          <div className="space-y-1"><label className={label}>Password</label><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" /></div>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button
          onClick={add}
          disabled={adding || !name.trim() || !email.trim() || !password.trim()}
          className="flex items-center gap-1.5 text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer"
        >
          <Plus size={16} /> {adding ? "Adding…" : "Add member"}
        </button>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">Members</h2>
        {loading ? (
          <SkeletonList rows={3} />
        ) : loadErr ? (
          <ErrorState compact message={loadErr} onRetry={load} />
        ) : members.length === 0 ? (
          <EmptyState
            compact
            icon={<Users size={22} />}
            title="No teammates yet"
            hint="Invite an agent above so they can help answer conversations in the Inbox."
          />
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m._id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                    {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{m.name || "—"}</div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{m.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(m._id)}
                    title="Remove member"
                    aria-label={`Remove ${m.name || m.email}`}
                    className="shrink-0 text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="sm:max-w-[240px] ml-12">
                  <Dropdown
                    value={m.agentPermission || "agent"}
                    onChange={(v) => setPermission(m._id, v as "viewer" | "agent" | "manager")}
                    leftIcon={<ShieldCheck size={14} />}
                    options={permissionOptions}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account, privacy & GDPR                                             */
/* ------------------------------------------------------------------ */
/** Password input with a show/hide eye toggle. `inputCls` should include the
 * caller's base styling; this adds right padding for the icon. */
function PasswordInput({
  value,
  onChange,
  inputCls,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className={`${inputCls} pr-11`}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        suppressHydrationWarning
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
        suppressHydrationWarning
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition cursor-pointer"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function AccountPanel({ email, retentionDays }: { email: string; retentionDays?: number }) {
  const label = "text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1";
  const inputCls =
    "w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500";
  const card =
    "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm space-y-4";

  const toErr = (e: unknown, fallback: string) =>
    (axios.isAxiosError(e) && (e.response?.data?.message as string)) || fallback;

  type Note = { ok: boolean; text: string } | null;

  // Change password. `hasPassword` is null until the account status loads;
  // Google-only accounts (hasPassword === false) set a first password instead
  // of changing one, so no "current password" is required.
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNote, setPwNote] = useState<Note>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/client/account")
      .then((res) => {
        if (!cancelled) setHasPassword(Boolean(res.data?.hasPassword));
      })
      .catch(() => {
        // Fall back to the change flow (current + new) if status can't load.
        if (!cancelled) setHasPassword(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needsCurrent = hasPassword !== false; // show "current" unless we know there's none

  const changePassword = async () => {
    if (!newPw || (needsCurrent && !curPw)) return;
    setPwBusy(true);
    setPwNote(null);
    try {
      await axios.post("/api/client/account/password", {
        currentPassword: needsCurrent ? curPw : "",
        newPassword: newPw,
      });
      setPwNote({
        ok: true,
        text: hasPassword === false ? "Password set." : "Password updated.",
      });
      setCurPw("");
      setNewPw("");
      setHasPassword(true);
    } catch (e) {
      setPwNote({ ok: false, text: toErr(e, "Couldn't update password.") });
    } finally {
      setPwBusy(false);
    }
  };

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNote, setEmailNote] = useState<Note>(null);

  const changeEmail = async () => {
    if (!newEmail.trim() || !emailPw) return;
    setEmailBusy(true);
    setEmailNote(null);
    try {
      await axios.post("/api/client/account/email", { email: newEmail.trim(), password: emailPw });
      setEmailNote({ ok: true, text: "Email updated." });
      setEmailPw("");
    } catch (e) {
      setEmailNote({ ok: false, text: toErr(e, "Couldn't update email.") });
    } finally {
      setEmailBusy(false);
    }
  };

  // Privacy — export / delete visitor data
  const [subject, setSubject] = useState("");
  const [redact, setRedact] = useState(false);
  const [privNote, setPrivNote] = useState<Note>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);

  const subjectParams = () => {
    const v = subject.trim();
    const params = new URLSearchParams();
    if (v.includes("@")) params.set("email", v);
    else params.set("visitorId", v);
    return params;
  };

  const exportData = () => {
    if (!subject.trim()) return;
    const params = subjectParams();
    if (redact) params.set("redact", "1");
    const a = document.createElement("a");
    a.href = `/api/client/privacy/export?${params.toString()}`;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const deleteVisitor = async () => {
    if (!subject.trim()) return;
    if (!window.confirm(`Permanently delete all data for "${subject.trim()}"? This cannot be undone.`)) return;
    setDelBusy(true);
    setPrivNote(null);
    try {
      const v = subject.trim();
      await axios.post("/api/client/privacy/delete", v.includes("@") ? { email: v } : { visitorId: v });
      setPrivNote({ ok: true, text: "Visitor data deleted." });
      setSubject("");
    } catch (e) {
      setPrivNote({ ok: false, text: toErr(e, "Couldn't delete that visitor's data.") });
    } finally {
      setDelBusy(false);
    }
  };

  const purgeOld = async () => {
    if (!window.confirm("Purge data older than your retention window now?")) return;
    setPurgeBusy(true);
    setPrivNote(null);
    try {
      const res = await axios.post("/api/client/privacy/purge");
      const n = res.data?.deleted;
      setPrivNote({ ok: true, text: typeof n === "number" ? `Purged ${n} old records.` : "Old data purged." });
    } catch (e) {
      setPrivNote({ ok: false, text: toErr(e, "Couldn't purge old data.") });
    } finally {
      setPurgeBusy(false);
    }
  };

  // Delete account
  const [delPw, setDelPw] = useState("");
  const [delConfirm, setDelConfirm] = useState(false);
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctNote, setAcctNote] = useState<Note>(null);

  const deleteAccount = async () => {
    if (!delPw) return;
    setAcctBusy(true);
    setAcctNote(null);
    try {
      await axios.delete("/api/client/account", { data: { password: delPw } });
      window.location.href = "/";
    } catch (e) {
      setAcctNote({ ok: false, text: toErr(e, "Couldn't delete account.") });
      setAcctBusy(false);
    }
  };

  const noteCls = (n: Note) =>
    `text-xs ${n?.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`;

  return (
    <div className="space-y-6 max-w-2xl pb-10">
      {/* Change / set password */}
      <section className={card}>
        <h2 className="text-lg font-bold">
          {hasPassword === false ? "Set a password" : "Change password"}
        </h2>
        {hasPassword === false && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You signed in with Google, so your account has no password yet. Set
            one to also sign in with your email &amp; password.
          </p>
        )}
        <div className={needsCurrent ? "grid sm:grid-cols-2 gap-4" : ""}>
          {needsCurrent && (
            <div className="space-y-1">
              <label className={label}>Current password</label>
              <PasswordInput inputCls={inputCls} value={curPw} onChange={setCurPw} />
            </div>
          )}
          <div className="space-y-1">
            <label className={label}>New password</label>
            <PasswordInput inputCls={inputCls} value={newPw} onChange={setNewPw} />
          </div>
        </div>
        {pwNote && <p className={noteCls(pwNote)}>{pwNote.text}</p>}
        <button
          onClick={changePassword}
          disabled={pwBusy || !newPw || (needsCurrent && !curPw)}
          className="text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer"
        >
          {pwBusy
            ? "Saving…"
            : hasPassword === false
              ? "Set password"
              : "Update password"}
        </button>
      </section>

      {/* Change email */}
      <section className={card}>
        <h2 className="text-lg font-bold">Change email</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">Current: {email}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={label}>New email</label>
            <input className={inputCls} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@brand.com" />
          </div>
          <div className="space-y-1">
            <label className={label}>Confirm with password</label>
            <input className={inputCls} type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
          </div>
        </div>
        {emailNote && <p className={noteCls(emailNote)}>{emailNote.text}</p>}
        <button
          onClick={changeEmail}
          disabled={emailBusy || !newEmail.trim() || !emailPw}
          className="text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer"
        >
          {emailBusy ? "Saving…" : "Update email"}
        </button>
      </section>

      {/* Notification preferences */}
      <NotificationPrefs />

      {/* Privacy / GDPR */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-zinc-400" />
          <h2 className="text-lg font-bold">Privacy &amp; GDPR</h2>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
          Export or erase an individual visitor&apos;s data on request.
        </p>
        <div className="space-y-1">
          <label className={label}>Visitor ID or email</label>
          <input
            className={inputCls}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="visitor_abc123 or visitor@example.com"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
          Redact PII in export
        </label>
        {privNote && <p className={noteCls(privNote)}>{privNote.text}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportData}
            disabled={!subject.trim()}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 hover:border-zinc-400 disabled:opacity-50 cursor-pointer"
          >
            <Download size={15} /> Export data
          </button>
          <button
            onClick={deleteVisitor}
            disabled={delBusy || !subject.trim()}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-xl border border-red-200 text-red-600 dark:border-red-500/30 dark:text-red-400 px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
          >
            <Trash2 size={15} /> {delBusy ? "Deleting…" : "Delete visitor data"}
          </button>
        </div>
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
            Retention: {retentionDays ? `delete data older than ${retentionDays} days` : "keep forever (set a window in Configure → Security)"}.
          </p>
          <button
            onClick={purgeOld}
            disabled={purgeBusy}
            className="flex items-center gap-1.5 text-sm font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 hover:border-zinc-400 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={purgeBusy ? "animate-spin" : ""} /> {purgeBusy ? "Purging…" : "Purge old data now"}
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200/70 dark:border-red-500/30 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-bold">Delete account</h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-2">
          Permanently deletes your workspace, bots, conversations and team. This cannot be undone.
        </p>
        <div className="space-y-1 max-w-sm">
          <label className={label}>Confirm with password</label>
          <input className={inputCls} type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={delConfirm} onChange={(e) => setDelConfirm(e.target.checked)} />
          I understand this is permanent.
        </label>
        {acctNote && <p className={noteCls(acctNote)}>{acctNote.text}</p>}
        <button
          onClick={deleteAccount}
          disabled={acctBusy || !delPw || !delConfirm}
          className="flex items-center gap-1.5 text-sm font-bold rounded-xl bg-red-600 text-white px-5 py-2.5 hover:bg-red-700 disabled:opacity-50 cursor-pointer"
        >
          <Trash2 size={16} /> {acctBusy ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notification preferences (in Account)                               */
/* ------------------------------------------------------------------ */
const NOTIF_OPTIONS: { key: string; title: string; desc: string }[] = [
  { key: "browser", title: "Browser alerts", desc: "Show a desktop notification for important inbox events." },
  { key: "sound", title: "Sound", desc: "Play a chime when a new alert arrives." },
  { key: "newConversation", title: "New conversations", desc: "Notify me when a visitor starts a new conversation." },
  { key: "humanHandoff", title: "Human handoff requests", desc: "Notify me when a visitor asks to talk to a person." },
];

function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const card =
    "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm space-y-4";

  const load = async () => {
    setLoadErr("");
    try {
      const r = await axios.get("/api/client/notif-prefs");
      setPrefs((r.data.prefs as Record<string, boolean>) || {});
    } catch {
      setLoadErr("Couldn't load notification preferences.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const toggle = async (key: string) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    const prev = prefs;
    setPrefs(next);
    setErr("");
    try {
      await axios.post("/api/client/notif-prefs", { prefs: next });
    } catch {
      setPrefs(prev); // revert on failure
      setErr("Couldn't save that change. Please try again.");
    }
  };

  return (
    <section className={card}>
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-zinc-400" />
        <h2 className="text-lg font-bold">Notifications</h2>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
        Choose when and how we alert you about inbox activity.
      </p>
      {loadErr ? (
        <ErrorState compact message={loadErr} onRetry={load} />
      ) : !prefs ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {NOTIF_OPTIONS.map((o) => (
              <ToggleRow
                key={o.key}
                checked={!!prefs[o.key]}
                onChange={() => toggle(o.key)}
                title={o.title}
                desc={o.desc}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Client audit log (Activity tab)                                     */
/* ------------------------------------------------------------------ */
interface AuditEntry {
  _id: string;
  actorName?: string;
  action: string;
  detail?: string;
  createdAt: string;
}

function ActivityPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const limit = 20;

  const card =
    "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm space-y-4";

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await axios.get(`/api/client/audit?skip=${skip}&limit=${limit}`);
      setEntries(r.data.entries || []);
      setTotal(r.data.total || 0);
    } catch {
      setErr("Couldn't load activity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + limit, total);

  return (
    <section className={`${card} max-w-3xl`}>
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-zinc-400" />
        <h2 className="text-lg font-bold">Activity log</h2>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
        A record of changes and actions across your workspace.
      </p>

      {loading && entries.length === 0 ? (
        <SkeletonList rows={6} />
      ) : err ? (
        <ErrorState compact message={err} onRetry={load} />
      ) : entries.length === 0 ? (
        <EmptyState
          compact
          icon={<Activity size={22} />}
          title="No activity yet"
          hint="Actions like configuration changes and team updates will appear here."
        />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {entries.map((e) => (
            <li key={e._id} className="flex items-start gap-3 py-3">
              <span className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[11px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                {(e.actorName || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-semibold">{e.actorName || "Someone"}</span>{" "}
                  <span className="text-zinc-600 dark:text-zinc-300">{e.action}</span>
                </div>
                {e.detail && (
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{e.detail}</div>
                )}
              </div>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0 whitespace-nowrap" title={fmtDateTime(e.createdAt)}>
                {fmtRelative(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {total > limit && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              disabled={skip === 0 || loading}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              type="button"
              onClick={() => setSkip((s) => s + limit)}
              disabled={skip + limit >= total || loading}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* New-bot modal: templates + import                                   */
/* ------------------------------------------------------------------ */
function NewBotModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Bot) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const createFromTemplate = async (tpl: BotTemplate) => {
    if (busy) return;
    setBusy(tpl.key);
    setErr("");
    try {
      const res = await axios.post("/api/client/bots", {});
      const created: Bot = res.data.bot;
      if (tpl.key === "blank") {
        onCreated(created);
        return;
      }
      const put = await axios.put(`/api/client/bots/${created._id}`, {
        ...created,
        name: tpl.name,
        tone: tpl.tone,
        knowledge: tpl.knowledge,
        starters: tpl.starters,
        appearance: { ...created.appearance, welcomeMessage: tpl.welcomeMessage },
      });
      onCreated(put.data.bot);
    } catch {
      setErr("Couldn't create the bot. Please try again.");
      setBusy(null);
    }
  };

  const importFile = async (file?: File | null) => {
    if (!file || busy) return;
    setBusy("import");
    setErr("");
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const res = await axios.post("/api/client/bots/import", config);
      onCreated(res.data.bot);
    } catch {
      setErr("Couldn't import that file. Make sure it's a valid exported bot (.json).");
      setBusy(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label="Create a new bot"
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between gap-2 px-6 py-4 border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div>
            <h2 className="text-lg font-bold">Create a new bot</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Start from a template or import an existing bot.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => importFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 hover:border-zinc-400 disabled:opacity-50 cursor-pointer"
            >
              {busy === "import" ? (
                <span className="w-3.5 h-3.5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              ) : (
                <FolderInput size={14} />
              )}
              Import
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {BOT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                onClick={() => createFromTemplate(tpl)}
                disabled={!!busy}
                className="text-left rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 hover:border-black dark:hover:border-white transition disabled:opacity-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{tpl.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{tpl.name}</div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{tpl.description}</div>
                  </div>
                  {busy === tpl.key && (
                    <span className="ml-auto w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard orchestrator                                              */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Conversational flow builder (step-based)                            */
/* ------------------------------------------------------------------ */
type FlowStepType = "message" | "choices" | "collect" | "handoff" | "end";
interface FlowChoice {
  label: string;
  next?: string;
}
interface FlowStep {
  id: string;
  type: FlowStepType;
  text: string;
  choices?: FlowChoice[];
  field?: string;
  next?: string;
}
interface Flow {
  _id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  steps: FlowStep[];
}

const STEP_TYPE_OPTIONS: { value: FlowStepType; label: string }[] = [
  { value: "message", label: "Message" },
  { value: "choices", label: "Choices" },
  { value: "collect", label: "Collect field" },
  { value: "handoff", label: "Handoff to human" },
  { value: "end", label: "End" },
];
const STEP_TYPE_LABEL: Record<FlowStepType, string> = {
  message: "Message",
  choices: "Choices",
  collect: "Collect",
  handoff: "Handoff",
  end: "End",
};
const newStepId = () => "s" + Math.random().toString(36).slice(2, 8);

/** Small on/off switch matching the dashboard's monochrome styling. */
function FlowSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer ${
        checked ? "bg-black dark:bg-white" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-zinc-900 shadow transform transition ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function FlowsPanel({ botId }: { botId: string }) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  // Editor draft for the selected flow.
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [trigger, setTrigger] = useState("");
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const label =
    "text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1";
  const inputCls =
    "w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500";
  const card =
    "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm space-y-4";

  const toErr = (e: unknown, fallback: string) =>
    (axios.isAxiosError(e) && (e.response?.data?.message as string)) || fallback;

  const openFlow = (f: Flow) => {
    setSelectedFlowId(f._id);
    setName(f.name || "");
    setEnabled(!!f.enabled);
    setTrigger(f.trigger || "");
    setSteps(
      (f.steps || []).map((s) => ({
        id: s.id || newStepId(),
        type: s.type,
        text: s.text || "",
        choices: s.choices
          ? s.choices.map((c) => ({ label: c.label || "", next: c.next || "" }))
          : undefined,
        field: s.field || "",
        next: s.next || "",
      })),
    );
    setSaved(false);
    setSaveErr("");
  };

  const load = async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const r = await axios.get(`/api/client/flows?botId=${botId}`);
      const list: Flow[] = r.data.flows || [];
      setFlows(list);
      if (list.length) openFlow(list[0]);
      else setSelectedFlowId(null);
    } catch (e) {
      console.error(e);
      setLoadErr("Couldn't load flows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createFlow = async () => {
    setCreating(true);
    try {
      const res = await axios.post("/api/client/flows", { botId });
      const f: Flow = res.data.flow;
      setFlows((l) => [f, ...l]);
      openFlow(f);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const removeFlow = async (id: string) => {
    try {
      await axios.delete(`/api/client/flows/${id}`);
      setFlows((l) => {
        const next = l.filter((f) => f._id !== id);
        if (selectedFlowId === id) {
          if (next.length) openFlow(next[0]);
          else setSelectedFlowId(null);
        }
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Quick enable/disable from the list — persists immediately.
  const toggleEnabled = async (f: Flow, val: boolean) => {
    setFlows((l) => l.map((x) => (x._id === f._id ? { ...x, enabled: val } : x)));
    if (selectedFlowId === f._id) setEnabled(val);
    try {
      await axios.put(`/api/client/flows/${f._id}`, { enabled: val });
    } catch (e) {
      console.error(e);
      // revert on failure
      setFlows((l) => l.map((x) => (x._id === f._id ? { ...x, enabled: !val } : x)));
      if (selectedFlowId === f._id) setEnabled(!val);
    }
  };

  const save = async () => {
    if (!selectedFlowId) return;
    setSaving(true);
    setSaveErr("");
    setSaved(false);
    try {
      const res = await axios.put(`/api/client/flows/${selectedFlowId}`, {
        name: name.trim() || "Untitled flow",
        enabled,
        trigger,
        steps,
      });
      const updated: Flow = res.data.flow;
      setFlows((l) => l.map((f) => (f._id === selectedFlowId ? updated : f)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveErr(toErr(e, "Couldn't save this flow."));
    } finally {
      setSaving(false);
    }
  };

  // Step mutations.
  const patchStep = (idx: number, patch: Partial<FlowStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const addStep = () =>
    setSteps((prev) => [...prev, { id: newStepId(), type: "message", text: "", next: "" }]);
  const removeStep = (idx: number) =>
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  // Choice mutations (for "choices" steps).
  const addChoice = (idx: number) =>
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, choices: [...(s.choices || []), { label: "", next: "" }] } : s,
      ),
    );
  const patchChoice = (idx: number, ci: number, patch: Partial<FlowChoice>) =>
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx
          ? {
              ...s,
              choices: (s.choices || []).map((c, j) => (j === ci ? { ...c, ...patch } : c)),
            }
          : s,
      ),
    );
  const removeChoice = (idx: number, ci: number) =>
    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, choices: (s.choices || []).filter((_, j) => j !== ci) } : s,
      ),
    );

  // Options for a "next step" dropdown, excluding the step itself.
  const nextOptions = (excludeId?: string) => [
    { value: "", label: "— End / none —" },
    ...steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.id !== excludeId)
      .map(({ s, i }) => ({
        value: s.id,
        label: `${i + 1}. ${STEP_TYPE_LABEL[s.type]}${
          s.text ? ` — ${s.text.slice(0, 24)}` : ""
        }`,
      })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Conversation flows</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Guide visitors through step-by-step conversations. A flow launches on its
            trigger keyword, or manually.
          </p>
        </div>
        <button
          onClick={createFlow}
          disabled={creating}
          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer shrink-0"
        >
          <Plus size={16} /> {creating ? "Creating…" : "New flow"}
        </button>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadErr ? (
        <ErrorState compact message={loadErr} onRetry={load} />
      ) : flows.length === 0 ? (
        <div className={card}>
          <EmptyState
            compact
            icon={<Workflow size={22} />}
            title="No flows yet"
            hint="Create a flow to script a guided conversation — menus, questions, data collection, and handoff to a human."
            action={
              <button
                onClick={createFlow}
                disabled={creating}
                className="px-5 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold disabled:opacity-50 cursor-pointer"
              >
                {creating ? "Creating…" : "Create your first flow"}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* Flow list */}
          <ul className="space-y-2">
            {flows.map((f) => (
              <li
                key={f._id}
                className={`rounded-xl border p-3 transition ${
                  selectedFlowId === f._id
                    ? "border-black dark:border-white bg-white dark:bg-zinc-900 shadow-sm"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => openFlow(f)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="text-sm font-semibold truncate">
                      {f.name || "Untitled flow"}
                    </div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {f.steps?.length || 0} step{(f.steps?.length || 0) === 1 ? "" : "s"}
                      {f.trigger ? ` · “${f.trigger}”` : " · manual"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFlow(f._id)}
                    aria-label={`Delete flow ${f.name || "Untitled flow"}`}
                    title="Delete flow"
                    className="shrink-0 text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <FlowSwitch
                    checked={!!f.enabled}
                    onChange={(v) => toggleEnabled(f, v)}
                    label={`Enable flow ${f.name || "Untitled flow"}`}
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {f.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Editor */}
          {selectedFlowId ? (
            <div className={card}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={label}>Flow name</label>
                  <input
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Lead qualification"
                  />
                </div>
                <div className="space-y-1">
                  <label className={label}>Trigger keyword (optional)</label>
                  <input
                    className={inputCls}
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value)}
                    placeholder="e.g. pricing — empty = manual"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FlowSwitch checked={enabled} onChange={setEnabled} label="Enable this flow" />
                <span className="text-sm font-semibold">
                  {enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Only enabled flows run in the widget.
                </span>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className={label}>Steps</label>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {steps.length} step{steps.length === 1 ? "" : "s"}
                  </span>
                </div>

                {steps.length === 0 && (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-6 text-center">
                    No steps yet. Add the first step to start building the conversation.
                  </p>
                )}

                {steps.map((s, idx) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Step {idx + 1}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-300 dark:text-zinc-600">
                        {s.id}
                      </span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => moveStep(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move step up"
                        title="Move up"
                        className="text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        aria-label="Move step down"
                        title="Move down"
                        className="text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        aria-label="Remove step"
                        title="Remove step"
                        className="text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className={label}>Type</label>
                        <Dropdown
                          value={s.type}
                          options={STEP_TYPE_OPTIONS}
                          onChange={(v) =>
                            patchStep(idx, {
                              type: v as FlowStepType,
                              // Seed an empty choice list when switching to "choices".
                              ...(v === "choices" && !s.choices
                                ? { choices: [{ label: "", next: "" }] }
                                : {}),
                            })
                          }
                        />
                      </div>
                      {s.type === "collect" && (
                        <div className="space-y-1">
                          <label className={label}>Store answer as field</label>
                          <input
                            className={inputCls}
                            value={s.field || ""}
                            onChange={(e) => patchStep(idx, { field: e.target.value })}
                            placeholder="e.g. email"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className={label}>
                        {s.type === "collect"
                          ? "Question"
                          : s.type === "choices"
                            ? "Prompt"
                            : s.type === "handoff"
                              ? "Handoff message"
                              : s.type === "end"
                                ? "Closing message (optional)"
                                : "Message"}
                      </label>
                      <textarea
                        className={`${inputCls} h-20 resize-none`}
                        value={s.text}
                        onChange={(e) => patchStep(idx, { text: e.target.value })}
                        placeholder="What the bot says at this step…"
                      />
                    </div>

                    {s.type === "choices" && (
                      <div className="space-y-2">
                        <label className={label}>Choices</label>
                        {(s.choices || []).map((c, ci) => (
                          <div
                            key={ci}
                            className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-center"
                          >
                            <input
                              className={inputCls}
                              value={c.label}
                              onChange={(e) =>
                                patchChoice(idx, ci, { label: e.target.value })
                              }
                              placeholder="Button label"
                            />
                            <Dropdown
                              value={c.next || ""}
                              options={nextOptions(s.id)}
                              onChange={(v) => patchChoice(idx, ci, { next: v })}
                              placeholder="Go to…"
                            />
                            <button
                              type="button"
                              onClick={() => removeChoice(idx, ci)}
                              aria-label="Remove choice"
                              title="Remove choice"
                              className="justify-self-start sm:justify-self-center text-zinc-400 hover:text-red-500 cursor-pointer transition-colors"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addChoice(idx)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-black dark:hover:text-white cursor-pointer transition-colors"
                        >
                          <Plus size={14} /> Add choice
                        </button>
                      </div>
                    )}

                    {(s.type === "message" || s.type === "collect") && (
                      <div className="space-y-1">
                        <label className={label}>Next step</label>
                        <Dropdown
                          value={s.next || ""}
                          options={nextOptions(s.id)}
                          onChange={(v) => patchStep(idx, { next: v })}
                          placeholder="Go to…"
                        />
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addStep}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition"
                >
                  <Plus size={16} /> Add step
                </button>
              </div>

              {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save size={16} /> {saving ? "Saving…" : "Save flow"}
                </button>
                {saved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={16} /> Saved
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className={card}>
              <EmptyState
                compact
                icon={<Workflow size={22} />}
                title="Select a flow"
                hint="Pick a flow from the list to edit its steps, or create a new one."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardClient({
  ownerId,
  email,
  isAdmin,
  impersonatedBy,
  tourSeen = false,
}: {
  ownerId: string;
  email: string;
  isAdmin: boolean;
  impersonatedBy?: string | null;
  tourSeen?: boolean;
}) {
  const navigate = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [exitingImp, setExitingImp] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newBotOpen, setNewBotOpen] = useState(false);
  const [inboxFocusId, setInboxFocusId] = useState<string | null>(null);
  const importBotRef = useRef<HTMLInputElement>(null);
  const [announcements, setAnnouncements] = useState<
    { _id: string; title?: string; body: string; level: "info" | "warning" | "success" }[]
  >([]);
  const [dismissedAnn, setDismissedAnn] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("sahayak-dismissed-ann") || "[]");
    } catch {
      return [];
    }
  });
  const dismissAnn = (id: string) =>
    setDismissedAnn((d) => {
      const next = [...d, id];
      try {
        localStorage.setItem("sahayak-dismissed-ann", JSON.stringify(next));
      } catch {}
      return next;
    });

  useEffect(() => {
    let alive = true;
    axios
      .get("/api/client/announcements")
      .then((r) => {
        if (alive) setAnnouncements(r.data.announcements || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Global Ctrl/Cmd+K to toggle the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer whenever the tab changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileNavOpen(false);
  }, [tab]);
  const logout = async () => {
    setLoggingOut(true);
    try {
      await axios.post("/api/auth/logout");
    } catch (e) {
      console.error(e);
    } finally {
      window.location.href = "/";
    }
  };

  const exitImpersonation = async () => {
    setExitingImp(true);
    try {
      await axios.post("/api/admin/impersonate/stop");
      window.location.href = "/admin";
    } catch {
      setExitingImp(false);
    }
  };

  const selected = bots.find((b) => b._id === selectedId);

  const loadBots = async () => {
    try {
      const res = await axios.get("/api/client/bots");
      const list: Bot[] = res.data.bots;
      setBots(list);
      setSelectedId((cur) => cur || list.find((b) => b.isDefault)?._id || list[0]?._id || "");
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await loadBots();
      setLoading(false);
    };
    run();
  }, []);

  // Open the template/import picker rather than creating a blank bot directly.
  const newBot = () => setNewBotOpen(true);

  const onBotCreated = (b: Bot) => {
    setBots((list) => [...list, b]);
    setSelectedId(b._id);
    setTab("configure");
    setNewBotOpen(false);
  };

  const duplicateBot = async () => {
    if (!selectedId) return;
    try {
      const res = await axios.post(`/api/client/bots/${selectedId}/duplicate`);
      onBotCreated(res.data.bot);
    } catch (e) {
      console.error(e);
    }
  };

  const exportBot = () => {
    if (!selectedId) return;
    const a = document.createElement("a");
    a.href = `/api/client/bots/${selectedId}/export`;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const deleteBot = async () => {
    const target = bots.find((b) => b._id === selectedId);
    if (!target) return;
    if (
      !window.confirm(
        `Permanently delete "${target.name}"? This removes its knowledge base, conversations memory, and uploaded avatar. This cannot be undone.`,
      )
    )
      return;
    try {
      await axios.delete(`/api/client/bots/${target._id}`);
      setBots((list) => {
        const remaining = list.filter((b) => b._id !== target._id);
        setSelectedId(
          remaining.find((b) => b.isDefault)?._id || remaining[0]?._id || "",
        );
        return remaining;
      });
    } catch (e) {
      console.error(e);
      window.alert("Couldn't delete that bot. Please try again.");
    }
  };

  const importBotFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const res = await axios.post("/api/client/bots/import", config);
      onBotCreated(res.data.bot);
    } catch (e) {
      console.error(e);
    } finally {
      if (importBotRef.current) importBotRef.current.value = "";
    }
  };

  const onSaved = (b: Bot) => setBots((list) => list.map((x) => (x._id === b._id ? b : x)));

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "inbox", label: "Inbox", icon: <InboxIcon size={16} /> },
    { key: "configure", label: "Configure", icon: <SlidersHorizontal size={16} /> },
    { key: "flows", label: "Flows", icon: <Workflow size={16} /> },
    { key: "team", label: "Team", icon: <Users size={16} /> },
    { key: "activity", label: "Activity", icon: <Activity size={16} /> },
    { key: "account", label: "Account", icon: <UserCog size={16} /> },
  ];
  const tabLabel = tabs.find((t) => t.key === tab)?.label ?? "Overview";

  // Jump to a conversation (from the command palette): switch to its bot + inbox.
  const openConversation = (c: { _id: string; botId: string | null }) => {
    if (c.botId) setSelectedId(c.botId);
    setTab("inbox");
    setInboxFocusId(c._id);
  };

  // Quick actions listed in the command palette.
  const commands: Command[] = [
    ...tabs.map((t) => ({
      id: `tab:${t.key}`,
      label: t.label,
      group: "Navigate",
      icon: t.icon,
      keywords: `go to ${t.key} ${t.label}`,
      onRun: () => setTab(t.key),
    })),
    {
      id: "action:new-bot",
      label: "New bot",
      group: "Actions",
      icon: <Plus size={16} />,
      keywords: "create add bot",
      onRun: () => newBot(),
    },
    ...(isAdmin
      ? [
          {
            id: "action:admin",
            label: "Open Admin",
            group: "Actions",
            icon: <ShieldCheck size={16} />,
            keywords: "admin console",
            onRun: () => navigate.push("/admin"),
          } as Command,
        ]
      : []),
  ];

  // Getting-started checklist steps, derived from the selected bot's real data.
  const CLASSIC = BOT_PRESETS[0];
  const appearanceCustomized = (() => {
    if (!selected) return false;
    const a = selected.appearance;
    return Boolean(
      a.avatarUrl ||
        a.avatarIconKey ||
        a.launcherIconKey ||
        (a.primaryColor && a.primaryColor.toLowerCase() !== CLASSIC.primaryColor.toLowerCase()),
    );
  })();
  const onboardingSteps: OnboardingStep[] = selected
    ? [
        {
          key: "name",
          label: "Name your bot",
          done: Boolean(selected.name && selected.name.trim() && selected.name !== "Untitled bot"),
          actionLabel: "Name it",
          onAction: () => setTab("configure"),
        },
        {
          key: "knowledge",
          label: "Add knowledge",
          done: Boolean(selected.knowledge && selected.knowledge.trim()),
          actionLabel: "Add knowledge",
          onAction: () => setTab("configure"),
        },
        {
          key: "appearance",
          label: "Customize appearance",
          done: appearanceCustomized,
          actionLabel: "Customize",
          onAction: () => setTab("configure"),
        },
        {
          key: "install",
          label: "Install on your site",
          done: false,
          actionLabel: "Get snippet",
          onAction: () => setTab("configure"),
        },
        {
          key: "team",
          label: "Invite your team",
          done: false,
          optional: true,
          actionLabel: "Invite",
          onAction: () => setTab("team"),
        },
      ]
    : [];

  const tourSteps = [
    {
      selector: "[data-tour='sidebar']",
      title: "Navigate your workspace",
      body: "Switch between Overview, Inbox, Configure, Team and Account here. The rail expands on hover.",
    },
    {
      selector: "[data-tour='bot-selector']",
      title: "Pick a bot",
      body: "If you run more than one chatbot, switch between them with this selector.",
    },
    {
      selector: "[data-tour='search']",
      title: "Search anything",
      body: "Press Ctrl/⌘ + K any time to jump to a tab, switch bots or find a conversation.",
    },
    {
      selector: "[data-tour='tab-configure']",
      title: "Configure your bot",
      body: "Set the knowledge base, appearance, behavior and grab your embed snippet here.",
    },
    {
      selector: "[data-tour='tab-inbox']",
      title: "Live inbox",
      body: "Read conversations in real time and take over from the AI whenever you want.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {impersonatedBy && (
        <div className="fixed top-0 left-0 w-full h-10 z-[60] bg-amber-500 text-black text-sm font-semibold px-4 flex items-center justify-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          <span className="flex items-center gap-2">
            <ShieldAlert size={16} /> Viewing as{" "}
            <span className="font-bold">{email}</span> — impersonated by {impersonatedBy}
          </span>
          <button
            onClick={exitImpersonation}
            disabled={exitingImp}
            className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-black/85 text-white px-3 py-1 text-xs font-bold hover:bg-black disabled:opacity-60 cursor-pointer"
          >
            {exitingImp ? "Exiting…" : "Exit impersonation"}
          </button>
        </div>
      )}
      <nav className={`fixed ${impersonatedBy ? "top-10" : "top-0"} left-0 w-full z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-800`}>
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-drawer"
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer shrink-0"
            >
              <Menu size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate.push("/")}
              aria-label="Sahayak AI home"
              className="flex items-center gap-2 min-w-0 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-black/5 cursor-pointer"
            >
              <Logo size={32} className="shrink-0" />
              <span className="text-lg font-bold tracking-tight truncate">Sahayak <span className="text-zinc-400 dark:text-zinc-500 font-medium">AI</span></span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Global search affordance (opens command palette) */}
            <button
              type="button"
              data-tour="search"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search (Ctrl+K)"
              title="Search — Ctrl/⌘ K"
              className="flex items-center justify-center gap-2 h-10 w-10 lg:w-auto lg:px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer"
            >
              <Search size={16} className="shrink-0" />
              <span className="hidden lg:inline">Search…</span>
              <kbd className="hidden lg:inline-flex items-center justify-center leading-none h-5 min-w-[1.5rem] px-1.5 text-[10px] font-semibold border border-zinc-200 dark:border-zinc-700 rounded">⌘K</kbd>
            </button>
            <ThemeToggle />
            {/* Bot selector (desktop) */}
            {bots.length > 0 && (
              <div data-tour="bot-selector" className="hidden sm:block w-[220px]">
                <Dropdown
                  value={selectedId}
                  onChange={setSelectedId}
                  leftIcon={<BotIcon size={15} />}
                  options={bots.map((b) => ({
                    value: b._id,
                    label: `${b.name}${b.isDefault ? " (default)" : ""}`,
                  }))}
                />
              </div>
            )}
            {/* Per-bot actions: duplicate / export / import */}
            {selectedId && (
              <div className="hidden sm:block w-[44px]">
                <SelectPopover
                  hideChevron
                  panelClass="min-w-[200px] right-0"
                  display={
                    <span className="flex items-center justify-center text-zinc-500 dark:text-zinc-400" title="Bot actions" aria-label="Bot actions">
                      <MoreHorizontal size={16} />
                    </span>
                  }
                >
                  {(close) => (
                    <div className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => { duplicateBot(); close(); }}
                        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Copy size={15} className="text-zinc-400" /> Duplicate this bot
                      </button>
                      <button
                        type="button"
                        onClick={() => { exportBot(); close(); }}
                        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Download size={15} className="text-zinc-400" /> Export (.json)
                      </button>
                      <button
                        type="button"
                        onClick={() => { importBotRef.current?.click(); close(); }}
                        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <FolderInput size={15} className="text-zinc-400" /> Import a bot…
                      </button>
                      <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                      <button
                        type="button"
                        onClick={() => { deleteBot(); close(); }}
                        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 size={15} /> Delete this bot
                      </button>
                    </div>
                  )}
                </SelectPopover>
              </div>
            )}
            <input
              ref={importBotRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => importBotFile(e.target.files?.[0])}
            />
            <button onClick={newBot} aria-label="Create a new bot" className="flex items-center gap-1 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer"><Plus size={16} /> <span className="hidden sm:inline">New</span></button>
            {isAdmin && (
              <button onClick={() => navigate.push("/admin")} aria-label="Open admin console" className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 outline-none focus-visible:ring-4 focus-visible:ring-black/20 transition cursor-pointer"><ShieldCheck size={16} /> Admin</button>
            )}
          </div>
        </div>
      </nav>

      {/* Left sidebar navigation (collapsible) */}
      {/* Mini sidebar: an icon rail that expands on hover and pushes the content. */}
      <aside
        data-tour="sidebar"
        onMouseEnter={() => setNavExpanded(true)}
        onMouseLeave={() => setNavExpanded(false)}
        onFocus={() => setNavExpanded(true)}
        onBlur={() => setNavExpanded(false)}
        className={`hidden md:flex fixed ${impersonatedBy ? "top-[104px]" : "top-16"} left-0 bottom-0 z-30 overflow-hidden flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200/60 dark:border-zinc-800 transition-[width] duration-200 ease-in-out ${navExpanded ? "w-56 shadow-2xl shadow-black/10" : "w-16"}`}
      >
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.label}
              aria-label={t.label}
              aria-current={tab === t.key ? "page" : undefined}
              data-tour={`tab-${t.key}`}
              className={`w-full flex items-center py-2.5 rounded-lg text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer ${navExpanded ? "gap-3 px-3" : "justify-center px-0"} ${tab === t.key ? "bg-black text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
            >
              <span className="shrink-0">{t.icon}</span>
              <span
                className={`whitespace-nowrap transition-opacity duration-150 ${navExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}
              >
                {t.label}
              </span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-zinc-200/60 dark:border-zinc-800">
          <button
            onClick={logout}
            disabled={loggingOut}
            title="Logout"
            aria-label="Logout"
            className={`w-full flex items-center py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 outline-none focus-visible:ring-4 focus-visible:ring-red-500/10 transition cursor-pointer disabled:opacity-60 ${navExpanded ? "gap-3 px-3" : "justify-center px-0"}`}
          >
            <span className="shrink-0"><LogOut size={18} /></span>
            <span
              className={`whitespace-nowrap transition-opacity duration-150 ${navExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}
            >
              {loggingOut ? "Logging out…" : "Logout"}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-[55]">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
          />
          <motion.aside
            id="mobile-nav-drawer"
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            transition={{ type: "tween", duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute top-0 left-0 bottom-0 w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200/60 dark:border-zinc-800 shadow-2xl flex flex-col"
          >
            <div className="h-16 px-4 flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800">
              <span className="text-lg font-bold tracking-tight">Sahayak <span className="text-zinc-400 dark:text-zinc-500 font-medium">AI</span></span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            {/* Mobile bot selector */}
            {bots.length > 0 && (
              <div className="p-3 border-b border-zinc-200/60 dark:border-zinc-800">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1">Active bot</label>
                <div className="mt-1">
                  <Dropdown
                    value={selectedId}
                    onChange={setSelectedId}
                    leftIcon={<BotIcon size={15} />}
                    options={bots.map((b) => ({
                      value: b._id,
                      label: `${b.name}${b.isDefault ? " (default)" : ""}`,
                    }))}
                  />
                </div>
              </div>
            )}
            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    setMobileNavOpen(false);
                  }}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer ${tab === t.key ? "bg-black text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
                >
                  <span className="shrink-0">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="p-2 border-t border-zinc-200/60 dark:border-zinc-800 space-y-1">
              {isAdmin && (
                <button
                  onClick={() => {
                    setMobileNavOpen(false);
                    navigate.push("/admin");
                  }}
                  aria-label="Open admin console"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 outline-none focus-visible:ring-4 focus-visible:ring-black/5 transition cursor-pointer"
                >
                  <ShieldCheck size={18} /> Admin console
                </button>
              )}
              <button
                onClick={logout}
                disabled={loggingOut}
                aria-label="Logout"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 outline-none focus-visible:ring-4 focus-visible:ring-red-500/10 transition cursor-pointer disabled:opacity-60"
              >
                <LogOut size={18} />
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            </div>
          </motion.aside>
        </div>
      )}

      <main
        className={`${impersonatedBy ? "pt-[136px]" : "pt-24"} pb-10 px-4 sm:px-6 transition-[margin] duration-200 ease-in-out ml-0 ${navExpanded ? "md:ml-56" : "md:ml-16"}`}
      >
        <div className="max-w-6xl mx-auto">
        {announcements
          .filter((a) => !dismissedAnn.includes(a._id))
          .map((a) => {
            const tone =
              a.level === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
                : a.level === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
                  : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300";
            return (
              <div key={a._id} className={`mb-3 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`} role="status">
                <div className="flex-1 min-w-0">
                  {a.title && <div className="font-bold">{a.title}</div>}
                  <div className="opacity-90 whitespace-pre-wrap break-words">{a.body}</div>
                </div>
                <button
                  onClick={() => dismissAnn(a._id)}
                  aria-label="Dismiss announcement"
                  className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        <div className="mb-6">
          <Breadcrumbs
            className="mb-2"
            items={[
              { label: "Dashboard", onClick: () => setTab("overview") },
              ...(selected ? [{ label: selected.name || "Bot" }] : []),
              { label: tabLabel },
            ]}
          />
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">{email}</p>
        </div>

        {loading ? (
          <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading dashboard">
            <Skeleton className="h-7 w-40" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        ) : tab === "team" ? (
          <motion.div key="team" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <TeamPanel />
          </motion.div>
        ) : tab === "account" ? (
          <motion.div key="account" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <AccountPanel email={email} retentionDays={selected?.dataRetentionDays} />
          </motion.div>
        ) : tab === "activity" ? (
          <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <ActivityPanel />
          </motion.div>
        ) : !selected ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm">
            <EmptyState
              icon={<BotIcon size={26} />}
              title="No chatbots yet"
              hint="Create your first bot to start customizing it and embedding it on your site."
              action={
                <button
                  onClick={newBot}
                  className="px-6 py-3 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold outline-none focus-visible:ring-4 focus-visible:ring-black/20 cursor-pointer"
                >
                  Create your first bot
                </button>
              }
            />
          </div>
        ) : (
          <motion.div key={`${tab}-${selectedId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {tab === "overview" && (
              <div className="space-y-6">
                <OnboardingChecklist storageKey={`sahayak-onboarding:${ownerId}`} steps={onboardingSteps} />
                <AnalyticsPanel botId={selectedId} />
              </div>
            )}
            {tab === "inbox" && <InboxPanel botId={selectedId} focusId={inboxFocusId} />}
            {tab === "configure" && <ConfigureForm key={selectedId} bot={selected} onSaved={onSaved} />}
            {tab === "flows" && <FlowsPanel key={selectedId} botId={selectedId} />}
          </motion.div>
        )}
        </div>
      </main>

      {/* Command palette (Ctrl/⌘ K) */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        bots={bots.map((b) => ({ _id: b._id, name: b.name }))}
        onSelectBot={(id) => setSelectedId(id)}
        onSelectConversation={openConversation}
      />

      {/* First-run guided tour — shown only to a brand-new user. `tourSeen` is
          persisted per-account server-side, so it never replays on later logins
          or other devices. Rendered once bots have loaded so targets exist. */}
      {!tourSeen && !loading && bots.length > 0 && (
        <Tour
          steps={tourSteps}
          storageKey={`sahayak-tour:${ownerId}`}
          onDone={() => {
            axios.post("/api/client/account/tour").catch(() => {});
          }}
        />
      )}

      {/* Create-bot modal (templates + import) */}
      {newBotOpen && <NewBotModal onClose={() => setNewBotOpen(false)} onCreated={onBotCreated} />}
    </div>
  );
}

export default DashboardClient;
