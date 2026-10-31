"use client";
import axios from "axios";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  MessagesSquare,
  MessageCircle,
  AlertTriangle,
  ShieldCheck,
  Search,
  ArrowLeft,
  X,
  Power,
  LogOut,
  Bot,
  Database,
  FileText,
  Brain,
  UsersRound,
  Clock,
  UserCog,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Inbox,
  Activity,
  Megaphone,
  HelpCircle,
  Trophy,
  Plus,
  Trash2,
  Download,
  Check,
  Menu,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

interface Overview {
  totals: {
    clients: number;
    activeClients: number;
    totalBots: number;
    conversations: number;
    messages: number;
    allClients: number;
    newSignups: number;
  };
  fallbackRate: number;
  range: { days: number; from: string };
  series: {
    date: string;
    messages: number;
    conversations: number;
    signups: number;
  }[];
  daily: { date: string; count: number }[];
}

interface ClientRow {
  ownerId: string;
  businessName: string;
  supportEmail: string;
  botCount: number;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  messages: number;
  conversations: number;
  lastActive: string | null;
}

interface ClientDetail {
  client: {
    ownerId: string;
    email: string;
    name: string;
    provider: string;
    createdAt: string;
    teamRole: string;
    businessName: string;
    isActive: boolean;
  };
  usage: {
    bots: number;
    conversations: number;
    messages: number;
    fallbackRate: number;
    knowledgeChunks: number;
    knowledgeSources: number;
    memories: number;
    teamMembers: number;
    lastActive: string | null;
  };
  bots: {
    _id: string;
    name: string;
    businessName: string;
    isActive: boolean;
    isDefault: boolean;
    knowledgeChars: number;
    createdAt: string;
  }[];
  team: { _id: string; name: string; email: string; createdAt: string }[];
  range: { days: number; from: string };
  series: { date: string; messages: number; conversations: number }[];
}

interface ConversationRow {
  _id: string;
  visitorId: string;
  messageCount: number;
  escalated: boolean;
  updatedAt: string;
}

interface MessageRow {
  _id: string;
  role: "user" | "bot" | "agent";
  content: string;
  fallback: boolean;
  createdAt: string;
}

interface AuditEntry {
  _id: string;
  actorEmail: string;
  action: string;
  targetOwnerId: string;
  targetEmail: string;
  detail: string;
  createdAt: string;
}

interface HealthService {
  name: string;
  status: "ok" | "down" | "unconfigured";
  detail: string;
}

interface Announcement {
  _id: string;
  title: string;
  body: string;
  level: string;
  active: boolean;
  createdByEmail: string;
  createdAt: string;
}

interface ClientProfile {
  ownerId: string;
  notes: string;
  tags: string[];
  lifecycle: string;
  monthlyMessageQuota: number;
  featureFlags: Record<string, boolean>;
}

interface AdminStaff {
  _id: string;
  name: string;
  email: string;
  adminRole: string;
}

interface SearchConversation {
  _id: string;
  ownerId: string;
  ownerEmail: string;
  visitorName: string;
  visitorEmail: string;
  lastMessage: string;
  updatedAt: string;
}

interface KnowledgeGap {
  question: string;
  count: number;
  lastAt: string;
}

interface PlatformAlert {
  ownerId: string;
  ownerEmail: string;
  type: string;
  detail: string;
  value: number;
}

interface LeaderRow {
  ownerId: string;
  ownerEmail: string;
  count: number;
}

interface Leaderboards {
  byMessages: LeaderRow[];
  byConversations: LeaderRow[];
  byEscalations: LeaderRow[];
}

type AdminTab =
  | "clients"
  | "audit"
  | "health"
  | "announcements"
  | "search"
  | "gaps"
  | "alerts"
  | "leaderboards"
  | "admins";

const TAB_META: Record<
  AdminTab,
  { label: string; title: string; subtitle: string }
> = {
  clients: {
    label: "Clients",
    title: "Platform Overview",
    subtitle: "Every client, chatbot, and conversation across Sahayak AI.",
  },
  audit: {
    label: "Audit log",
    title: "Audit Log",
    subtitle: "A record of privileged admin actions across the platform.",
  },
  health: {
    label: "Health",
    title: "System Health",
    subtitle: "Live status of the services Sahayak AI depends on.",
  },
  announcements: {
    label: "Broadcast",
    title: "Announcements",
    subtitle: "Broadcast messages shown to clients across the platform.",
  },
  search: {
    label: "Search",
    title: "Conversation Search",
    subtitle: "Find conversations across every tenant.",
  },
  gaps: {
    label: "Knowledge gaps",
    title: "Knowledge Gaps",
    subtitle: "The most common questions bots couldn't answer, platform-wide.",
  },
  alerts: {
    label: "Alerts",
    title: "Alerts",
    subtitle: "Abuse and usage-spike signals that may need attention.",
  },
  leaderboards: {
    label: "Leaderboards",
    title: "Leaderboards",
    subtitle: "Top clients by activity across the platform.",
  },
  admins: {
    label: "Staff",
    title: "Platform Staff",
    subtitle: "Manage who can access the admin console and their roles.",
  },
};

const TAB_ICONS: Record<AdminTab, React.ComponentType<{ size?: number }>> = {
  clients: Users,
  audit: ScrollText,
  health: Activity,
  announcements: Megaphone,
  search: Search,
  gaps: HelpCircle,
  alerts: AlertTriangle,
  leaderboards: Trophy,
  admins: UserCog,
};

const TAB_ORDER: AdminTab[] = [
  "clients",
  "audit",
  "health",
  "announcements",
  "search",
  "gaps",
  "alerts",
  "leaderboards",
  "admins",
];

const ANNOUNCEMENT_LEVELS = ["info", "success", "warning", "critical"];

const LIFECYCLE_OPTIONS = ["Active", "Trial", "Suspended"];

const ADMIN_ROLES = ["superadmin", "support", "analyst"];

function levelBadgeClass(level: string) {
  switch (level) {
    case "critical":
      return "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400";
    case "warning":
      return "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400";
    case "success":
      return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400";
    default:
      return "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400";
  }
}

function healthDotClass(status: HealthService["status"]) {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "unconfigured":
      return "bg-amber-500";
    default:
      return "bg-red-500";
  }
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
      <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 mb-3">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-3xl font-extrabold tracking-tight">{value}</div>
      {hint && (
        <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{hint}</div>
      )}
    </div>
  );
}

// A compact sparkline-style bar row for one metric over the selected range.
function BarRow({
  label,
  data,
  accent,
}: {
  label: string;
  data: { date: string; value: number }[];
  accent: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-sm ${accent}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {label}
          </span>
        </div>
        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
          {total} total
        </span>
      </div>
      <div className="flex items-end gap-[2px] h-20">
        {data.length === 0 && (
          <div className="text-zinc-400 dark:text-zinc-500 text-sm">
            No activity.
          </div>
        )}
        {data.map((d) => (
          <div
            key={d.date}
            className="flex-1 flex flex-col justify-end h-full group relative"
            title={`${d.date}: ${d.value}`}
          >
            <div
              className={`w-full rounded-t-sm min-h-[2px] transition-all ${accent}`}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, string> = {
  "impersonate.start": "Started impersonation",
  "impersonate.stop": "Stopped impersonation",
  "client.disable": "Disabled client",
  "client.enable": "Enabled client",
  "client.toggle": "Toggled client status",
};

function labelAction(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split(/[._]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const RANGE_OPTIONS = [7, 30, 90];
const PAGE_SIZE = 25;
const AUDIT_PAGE_SIZE = 50;

const FOCUS_RING =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900";

// ── Shared UI primitives (kept inline so AdminClient stays self-contained) ──

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800 ${className}`}
    />
  );
}

// Loading placeholder rows for a table body.
function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr
          key={r}
          className="border-b border-zinc-50 dark:border-zinc-800"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-6 py-4">
              <Skeleton className="h-4 w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Grid of stat-card skeletons used while the overview loads.
function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm">
      <Skeleton className="h-3 w-24 mb-4" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// Inline error state with a Retry action — avoids permanent spinner locks.
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 text-center py-4"
    >
      <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 dark:text-red-400">
        <AlertTriangle size={18} />
      </div>
      <div className="text-sm text-red-500 dark:text-red-400">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer ${FOCUS_RING}`}
        >
          <RotateCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

// Friendly empty state (icon + message) used across lists/tables.
function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center py-4">
      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
        {icon}
      </div>
      <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        {title}
      </div>
      {hint && (
        <div className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</div>
      )}
    </div>
  );
}

function AdminClient({ email }: { email: string }) {
  // Overview
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // Active tab across the admin console.
  const [tab, setTab] = useState<AdminTab>("clients");
  // Collapsible hover-expand left sidebar (like the dashboard).
  const [navExpanded, setNavExpanded] = useState(false);
  // Mobile slide-over sidebar (touch devices have no hover).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Retry triggers — bumping these re-runs the matching fetch effect.
  const [overviewTick, setOverviewTick] = useState(0);
  const [clientsTick, setClientsTick] = useState(0);
  const [auditTick, setAuditTick] = useState(0);
  const [healthTick, setHealthTick] = useState(0);
  const [announcementsTick, setAnnouncementsTick] = useState(0);
  const [adminsTick, setAdminsTick] = useState(0);
  const [gapsTick, setGapsTick] = useState(0);
  const [alertsTick, setAlertsTick] = useState(0);
  const [leaderboardsTick, setLeaderboardsTick] = useState(0);
  const [searchTick, setSearchTick] = useState(0);

  // Clients (server-side search + pagination)
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [toggling, setToggling] = useState<string | null>(null);

  // Impersonation
  const [impersonateConfirm, setImpersonateConfirm] = useState<string | null>(
    null,
  );
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Health
  const [health, setHealth] = useState<HealthService[] | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Announcements (broadcast)
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(
    null,
  );
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(
    null,
  );
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annLevel, setAnnLevel] = useState("info");
  const [annActive, setAnnActive] = useState(true);
  const [annSaving, setAnnSaving] = useState(false);
  const [annFormError, setAnnFormError] = useState<string | null>(null);
  const [annBusyId, setAnnBusyId] = useState<string | null>(null);

  // Global conversation search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [searchResults, setSearchResults] = useState<
    SearchConversation[] | null
  >(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Knowledge gaps
  const [gaps, setGaps] = useState<KnowledgeGap[] | null>(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsError, setGapsError] = useState<string | null>(null);

  // Alerts
  const [alerts, setAlerts] = useState<PlatformAlert[] | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  // Leaderboards
  const [leaderboards, setLeaderboards] = useState<Leaderboards | null>(null);
  const [leaderboardsLoading, setLeaderboardsLoading] = useState(false);
  const [leaderboardsError, setLeaderboardsError] = useState<string | null>(
    null,
  );

  // Admins / staff
  const [admins, setAdmins] = useState<AdminStaff[] | null>(null);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [adminsForbidden, setAdminsForbidden] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("support");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);

  // Client profile (Account / CRM) inside the drawer
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newFlagKey, setNewFlagKey] = useState("");

  // Drill-in drawer
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [drawerView, setDrawerView] = useState<
    "detail" | "conversations" | "transcript"
  >("detail");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [transcript, setTranscript] = useState<MessageRow[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // ── Overview fetch (refetches when range changes) ────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const ov = await axios.get(`/api/admin/overview?days=${days}`);
        if (!cancelled) setOverview(ov.data);
      } catch (error) {
        console.error(error);
        if (!cancelled) setOverviewError("Failed to load overview.");
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [days, overviewTick]);

  // ── Debounce the search query (~300ms) and reset to first page ───────────
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── Clients fetch (server-side search + pagination) ──────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setClientsLoading(true);
      setClientsError(null);
      try {
        const res = await axios.get("/api/admin/clients", {
          params: {
            q: debouncedQuery,
            skip: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          },
        });
        if (!cancelled) {
          setClients(res.data.clients);
          setClientsTotal(res.data.total);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setClientsError("Failed to load clients.");
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page, clientsTick]);

  // ── Audit log fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "audit") return;
    let cancelled = false;
    const load = async () => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const res = await axios.get("/api/admin/audit", {
          params: { skip: auditPage * AUDIT_PAGE_SIZE, limit: AUDIT_PAGE_SIZE },
        });
        if (!cancelled) {
          setAuditEntries(res.data.entries);
          setAuditTotal(res.data.total);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setAuditError("Failed to load audit log.");
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, auditPage, auditTick]);

  // ── Health fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "health") return;
    let cancelled = false;
    const load = async () => {
      setHealthLoading(true);
      setHealthError(null);
      try {
        const res = await axios.get("/api/admin/health");
        if (!cancelled) setHealth(res.data.services);
      } catch (error) {
        console.error(error);
        if (!cancelled) setHealthError("Failed to load system health.");
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, healthTick]);

  // ── Announcements fetch ──────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "announcements") return;
    let cancelled = false;
    const load = async () => {
      setAnnouncementsLoading(true);
      setAnnouncementsError(null);
      try {
        const res = await axios.get("/api/admin/announcements");
        if (!cancelled) setAnnouncements(res.data.announcements);
      } catch (error) {
        console.error(error);
        if (!cancelled)
          setAnnouncementsError("Failed to load announcements.");
      } finally {
        if (!cancelled) setAnnouncementsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, announcementsTick]);

  // ── Debounce the global conversation search query (~350ms) ───────────────
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Global conversation search fetch ─────────────────────────────────────
  useEffect(() => {
    if (tab !== "search") return;
    if (!searchDebounced) {
      setSearchResults(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await axios.get("/api/admin/search", {
          params: { q: searchDebounced },
          signal: controller.signal,
        });
        if (active) setSearchResults(res.data.conversations);
      } catch (error) {
        // A superseded/aborted request (new keystroke, tab change) is not a
        // failure — ignore it quietly instead of flashing an error.
        if (axios.isCancel(error) || controller.signal.aborted) return;
        console.error(error);
        if (active) setSearchError("Search failed.");
      } finally {
        if (active) setSearchLoading(false);
      }
    };
    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [tab, searchDebounced, searchTick]);

  // ── Knowledge gaps fetch ─────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "gaps") return;
    let cancelled = false;
    const load = async () => {
      setGapsLoading(true);
      setGapsError(null);
      try {
        const res = await axios.get("/api/admin/knowledge-gaps");
        if (!cancelled) setGaps(res.data.gaps);
      } catch (error) {
        console.error(error);
        if (!cancelled) setGapsError("Failed to load knowledge gaps.");
      } finally {
        if (!cancelled) setGapsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, gapsTick]);

  // ── Alerts fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "alerts") return;
    let cancelled = false;
    const load = async () => {
      setAlertsLoading(true);
      setAlertsError(null);
      try {
        const res = await axios.get("/api/admin/alerts");
        if (!cancelled) setAlerts(res.data.alerts);
      } catch (error) {
        console.error(error);
        if (!cancelled) setAlertsError("Failed to load alerts.");
      } finally {
        if (!cancelled) setAlertsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, alertsTick]);

  // ── Leaderboards fetch ───────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "leaderboards") return;
    let cancelled = false;
    const load = async () => {
      setLeaderboardsLoading(true);
      setLeaderboardsError(null);
      try {
        const res = await axios.get("/api/admin/leaderboards");
        if (!cancelled) setLeaderboards(res.data);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLeaderboardsError("Failed to load leaderboards.");
      } finally {
        if (!cancelled) setLeaderboardsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, leaderboardsTick]);

  // ── Admins / staff fetch (superadmin-only) ───────────────────────────────
  useEffect(() => {
    if (tab !== "admins") return;
    let cancelled = false;
    const load = async () => {
      setAdminsLoading(true);
      setAdminsError(null);
      setAdminsForbidden(false);
      try {
        const res = await axios.get("/api/admin/admins");
        if (!cancelled) setAdmins(res.data.admins);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            setAdminsForbidden(true);
          } else {
            setAdminsError("Failed to load staff.");
          }
        }
      } finally {
        if (!cancelled) setAdminsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, adminsTick]);

  const maxDaily = useMemo(
    () => Math.max(1, ...(overview?.daily.map((d) => d.count) ?? [0])),
    [overview],
  );

  const closeDrawer = useCallback(() => {
    setSelected(null);
    setDetail(null);
    setTranscript(null);
    setConversations([]);
    setDrawerView("detail");
    setDetailError(null);
    setDrillError(null);
    setProfile(null);
    setProfileError(null);
    setProfileSaved(false);
    setNewTag("");
    setNewFlagKey("");
  }, []);

  // Escape-to-close for the drawer
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, closeDrawer]);

  // Escape-to-close for the mobile sidebar drawer
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const handleLogout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch (error) {
      console.error(error);
    } finally {
      window.location.href = "/";
    }
  };

  const toggleActive = async (c: ClientRow) => {
    setToggling(c.ownerId);
    try {
      await axios.post("/api/admin/clients/toggle", {
        ownerId: c.ownerId,
        isActive: !c.isActive,
      });
      setClients((prev) =>
        prev.map((row) =>
          row.ownerId === c.ownerId ? { ...row, isActive: !row.isActive } : row,
        ),
      );
      setDetail((prev) =>
        prev && prev.client.ownerId === c.ownerId
          ? {
              ...prev,
              client: { ...prev.client, isActive: !prev.client.isActive },
            }
          : prev,
      );
    } catch (error) {
      console.error(error);
    } finally {
      setToggling(null);
    }
  };

  const doImpersonate = async (ownerId: string) => {
    setImpersonating(true);
    setImpersonateError(null);
    try {
      await axios.post("/api/admin/impersonate", { ownerId });
      window.location.href = "/dashboard";
    } catch (error) {
      console.error(error);
      const msg = axios.isAxiosError(error)
        ? error.response?.status === 409
          ? "Already impersonating a client."
          : error.response?.status === 403
            ? "Not authorized to impersonate."
            : "Failed to impersonate."
        : "Failed to impersonate.";
      setImpersonateError(msg);
      setImpersonating(false);
      setImpersonateConfirm(null);
    }
  };

  const loadProfile = useCallback(async (ownerId: string) => {
    setProfile(null);
    setProfileError(null);
    setProfileSaved(false);
    setProfileLoading(true);
    try {
      const res = await axios.get(
        `/api/admin/clients/${encodeURIComponent(ownerId)}/profile`,
      );
      setProfile(res.data.profile);
    } catch (error) {
      console.error(error);
      setProfileError("Failed to load account profile.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const openClient = async (c: ClientRow) => {
    setSelected(c);
    setDetail(null);
    setTranscript(null);
    setConversations([]);
    setDrawerView("detail");
    setDetailError(null);
    setDetailLoading(true);
    setNewTag("");
    setNewFlagKey("");
    loadProfile(c.ownerId);
    try {
      const res = await axios.get(
        `/api/admin/clients/${encodeURIComponent(c.ownerId)}?days=30`,
      );
      setDetail(res.data);
    } catch (error) {
      console.error(error);
      setDetailError("Failed to load client detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  // Open a client drawer given just an owner id/email (used by search results).
  const openOwner = (ownerId: string, ownerEmail: string) => {
    setTab("clients");
    openClient({
      ownerId,
      businessName: "",
      supportEmail: "",
      botCount: 0,
      email: ownerEmail,
      name: "",
      isActive: true,
      createdAt: "",
      messages: 0,
      conversations: 0,
      lastActive: null,
    });
  };

  // ── Account / CRM profile editing ────────────────────────────────────────
  const saveProfile = async () => {
    if (!profile) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await axios.patch(
        `/api/admin/clients/${encodeURIComponent(profile.ownerId)}/profile`,
        {
          notes: profile.notes,
          tags: profile.tags,
          lifecycle: profile.lifecycle,
          monthlyMessageQuota: profile.monthlyMessageQuota,
          featureFlags: profile.featureFlags,
        },
      );
      setProfileSaved(true);
    } catch (error) {
      console.error(error);
      setProfileError("Failed to save account profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || !profile) return;
    if (!profile.tags.includes(t)) {
      setProfile({ ...profile, tags: [...profile.tags, t] });
      setProfileSaved(false);
    }
    setNewTag("");
  };

  const removeTag = (t: string) => {
    if (!profile) return;
    setProfile({ ...profile, tags: profile.tags.filter((x) => x !== t) });
    setProfileSaved(false);
  };

  const toggleFlag = (key: string) => {
    if (!profile) return;
    setProfile({
      ...profile,
      featureFlags: { ...profile.featureFlags, [key]: !profile.featureFlags[key] },
    });
    setProfileSaved(false);
  };

  const addFlag = () => {
    const k = newFlagKey.trim();
    if (!k || !profile) return;
    if (!(k in profile.featureFlags)) {
      setProfile({
        ...profile,
        featureFlags: { ...profile.featureFlags, [k]: true },
      });
      setProfileSaved(false);
    }
    setNewFlagKey("");
  };

  // ── Announcements mutations ──────────────────────────────────────────────
  const createAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) {
      setAnnFormError("Title and body are required.");
      return;
    }
    setAnnSaving(true);
    setAnnFormError(null);
    try {
      await axios.post("/api/admin/announcements", {
        title: annTitle.trim(),
        body: annBody.trim(),
        level: annLevel,
        active: annActive,
      });
      setAnnTitle("");
      setAnnBody("");
      setAnnLevel("info");
      setAnnActive(true);
      setAnnouncementsTick((t) => t + 1);
    } catch (error) {
      console.error(error);
      setAnnFormError("Failed to create announcement.");
    } finally {
      setAnnSaving(false);
    }
  };

  const toggleAnnouncement = async (a: Announcement) => {
    setAnnBusyId(a._id);
    try {
      await axios.patch(`/api/admin/announcements/${a._id}`, {
        active: !a.active,
      });
      setAnnouncements((prev) =>
        prev
          ? prev.map((x) =>
              x._id === a._id ? { ...x, active: !x.active } : x,
            )
          : prev,
      );
    } catch (error) {
      console.error(error);
      setAnnouncementsTick((t) => t + 1);
    } finally {
      setAnnBusyId(null);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    setAnnBusyId(id);
    try {
      await axios.delete(`/api/admin/announcements/${id}`);
      setAnnouncements((prev) =>
        prev ? prev.filter((x) => x._id !== id) : prev,
      );
    } catch (error) {
      console.error(error);
      setAnnouncementsTick((t) => t + 1);
    } finally {
      setAnnBusyId(null);
    }
  };

  // ── Staff mutations (superadmin-only) ────────────────────────────────────
  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) {
      setAdminFormError("Email is required.");
      return;
    }
    setAdminSaving(true);
    setAdminFormError(null);
    try {
      await axios.post("/api/admin/admins", {
        email: newAdminEmail.trim(),
        role: newAdminRole,
      });
      setNewAdminEmail("");
      setNewAdminRole("support");
      setAdminsTick((t) => t + 1);
    } catch (error) {
      console.error(error);
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setAdminFormError("Only superadmins can manage staff.");
      } else {
        setAdminFormError("Failed to add staff member.");
      }
    } finally {
      setAdminSaving(false);
    }
  };

  const removeAdmin = async (id: string) => {
    setAdminBusyId(id);
    try {
      await axios.delete(`/api/admin/admins/${id}`);
      setAdmins((prev) => (prev ? prev.filter((x) => x._id !== id) : prev));
    } catch (error) {
      console.error(error);
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setAdminsForbidden(true);
      } else {
        setAdminsTick((t) => t + 1);
      }
    } finally {
      setAdminBusyId(null);
    }
  };

  // ── CSV export (programmatic anchor so download headers apply) ───────────
  const exportClientsCsv = () => {
    const a = document.createElement("a");
    a.href = "/api/admin/clients/export";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const loadConversations = async () => {
    if (!selected) return;
    setDrawerView("conversations");
    setTranscript(null);
    setDrillError(null);
    setDrillLoading(true);
    try {
      const res = await axios.get(
        `/api/admin/conversations?ownerId=${encodeURIComponent(selected.ownerId)}`,
      );
      setConversations(res.data.conversations);
    } catch (error) {
      console.error(error);
      setDrillError("Failed to load conversations.");
    } finally {
      setDrillLoading(false);
    }
  };

  const openTranscript = async (conversationId: string) => {
    setDrawerView("transcript");
    setDrillError(null);
    setDrillLoading(true);
    try {
      const res = await axios.get(
        `/api/admin/conversations?conversationId=${conversationId}`,
      );
      setTranscript(res.data.messages);
    } catch (error) {
      console.error(error);
      setDrillError("Failed to load transcript.");
    } finally {
      setDrillLoading(false);
    }
  };

  const rangeStart = clientsTotal === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, clientsTotal);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < clientsTotal;

  const auditHasPrev = auditPage > 0;
  const auditHasNext = (auditPage + 1) * AUDIT_PAGE_SIZE < auditTotal;

  // Sidebar labels show on hover (desktop) or whenever the mobile drawer is open.
  const showLabels = navExpanded || mobileNavOpen;

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-800">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              className={`md:hidden inline-flex items-center justify-center p-2 -ml-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0 ${FOCUS_RING}`}
            >
              <Menu size={20} />
            </button>
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight truncate">
              Sahayak{" "}
              <span className="text-zinc-400 dark:text-zinc-500 font-medium">
                Admin
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <span className="text-sm text-zinc-500 dark:text-zinc-400 hidden md:block">
              {email}
            </span>
            <a
              href="/dashboard"
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition shadow-sm cursor-pointer shrink-0"
            >
              <ArrowLeft size={16} /> <span className="hidden sm:inline">Dashboard</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Mobile backdrop (tap outside to close the slide-over sidebar) */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden fixed inset-0 top-16 z-30 bg-black/30 cursor-default"
        />
      )}

      {/* Left sidebar navigation: hover-expand rail on md+, slide-over drawer on mobile */}
      <aside
        onMouseEnter={() => setNavExpanded(true)}
        onMouseLeave={() => setNavExpanded(false)}
        onFocus={() => setNavExpanded(true)}
        onBlur={() => setNavExpanded(false)}
        className={`fixed top-16 left-0 bottom-0 z-40 md:z-30 overflow-hidden flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200/60 dark:border-zinc-800 transition-[width,transform] duration-200 ease-in-out w-56 ${
          mobileNavOpen
            ? "translate-x-0 shadow-2xl shadow-black/10"
            : "-translate-x-full"
        } md:translate-x-0 ${
          navExpanded
            ? "md:w-56 md:shadow-2xl md:shadow-black/10"
            : "md:w-16 md:shadow-none"
        }`}
      >
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1" aria-label="Admin sections">
          {TAB_ORDER.map((t) => {
            const Icon = TAB_ICONS[t];
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setMobileNavOpen(false);
                }}
                title={TAB_META[t].label}
                aria-current={active ? "page" : undefined}
                className={`w-full flex items-center py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer ${FOCUS_RING} ${showLabels ? "gap-3 px-3" : "justify-center px-0"} ${
                  active
                    ? "bg-black text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="shrink-0">
                  <Icon size={18} />
                </span>
                <span
                  className={`whitespace-nowrap transition-opacity duration-150 ${showLabels ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}
                >
                  {TAB_META[t].label}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="p-2 border-t border-zinc-200/60 dark:border-zinc-800">
          <button
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className={`w-full flex items-center py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition cursor-pointer ${FOCUS_RING} ${showLabels ? "gap-3 px-3" : "justify-center px-0"}`}
          >
            <span className="shrink-0">
              <LogOut size={18} />
            </span>
            <span
              className={`whitespace-nowrap transition-opacity duration-150 ${showLabels ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}
            >
              Logout
            </span>
          </button>
        </div>
      </aside>

      <main
        className={`pt-24 pb-20 px-4 sm:px-6 transition-[margin] duration-200 ease-in-out ml-0 ${navExpanded ? "md:ml-56" : "md:ml-16"}`}
      >
        <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
            >
              <span>Admin</span>
              <ChevronRight size={12} aria-hidden="true" />
              <span className="text-zinc-600 dark:text-zinc-300">
                {TAB_META[tab].label}
              </span>
            </nav>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {TAB_META[tab].title}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              {TAB_META[tab].subtitle}
            </p>
          </div>
          {/* Range selector (only affects the overview on Clients / Audit) */}
          {(tab === "clients" || tab === "audit") && (
            <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 shadow-sm">
              {RANGE_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${FOCUS_RING} ${
                    days === d
                      ? "bg-black text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ══ CLIENTS & AUDIT (share the platform overview) ══════════════ */}
        {(tab === "clients" || tab === "audit") && (
          <>
        {overviewError && !overview ? (
          <div className="mb-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm px-6 py-10">
            <ErrorState
              message={overviewError}
              onRetry={() => setOverviewTick((t) => t + 1)}
            />
          </div>
        ) : null}

        {overviewError && overview && (
          <div className="mb-6 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <span>{overviewError}</span>
            <button
              type="button"
              onClick={() => setOverviewTick((t) => t + 1)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/20 transition cursor-pointer shrink-0 ${FOCUS_RING}`}
            >
              <RotateCw size={13} /> Retry
            </button>
          </div>
        )}

        {overviewLoading && !overview ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm mb-8">
              <Skeleton className="h-4 w-40 mb-5" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </div>
          </>
        ) : overviewError && !overview ? null : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              <StatCard
                icon={<Users size={16} />}
                label="All clients"
                value={String(overview?.totals.allClients ?? 0)}
                hint={`${overview?.totals.activeClients ?? 0} active`}
              />
              <StatCard
                icon={<UserPlus size={16} />}
                label="New signups"
                value={String(overview?.totals.newSignups ?? 0)}
                hint={`in last ${days}d`}
              />
              <StatCard
                icon={<Bot size={16} />}
                label="Bots"
                value={String(overview?.totals.totalBots ?? 0)}
              />
              <StatCard
                icon={<MessagesSquare size={16} />}
                label="Conversations"
                value={String(overview?.totals.conversations ?? 0)}
              />
              <StatCard
                icon={<MessageCircle size={16} />}
                label="Messages"
                value={String(overview?.totals.messages ?? 0)}
              />
              <StatCard
                icon={<AlertTriangle size={16} />}
                label="Fallback rate"
                value={`${Math.round((overview?.fallbackRate ?? 0) * 100)}%`}
                hint="bot couldn't answer"
              />
            </div>

            {/* Multi-series trends */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 shadow-sm mb-8">
              <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-5">
                Activity · last {days} days
              </div>
              {(overview?.series ?? []).length === 0 ? (
                <div className="text-zinc-400 dark:text-zinc-500 text-sm">
                  No activity yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <BarRow
                    label="Messages"
                    accent="bg-black dark:bg-zinc-100"
                    data={(overview?.series ?? []).map((s) => ({
                      date: s.date,
                      value: s.messages,
                    }))}
                  />
                  <BarRow
                    label="Conversations"
                    accent="bg-indigo-500 dark:bg-indigo-400"
                    data={(overview?.series ?? []).map((s) => ({
                      date: s.date,
                      value: s.conversations,
                    }))}
                  />
                  <BarRow
                    label="Signups"
                    accent="bg-emerald-500 dark:bg-emerald-400"
                    data={(overview?.series ?? []).map((s) => ({
                      date: s.date,
                      value: s.signups,
                    }))}
                  />
                </div>
              )}
            </div>

            {/* Clients header: search + CSV export */}
            {tab === "clients" && (
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="text-lg font-bold">Clients</div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-auto">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                    />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search clients…"
                      aria-label="Search clients"
                      className={`pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black w-full sm:w-64 dark:text-zinc-100 dark:placeholder-zinc-500 ${FOCUS_RING}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={exportClientsCsv}
                    aria-label="Export clients as CSV"
                    className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0 ${FOCUS_RING}`}
                  >
                    <Download size={15} /> Export CSV
                  </button>
                </div>
              </div>
            )}

            {tab === "audit" && (
              <div className="flex items-center gap-2 mb-4 text-lg font-bold">
                <ScrollText size={18} /> Audit log
              </div>
            )}

            {impersonateError && (
              <div className="mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3">
                {impersonateError}
              </div>
            )}

            {/* ── CLIENTS VIEW ──────────────────────────────────────────── */}
            {tab === "clients" && (
              <>
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto sleek-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                          <th className="px-6 py-4 font-bold">Business</th>
                          <th className="px-6 py-4 font-bold">Account</th>
                          <th className="px-6 py-4 font-bold text-right">
                            Bots
                          </th>
                          <th className="px-6 py-4 font-bold text-right">
                            Chats
                          </th>
                          <th className="px-6 py-4 font-bold text-right">
                            Messages
                          </th>
                          <th className="px-6 py-4 font-bold">Joined</th>
                          <th className="px-6 py-4 font-bold">Last active</th>
                          <th className="px-6 py-4 font-bold">Status</th>
                          <th className="px-6 py-4" />
                        </tr>
                      </thead>
                      <tbody>
                        {clientsError && clients.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-6 py-10">
                              <ErrorState
                                message={clientsError}
                                onRetry={() =>
                                  setClientsTick((t) => t + 1)
                                }
                              />
                            </td>
                          </tr>
                        )}
                        {!clientsError &&
                          clientsLoading &&
                          clients.length === 0 && (
                            <TableSkeleton cols={9} />
                          )}
                        {!clientsError &&
                          !clientsLoading &&
                          clients.length === 0 && (
                            <tr>
                              <td colSpan={9} className="px-6 py-10">
                                <EmptyState
                                  icon={<Users size={18} />}
                                  title={
                                    debouncedQuery
                                      ? "No clients match your search"
                                      : "No clients yet"
                                  }
                                  hint={
                                    debouncedQuery
                                      ? "Try a different name or email."
                                      : "Clients will appear here once they sign up."
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        {clients.map((c) => (
                          <tr
                            key={c.ownerId}
                            className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                          >
                            <td className="px-6 py-4">
                              <div className="font-semibold">
                                {c.businessName || (
                                  <span className="text-zinc-400 dark:text-zinc-500 italic">
                                    Unnamed
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-zinc-400 dark:text-zinc-500">
                                {c.supportEmail || "—"}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                              {c.email || "—"}
                            </td>
                            <td className="px-6 py-4 text-right font-medium">
                              {c.botCount}
                            </td>
                            <td className="px-6 py-4 text-right font-medium">
                              {c.conversations}
                            </td>
                            <td className="px-6 py-4 text-right font-medium">
                              {c.messages}
                            </td>
                            <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                              {fmtDate(c.createdAt)}
                            </td>
                            <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                              {fmtDate(c.lastActive)}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                                  c.isActive
                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                                    : "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    c.isActive ? "bg-emerald-500" : "bg-red-500"
                                  }`}
                                />
                                {c.isActive ? "Active" : "Disabled"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openClient(c)}
                                  aria-label={`View ${c.businessName || c.email || "client"}`}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer ${FOCUS_RING}`}
                                >
                                  View
                                </button>
                                {impersonateConfirm === c.ownerId ? (
                                  <button
                                    onClick={() => doImpersonate(c.ownerId)}
                                    disabled={impersonating}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-600 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-400 dark:bg-amber-500/10 transition cursor-pointer disabled:opacity-50"
                                  >
                                    {impersonating ? "…" : "Confirm?"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      setImpersonateConfirm(c.ownerId)
                                    }
                                    title="Impersonate this client"
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer flex items-center gap-1"
                                  >
                                    <UserCog size={13} />
                                    Impersonate
                                  </button>
                                )}
                                <button
                                  onClick={() => toggleActive(c)}
                                  disabled={toggling === c.ownerId}
                                  title={c.isActive ? "Disable" : "Enable"}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                                    c.isActive
                                      ? "border-red-200 text-red-500 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                  }`}
                                >
                                  <Power size={13} />
                                  {c.isActive ? "Disable" : "Enable"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {clientsTotal === 0
                      ? "No clients"
                      : `Showing ${rangeStart}–${rangeEnd} of ${clientsTotal}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={!hasPrev || clientsLoading}
                      className={`flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasNext || clientsLoading}
                      className={`flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── AUDIT LOG VIEW ────────────────────────────────────────── */}
            {tab === "audit" && (
              <>
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto sleek-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                          <th className="px-6 py-4 font-bold">Time</th>
                          <th className="px-6 py-4 font-bold">Actor</th>
                          <th className="px-6 py-4 font-bold">Action</th>
                          <th className="px-6 py-4 font-bold">Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditError && auditEntries.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-10">
                              <ErrorState
                                message={auditError}
                                onRetry={() => setAuditTick((t) => t + 1)}
                              />
                            </td>
                          </tr>
                        )}
                        {!auditError &&
                          auditLoading &&
                          auditEntries.length === 0 && (
                            <TableSkeleton cols={4} />
                          )}
                        {!auditError &&
                          !auditLoading &&
                          auditEntries.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-6 py-10">
                                <EmptyState
                                  icon={<ScrollText size={18} />}
                                  title="No audit entries"
                                  hint="Admin actions like impersonation and client changes will show up here."
                                />
                              </td>
                            </tr>
                          )}
                        {auditEntries.map((a) => (
                          <tr
                            key={a._id}
                            className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                          >
                            <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                              {fmtDateTime(a.createdAt)}
                            </td>
                            <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300">
                              {a.actorEmail || "—"}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {labelAction(a.action)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                              <div className="font-medium">
                                {a.targetEmail || a.targetOwnerId || "—"}
                              </div>
                              {a.detail && (
                                <div className="text-xs text-zinc-400 dark:text-zinc-500">
                                  {a.detail}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {auditTotal === 0
                      ? "No entries"
                      : `Showing ${auditPage * AUDIT_PAGE_SIZE + 1}–${Math.min(
                          (auditPage + 1) * AUDIT_PAGE_SIZE,
                          auditTotal,
                        )} of ${auditTotal}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                      disabled={!auditHasPrev || auditLoading}
                      className={`flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <button
                      onClick={() => setAuditPage((p) => p + 1)}
                      disabled={!auditHasNext || auditLoading}
                      className={`flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
          </>
        )}

        {/* ══ HEALTH ═════════════════════════════════════════════════════ */}
        {tab === "health" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="text-lg font-bold flex items-center gap-2">
                <Activity size={18} /> Services
              </div>
              <button
                type="button"
                onClick={() => setHealthTick((t) => t + 1)}
                disabled={healthLoading}
                aria-label="Refresh system health"
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
              >
                <RotateCw
                  size={13}
                  className={healthLoading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>
            <div className="p-6">
              {healthLoading && !health ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : healthError && !health ? (
                <ErrorState
                  message={healthError}
                  onRetry={() => setHealthTick((t) => t + 1)}
                />
              ) : health && health.length === 0 ? (
                <EmptyState
                  icon={<Activity size={18} />}
                  title="No services reported"
                />
              ) : (
                <div className="space-y-2">
                  {(health ?? []).map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          aria-hidden="true"
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDotClass(s.status)}`}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{s.name}</div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                            {s.detail || "—"}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ${
                          s.status === "ok"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : s.status === "unconfigured"
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                              : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ANNOUNCEMENTS (broadcast) ══════════════════════════════════ */}
        {tab === "announcements" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Create form */}
            <form
              onSubmit={createAnnouncement}
              className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6 space-y-4 h-fit"
            >
              <div className="text-sm font-bold flex items-center gap-2">
                <Plus size={16} /> New announcement
              </div>
              <div>
                <label
                  htmlFor="ann-title"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                >
                  Title
                </label>
                <input
                  id="ann-title"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Scheduled maintenance"
                  className={`w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 ${FOCUS_RING}`}
                />
              </div>
              <div>
                <label
                  htmlFor="ann-body"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                >
                  Body
                </label>
                <textarea
                  id="ann-body"
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  rows={4}
                  placeholder="We'll be performing maintenance on…"
                  className={`w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 resize-y ${FOCUS_RING}`}
                />
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Level
                </span>
                <div role="radiogroup" aria-label="Level" className="flex flex-wrap gap-1.5">
                  {ANNOUNCEMENT_LEVELS.map((l) => {
                    const selected = annLevel === l;
                    const dot =
                      l === "critical"
                        ? "bg-red-500"
                        : l === "warning"
                          ? "bg-amber-500"
                          : l === "success"
                            ? "bg-emerald-500"
                            : "bg-indigo-500";
                    return (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAnnLevel(l)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${FOCUS_RING} ${
                          selected
                            ? `${levelBadgeClass(l)} ring-1 ring-black/10 dark:ring-white/15`
                            : "text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={annActive}
                  onChange={(e) => setAnnActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-black dark:accent-zinc-100 cursor-pointer"
                />
                Active (shown to clients)
              </label>
              {annFormError && (
                <div className="text-xs text-red-500">{annFormError}</div>
              )}
              <button
                type="submit"
                disabled={annSaving}
                className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
              >
                {annSaving ? "Publishing…" : "Publish announcement"}
              </button>
            </form>

            {/* Existing list */}
            <div className="lg:col-span-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6">
              <div className="text-sm font-bold mb-4">Published</div>
              {announcementsLoading && !announcements ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              ) : announcementsError && !announcements ? (
                <ErrorState
                  message={announcementsError}
                  onRetry={() => setAnnouncementsTick((t) => t + 1)}
                />
              ) : announcements && announcements.length === 0 ? (
                <EmptyState
                  icon={<Megaphone size={18} />}
                  title="No announcements yet"
                  hint="Create one using the form on the left."
                />
              ) : (
                <div className="space-y-3">
                  {(announcements ?? []).map((a) => (
                    <div
                      key={a._id}
                      className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">
                              {a.title}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full capitalize ${levelBadgeClass(a.level)}`}
                            >
                              {a.level}
                            </span>
                            {!a.active && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap break-words">
                            {a.body}
                          </div>
                          <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
                            {a.createdByEmail || "—"} · {fmtDateTime(a.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleAnnouncement(a)}
                            disabled={annBusyId === a._id}
                            aria-label={
                              a.active
                                ? "Deactivate announcement"
                                : "Activate announcement"
                            }
                            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
                              a.active
                                ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            } ${FOCUS_RING}`}
                          >
                            {a.active ? "Active" : "Inactive"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAnnouncement(a._id)}
                            disabled={annBusyId === a._id}
                            aria-label="Delete announcement"
                            className={`p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ GLOBAL CONVERSATION SEARCH ═════════════════════════════════ */}
        {tab === "search" && (
          <div>
            <div className="relative mb-4 max-w-xl">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations across all tenants…"
                aria-label="Search conversations across all tenants"
                autoFocus
                className={`w-full pl-9 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 ${FOCUS_RING}`}
              />
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-4">
              {!searchDebounced ? (
                <EmptyState
                  icon={<Search size={18} />}
                  title="Search every conversation"
                  hint="Type a visitor name, email, or message snippet."
                />
              ) : searchLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : searchError ? (
                <ErrorState
                  message={searchError}
                  onRetry={() => setSearchTick((t) => t + 1)}
                />
              ) : searchResults && searchResults.length === 0 ? (
                <EmptyState
                  icon={<Inbox size={18} />}
                  title="No matches"
                  hint="Try a different term."
                />
              ) : (
                <div className="space-y-2">
                  {(searchResults ?? []).map((r) => (
                    <button
                      key={r._id}
                      type="button"
                      onClick={() => openOwner(r.ownerId, r.ownerEmail)}
                      className={`w-full text-left p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-500 transition cursor-pointer ${FOCUS_RING}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold truncate">
                          {r.visitorName || r.visitorEmail || "Visitor"}
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                          {fmtDate(r.updatedAt)}
                        </span>
                      </div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
                        {r.ownerEmail}
                      </div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                        {r.lastMessage || "—"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ KNOWLEDGE GAPS ═════════════════════════════════════════════ */}
        {tab === "gaps" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto sleek-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                    <th className="px-6 py-4 font-bold">Unanswered question</th>
                    <th className="px-6 py-4 font-bold text-right">Count</th>
                    <th className="px-6 py-4 font-bold">Last asked</th>
                  </tr>
                </thead>
                <tbody>
                  {gapsLoading && !gaps && <TableSkeleton cols={3} />}
                  {gapsError && !gaps && (
                    <tr>
                      <td colSpan={3} className="px-6 py-10">
                        <ErrorState
                          message={gapsError}
                          onRetry={() => setGapsTick((t) => t + 1)}
                        />
                      </td>
                    </tr>
                  )}
                  {gaps && gaps.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-10">
                        <EmptyState
                          icon={<HelpCircle size={18} />}
                          title="No knowledge gaps"
                          hint="Questions bots couldn't answer will surface here."
                        />
                      </td>
                    </tr>
                  )}
                  {(gaps ?? []).map((g, i) => (
                    <tr
                      key={`${g.question}-${i}`}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                      <td className="px-6 py-4 font-medium">{g.question}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {g.count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {fmtDate(g.lastAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ ALERTS ═════════════════════════════════════════════════════ */}
        {tab === "alerts" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6">
            {alertsLoading && !alerts ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : alertsError && !alerts ? (
              <ErrorState
                message={alertsError}
                onRetry={() => setAlertsTick((t) => t + 1)}
              />
            ) : alerts && alerts.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={18} />}
                title="All clear"
                hint="No abuse or usage-spike alerts right now."
              />
            ) : (
              <div className="space-y-2">
                {(alerts ?? []).map((al, i) => (
                  <div
                    key={`${al.ownerId}-${al.type}-${i}`}
                    className="flex items-start justify-between gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <AlertTriangle
                        size={18}
                        className="text-amber-500 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            {al.type}
                          </span>
                          <button
                            type="button"
                            onClick={() => openOwner(al.ownerId, al.ownerEmail)}
                            className={`text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer rounded ${FOCUS_RING}`}
                          >
                            {al.ownerEmail || al.ownerId}
                          </button>
                        </div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 break-words">
                          {al.detail}
                        </div>
                      </div>
                    </div>
                    <div className="text-lg font-extrabold tracking-tight shrink-0 text-amber-600 dark:text-amber-400">
                      {al.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ LEADERBOARDS ═══════════════════════════════════════════════ */}
        {tab === "leaderboards" && (
          <>
            {leaderboardsLoading && !leaderboards ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-72 w-full rounded-2xl" />
                ))}
              </div>
            ) : leaderboardsError && !leaderboards ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-10">
                <ErrorState
                  message={leaderboardsError}
                  onRetry={() => setLeaderboardsTick((t) => t + 1)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Leaderboard
                  title="By messages"
                  icon={<MessageCircle size={16} />}
                  rows={leaderboards?.byMessages ?? []}
                  onPick={openOwner}
                />
                <Leaderboard
                  title="By conversations"
                  icon={<MessagesSquare size={16} />}
                  rows={leaderboards?.byConversations ?? []}
                  onPick={openOwner}
                />
                <Leaderboard
                  title="By escalations"
                  icon={<AlertTriangle size={16} />}
                  rows={leaderboards?.byEscalations ?? []}
                  onPick={openOwner}
                />
              </div>
            )}
          </>
        )}

        {/* ══ STAFF / ADMINS (superadmin-only) ═══════════════════════════ */}
        {tab === "admins" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Promote form */}
            <form
              onSubmit={addAdmin}
              className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6 space-y-4 h-fit"
            >
              <div className="text-sm font-bold flex items-center gap-2">
                <UserPlus size={16} /> Add staff
              </div>
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                >
                  User email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="person@company.com"
                  className={`w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 ${FOCUS_RING}`}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-role"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                >
                  Role
                </label>
                <select
                  id="admin-role"
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 capitalize ${FOCUS_RING}`}
                >
                  {ADMIN_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {adminFormError && (
                <div className="text-xs text-red-500">{adminFormError}</div>
              )}
              <button
                type="submit"
                disabled={adminSaving}
                className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
              >
                {adminSaving ? "Adding…" : "Add staff member"}
              </button>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Only superadmins can manage staff.
              </p>
            </form>

            {/* Staff list */}
            <div className="lg:col-span-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6">
              <div className="text-sm font-bold mb-4">Current staff</div>
              {adminsForbidden ? (
                <EmptyState
                  icon={<ShieldCheck size={18} />}
                  title="Superadmin only"
                  hint="Only superadmins can manage staff."
                />
              ) : adminsLoading && !admins ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : adminsError && !admins ? (
                <ErrorState
                  message={adminsError}
                  onRetry={() => setAdminsTick((t) => t + 1)}
                />
              ) : admins && admins.length === 0 ? (
                <EmptyState
                  icon={<UserCog size={18} />}
                  title="No staff yet"
                  hint="Promote a user with the form on the left."
                />
              ) : (
                <div className="space-y-2">
                  {(admins ?? []).map((a) => (
                    <div
                      key={a._id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {a.name || "—"}
                        </div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                          {a.email}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400 capitalize">
                          {a.adminRole}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAdmin(a._id)}
                          disabled={adminBusyId === a._id}
                          aria-label={`Remove ${a.email}`}
                          className={`p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Drill-in drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 bg-black/30 cursor-default"
            onClick={closeDrawer}
          />
          <motion.div
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            role="dialog"
            aria-modal="true"
            aria-label="Client details"
            className="relative w-full sm:max-w-lg bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-bold truncate">
                  {detail?.client.businessName ||
                    selected.businessName ||
                    "Unnamed"}
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {detail?.client.email || selected.email}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {detail && (
                    <>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {detail.client.provider || "—"}
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        Joined {fmtDate(detail.client.createdAt)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          detail.client.isActive
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            detail.client.isActive
                              ? "bg-emerald-500"
                              : "bg-red-500"
                          }`}
                        />
                        {detail.client.isActive ? "Active" : "Disabled"}
                      </span>
                    </>
                  )}
                  {profile?.lifecycle === "Suspended" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400">
                      Suspended
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  {impersonateConfirm === selected.ownerId ? (
                    <button
                      onClick={() => doImpersonate(selected.ownerId)}
                      disabled={impersonating}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-600 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-400 dark:bg-amber-500/10 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <UserCog size={13} />
                      {impersonating ? "Impersonating…" : "Confirm impersonate"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setImpersonateConfirm(selected.ownerId)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer inline-flex items-center gap-1"
                    >
                      <UserCog size={13} /> Impersonate
                    </button>
                  )}
                  {impersonateError && (
                    <div className="text-xs text-red-500 mt-2">
                      {impersonateError}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={closeDrawer}
                autoFocus
                aria-label="Close client details"
                className={`p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer shrink-0 ${FOCUS_RING}`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* DETAIL VIEW */}
              {drawerView === "detail" && (
                <>
                  {detailLoading && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-zinc-200/60 dark:border-zinc-800 p-3"
                          >
                            <Skeleton className="h-3 w-20 mb-2" />
                            <Skeleton className="h-5 w-12" />
                          </div>
                        ))}
                      </div>
                      <Skeleton className="h-24 w-full" />
                    </div>
                  )}
                  {!detailLoading && detailError && (
                    <ErrorState
                      message={detailError}
                      onRetry={() => selected && openClient(selected)}
                    />
                  )}
                  {!detailLoading && !detailError && detail && (
                    <div className="space-y-6">
                      {/* Usage grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <UsageStat
                          icon={<Bot size={14} />}
                          label="Bots"
                          value={detail.usage.bots}
                        />
                        <UsageStat
                          icon={<MessagesSquare size={14} />}
                          label="Conversations"
                          value={detail.usage.conversations}
                        />
                        <UsageStat
                          icon={<MessageCircle size={14} />}
                          label="Messages"
                          value={detail.usage.messages}
                        />
                        <UsageStat
                          icon={<AlertTriangle size={14} />}
                          label="Fallback rate"
                          value={`${Math.round(detail.usage.fallbackRate * 100)}%`}
                        />
                        <UsageStat
                          icon={<Database size={14} />}
                          label="Knowledge chunks"
                          value={detail.usage.knowledgeChunks}
                        />
                        <UsageStat
                          icon={<FileText size={14} />}
                          label="Knowledge sources"
                          value={detail.usage.knowledgeSources}
                        />
                        <UsageStat
                          icon={<Brain size={14} />}
                          label="Memories"
                          value={detail.usage.memories}
                        />
                        <UsageStat
                          icon={<UsersRound size={14} />}
                          label="Team members"
                          value={detail.usage.teamMembers}
                        />
                        <div className="col-span-2">
                          <UsageStat
                            icon={<Clock size={14} />}
                            label="Last active"
                            value={fmtDate(detail.usage.lastActive)}
                          />
                        </div>
                      </div>

                      {/* Per-client usage chart */}
                      {detail.series.length > 0 && (
                        <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800 p-4">
                          <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-4">
                            Usage · last {detail.range.days} days
                          </div>
                          <div className="space-y-4">
                            <BarRow
                              label="Messages"
                              accent="bg-black dark:bg-zinc-100"
                              data={detail.series.map((s) => ({
                                date: s.date,
                                value: s.messages,
                              }))}
                            />
                            <BarRow
                              label="Conversations"
                              accent="bg-indigo-500 dark:bg-indigo-400"
                              data={detail.series.map((s) => ({
                                date: s.date,
                                value: s.conversations,
                              }))}
                            />
                          </div>
                        </div>
                      )}

                      {/* Bots list */}
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                          Bots ({detail.bots.length})
                        </div>
                        <div className="space-y-2">
                          {detail.bots.length === 0 && (
                            <div className="text-sm text-zinc-400 dark:text-zinc-500">
                              No bots.
                            </div>
                          )}
                          {detail.bots.map((b) => (
                            <div
                              key={b._id}
                              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">
                                  {b.name || "Unnamed bot"}
                                </div>
                                <div className="text-xs text-zinc-400 dark:text-zinc-500">
                                  ~{b.knowledgeChars.toLocaleString()} chars
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {b.isDefault && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                                    Default
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    b.isActive
                                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                  }`}
                                >
                                  {b.isActive ? "Active" : "Inactive"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Team list */}
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                          Team ({detail.team.length})
                        </div>
                        <div className="space-y-2">
                          {detail.team.length === 0 && (
                            <div className="text-sm text-zinc-400 dark:text-zinc-500">
                              No team members.
                            </div>
                          )}
                          {detail.team.map((t) => (
                            <div
                              key={t._id}
                              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">
                                  {t.name || "—"}
                                </div>
                                <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                                  {t.email}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Account / CRM */}
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                          Account / CRM
                        </div>
                        {profileLoading && !profile ? (
                          <div className="space-y-3">
                            <Skeleton className="h-20 w-full rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                            <Skeleton className="h-10 w-2/3 rounded-xl" />
                          </div>
                        ) : profileError && !profile ? (
                          <ErrorState
                            message={profileError}
                            onRetry={() =>
                              selected && loadProfile(selected.ownerId)
                            }
                          />
                        ) : profile ? (
                          <div className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                            {/* Notes */}
                            <div>
                              <label
                                htmlFor="crm-notes"
                                className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                              >
                                Internal notes
                              </label>
                              <textarea
                                id="crm-notes"
                                value={profile.notes}
                                onChange={(e) => {
                                  setProfile({
                                    ...profile,
                                    notes: e.target.value,
                                  });
                                  setProfileSaved(false);
                                }}
                                rows={3}
                                placeholder="Private notes about this account…"
                                className={`w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 resize-y ${FOCUS_RING}`}
                              />
                            </div>

                            {/* Tags */}
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                                Tags
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {profile.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                  >
                                    {t}
                                    <button
                                      type="button"
                                      onClick={() => removeTag(t)}
                                      aria-label={`Remove tag ${t}`}
                                      className={`hover:text-red-500 cursor-pointer rounded ${FOCUS_RING}`}
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                ))}
                                <input
                                  value={newTag}
                                  onChange={(e) => setNewTag(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addTag();
                                    }
                                  }}
                                  placeholder="Add tag…"
                                  aria-label="Add tag"
                                  className={`flex-1 min-w-[90px] px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 ${FOCUS_RING}`}
                                />
                              </div>
                            </div>

                            {/* Lifecycle + quota */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label
                                  htmlFor="crm-lifecycle"
                                  className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                                >
                                  Lifecycle
                                </label>
                                <select
                                  id="crm-lifecycle"
                                  value={profile.lifecycle}
                                  onChange={(e) => {
                                    setProfile({
                                      ...profile,
                                      lifecycle: e.target.value,
                                    });
                                    setProfileSaved(false);
                                  }}
                                  className={`w-full px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 ${FOCUS_RING}`}
                                >
                                  {LIFECYCLE_OPTIONS.map((l) => (
                                    <option key={l} value={l}>
                                      {l}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label
                                  htmlFor="crm-quota"
                                  className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5"
                                >
                                  Monthly quota
                                </label>
                                <input
                                  id="crm-quota"
                                  type="number"
                                  min={0}
                                  value={profile.monthlyMessageQuota}
                                  onChange={(e) => {
                                    setProfile({
                                      ...profile,
                                      monthlyMessageQuota: Math.max(
                                        0,
                                        Number(e.target.value) || 0,
                                      ),
                                    });
                                    setProfileSaved(false);
                                  }}
                                  className={`w-full px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:text-zinc-100 ${FOCUS_RING}`}
                                />
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                  0 = unlimited
                                </span>
                              </div>
                            </div>

                            {/* Feature flags */}
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                                Feature flags
                              </span>
                              <div className="space-y-1.5">
                                {Object.keys(profile.featureFlags).length ===
                                  0 && (
                                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                                    No flags set.
                                  </div>
                                )}
                                {Object.entries(profile.featureFlags).map(
                                  ([key, on]) => (
                                    <div
                                      key={key}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span className="text-sm font-medium truncate">
                                        {key}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => toggleFlag(key)}
                                        role="switch"
                                        aria-checked={on}
                                        aria-label={`Toggle ${key}`}
                                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition cursor-pointer ${
                                          on
                                            ? "bg-emerald-500"
                                            : "bg-zinc-300 dark:bg-zinc-700"
                                        } ${FOCUS_RING}`}
                                      >
                                        <span
                                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                            on ? "translate-x-4" : "translate-x-0.5"
                                          }`}
                                        />
                                      </button>
                                    </div>
                                  ),
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-2">
                                <input
                                  value={newFlagKey}
                                  onChange={(e) => setNewFlagKey(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addFlag();
                                    }
                                  }}
                                  placeholder="new_flag_key"
                                  aria-label="New feature flag key"
                                  className={`flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs outline-none focus:border-black dark:text-zinc-100 dark:placeholder-zinc-500 ${FOCUS_RING}`}
                                />
                                <button
                                  type="button"
                                  onClick={addFlag}
                                  aria-label="Add feature flag"
                                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer ${FOCUS_RING}`}
                                >
                                  <Plus size={13} /> Add
                                </button>
                              </div>
                            </div>

                            {profileError && (
                              <div className="text-xs text-red-500">
                                {profileError}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={saveProfile}
                              disabled={profileSaving}
                              className={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-black text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                            >
                              {profileSaving ? (
                                "Saving…"
                              ) : profileSaved ? (
                                <>
                                  <Check size={15} /> Saved
                                </>
                              ) : (
                                "Save account"
                              )}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* View conversations */}
                      <button
                        onClick={loadConversations}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer ${FOCUS_RING}`}
                      >
                        <MessagesSquare size={16} /> View conversations
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* CONVERSATIONS LIST VIEW */}
              {drawerView === "conversations" && (
                <div>
                  <button
                    onClick={() => setDrawerView("detail")}
                    className={`text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-200 mb-4 flex items-center gap-1 cursor-pointer rounded-md ${FOCUS_RING}`}
                  >
                    <ArrowLeft size={14} /> Back to details
                  </button>
                  {drillLoading && (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-xl" />
                      ))}
                    </div>
                  )}
                  {!drillLoading && drillError && (
                    <ErrorState
                      message={drillError}
                      onRetry={loadConversations}
                    />
                  )}
                  {!drillLoading && !drillError && (
                    <div className="space-y-2">
                      {conversations.length === 0 && (
                        <EmptyState
                          icon={<MessagesSquare size={18} />}
                          title="No conversations yet"
                          hint="This client hasn't had any chats so far."
                        />
                      )}
                      {conversations.map((conv) => (
                        <button
                          key={conv._id}
                          onClick={() => openTranscript(conv._id)}
                          className={`w-full text-left p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-500 transition cursor-pointer ${FOCUS_RING}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">
                              {conv.messageCount} messages
                            </span>
                            {conv.escalated && (
                              <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/15 dark:text-red-400 px-2 py-0.5 rounded-full">
                                Escalated
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                            {fmtDate(conv.updatedAt)} · visitor{" "}
                            {conv.visitorId.slice(0, 8)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TRANSCRIPT VIEW */}
              {drawerView === "transcript" && (
                <div>
                  <button
                    onClick={() => setDrawerView("conversations")}
                    className={`text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-200 mb-4 flex items-center gap-1 cursor-pointer rounded-md ${FOCUS_RING}`}
                  >
                    <ArrowLeft size={14} /> Back to conversations
                  </button>
                  {drillLoading && (
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-2/3 rounded-2xl ml-auto" />
                      <Skeleton className="h-10 w-3/4 rounded-2xl" />
                      <Skeleton className="h-10 w-1/2 rounded-2xl ml-auto" />
                      <Skeleton className="h-10 w-2/3 rounded-2xl" />
                    </div>
                  )}
                  {!drillLoading && drillError && (
                    <ErrorState
                      message={drillError}
                      onRetry={() => setDrawerView("conversations")}
                    />
                  )}
                  {!drillLoading && !drillError && transcript && (
                    <div className="space-y-3">
                      {transcript.map((m) => {
                        if (m.role === "user") {
                          return (
                            <div
                              key={m._id}
                              className="max-w-[85%] px-3 py-2 rounded-2xl text-sm bg-black text-white dark:bg-white dark:text-zinc-900 ml-auto rounded-tr-sm"
                            >
                              {m.content}
                            </div>
                          );
                        }
                        if (m.role === "agent") {
                          return (
                            <div key={m._id} className="max-w-[85%] mr-auto">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1 ml-1">
                                Agent
                              </div>
                              <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-sm bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/30">
                                {m.content}
                              </div>
                            </div>
                          );
                        }
                        // bot
                        return (
                          <div
                            key={m._id}
                            className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm text-sm bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 mr-auto"
                          >
                            {m.content}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Leaderboard({
  title,
  icon,
  rows,
  onPick,
}: {
  title: string;
  icon: React.ReactNode;
  rows: LeaderRow[];
  onPick: (ownerId: string, ownerEmail: string) => void;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6">
      <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 mb-4">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">
          {title}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Trophy size={18} />} title="No data yet" />
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <button
              key={`${r.ownerId}-${i}`}
              type="button"
              onClick={() => onPick(r.ownerId, r.ownerEmail)}
              className={`w-full flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer text-left ${FOCUS_RING}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    i === 0
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium truncate">
                  {r.ownerEmail || r.ownerId}
                </span>
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0">
                {r.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800 p-3">
      <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-lg font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

export default AdminClient;
