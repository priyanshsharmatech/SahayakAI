"use client";
import axios from "axios";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, Lock, User, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

type Mode = "login" | "signup" | "forgot" | "reset";

const COPY: Record<
  Mode,
  { title: string; subtitle: string; cta: string; busy: string }
> = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to your Sahayak AI account.",
    cta: "Sign in",
    busy: "Signing in…",
  },
  signup: {
    title: "Create your account",
    subtitle: "Set a password to get started.",
    cta: "Create account",
    busy: "Creating account…",
  },
  forgot: {
    title: "Forgot password",
    subtitle: "We'll email you a link to reset it.",
    cta: "Send reset link",
    busy: "Sending…",
  },
  reset: {
    title: "Set a new password",
    subtitle: "Choose a new password for your account.",
    cta: "Reset password",
    busy: "Resetting…",
  },
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const copy = COPY[mode];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const showGoogle = mode === "login" || mode === "signup";

  // Sends the Google ID token (credential) to our backend, which verifies it
  // and issues our own session — all without leaving this page.
  const handleGoogleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) return;
      setError("");
      setLoading(true);
      try {
        await axios.post("/api/auth/google-signin", {
          credential: response.credential,
        });
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("Google sign-in failed. Please try again.");
        setLoading(false);
      }
    },
    [router],
  );

  // Load Google Identity Services and render the in-page button.
  useEffect(() => {
    if (!showGoogle || !GOOGLE_CLIENT_ID) return;

    const init = () => {
      const google = (window as unknown as { google?: GoogleAccounts }).google;
      if (!google || !googleBtnRef.current) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      googleBtnRef.current.innerHTML = "";
      // Fit the GSI button to its container so it never overflows on small
      // screens (GSI supports a 200–400px width; desktop container stays 320).
      const available = Math.floor(googleBtnRef.current.offsetWidth) || 320;
      const btnWidth = Math.max(200, Math.min(320, available));
      google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        text: mode === "signup" ? "signup_with" : "signin_with",
        shape: "pill",
        logo_alignment: "center",
        width: btnWidth,
      });
    };

    const existing = document.getElementById("google-gsi");
    if (existing) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.id = "google-gsi";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [showGoogle, mode, handleGoogleCredential]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDone("");
    setLoading(true);
    try {
      if (mode === "login") {
        await axios.post("/api/auth/login", { email, password });
        router.push("/dashboard");
        router.refresh();
        return;
      }
      if (mode === "signup") {
        await axios.post("/api/auth/signup", { name, email, password });
        router.push("/dashboard");
        router.refresh();
        return;
      }
      if (mode === "forgot") {
        const res = await axios.post("/api/auth/forgot-password", { email });
        setDone(res.data?.message || "If an account exists, a link was sent.");
        setLoading(false);
        return;
      }
      if (mode === "reset") {
        await axios.post("/api/auth/reset-password", {
          email: params.get("email"),
          token: params.get("token"),
          password,
        });
        router.push("/dashboard");
        router.refresh();
        return;
      }
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : "Something went wrong. Please try again.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950 flex items-center justify-center px-4 sm:px-6 py-10 text-zinc-900 dark:text-zinc-100 font-sans overflow-x-hidden">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
          <Logo size={36} />
          <span className="text-xl font-bold tracking-tight">
            Sahayak <span className="text-zinc-400 dark:text-zinc-500 font-medium">AI</span>
          </span>
        </Link>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/60 dark:border-zinc-800 p-6 sm:p-8 shadow-sm space-y-5"
        >
          <div>
            <h1 className="text-xl font-bold">{copy.title}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{copy.subtitle}</p>
          </div>

          {mode === "signup" && (
            <Field
              icon={<User size={16} />}
              label="Name"
              type="text"
              value={name}
              onChange={setName}
              placeholder="Your name"
              required={false}
            />
          )}

          {mode !== "reset" && (
            <Field
              icon={<Mail size={16} />}
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@email.com"
            />
          )}

          {(mode === "login" || mode === "signup" || mode === "reset") && (
            <Field
              icon={<Lock size={16} />}
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />
          )}

          {mode === "login" && (
            <div className="text-right -mt-2">
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white"
              >
                Forgot password?
              </Link>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm font-medium">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          {done && (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
              <CheckCircle2 size={16} />
              {done}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            suppressHydrationWarning
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-black/10"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/40 border-t-white dark:border-zinc-900/40 dark:border-t-zinc-900 rounded-full animate-spin" />
                <span>{copy.busy}</span>
              </>
            ) : (
              copy.cta
            )}
          </button>

          {showGoogle && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 flex-1" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500">or</span>
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 flex-1" />
              </div>
              {GOOGLE_CLIENT_ID ? (
                <div
                  ref={googleBtnRef}
                  className="flex justify-center max-w-full overflow-hidden"
                />
              ) : (
                <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                  Google sign-in isn&apos;t configured yet.
                </p>
              )}
            </>
          )}

          <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "login" && (
              <>
                New here?{" "}
                <Link href="/signup" className="font-semibold text-black dark:text-white">
                  Create an account
                </Link>
              </>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-black dark:text-white">
                  Sign in
                </Link>
              </>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <Link href="/login" className="font-semibold text-black dark:text-white">
                Back to sign in
              </Link>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}

interface GoogleAccounts {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, unknown>,
      ) => void;
    };
  };
}

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  required = true,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const isPassword = type === "password";
  const [show, setShow] = useState(false);
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
          {icon}
        </span>
        <input
          type={inputType}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          // Password managers / form-filler extensions inject attributes like
          // `fdprocessedid` before hydration; ignore those on form controls.
          suppressHydrationWarning
          className={`w-full rounded-2xl border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500 pl-10 ${
            isPassword ? "pr-11" : "pr-4"
          } py-3.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all`}
        />
        {isPassword && (
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
        )}
      </div>
    </div>
  );
}

export default AuthForm;
