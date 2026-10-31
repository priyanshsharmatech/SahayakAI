"use client";
import axios from "axios";
import { useState } from "react";
import { Mail, User, MessageSquare, Tag, AlertCircle, CheckCircle2, Send } from "lucide-react";

type Field = "name" | "email" | "subject" | "message";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Single source of truth for validation — mirrored on the server. */
function validateField(field: Field, value: string): string {
  const v = value.trim();
  switch (field) {
    case "name":
      if (v.length < 2) return "Please enter your name (at least 2 characters).";
      if (v.length > 100) return "Name is too long.";
      return "";
    case "email":
      if (!v) return "Email is required.";
      if (!EMAIL_RE.test(v) || v.length > 200) return "Enter a valid email address.";
      return "";
    case "subject":
      if (v.length > 150) return "Subject is too long.";
      return "";
    case "message":
      if (v.length < 10) return "Message must be at least 10 characters.";
      if (v.length > 5000) return "Message is too long (5000 chars max).";
      return "";
  }
}

const EMPTY: Values = { name: "", email: "", subject: "", message: "" };

/** Self-contained contact form card — usable inline on any page. */
export default function ContactForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");

  const setField = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (touched[field]) setErrors((e) => ({ ...e, [field]: validateField(field, value) }));
  };

  // Validate when the user leaves the field (jumps to the next one).
  const handleBlur = (field: Field) => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: validateField(field, values[field]) }));
  };

  const validateAll = (): boolean => {
    const next: Errors = {};
    (Object.keys(values) as Field[]).forEach((f) => {
      const msg = validateField(f, values[f]);
      if (msg) next[f] = msg;
    });
    setErrors(next);
    setTouched({ name: true, email: true, subject: true, message: true });
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validateAll()) return;
    setLoading(true);
    try {
      await axios.post("/api/contact", {
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject.trim(),
        message: values.message.trim(),
      });
      setSent(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.errors) {
        setErrors(err.response.data.errors as Errors);
        setTouched({ name: true, email: true, subject: true, message: true });
      }
      setFormError(
        (axios.isAxiosError(err) && (err.response?.data?.message as string)) ||
          "Couldn't send your message. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setValues(EMPTY);
    setErrors({});
    setTouched({});
    setFormError("");
    setSent(false);
  };

  const inputBase =
    "w-full rounded-2xl border bg-white dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 pl-10 pr-4 py-3.5 text-sm outline-none transition-all focus:ring-4";
  const okBorder = "border-zinc-200 dark:border-zinc-700 focus:ring-black/5 focus:border-black dark:focus:border-zinc-400";
  const errBorder = "border-red-400 dark:border-red-500 focus:ring-red-500/10 focus:border-red-500";

  if (sent) {
    const email = values.email;
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/60 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
            <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={28} />
          </div>
          <h3 className="text-xl font-bold">Message sent!</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Thanks for reaching out — we&apos;ll reply to <b>{email}</b> soon.
          </p>
          <button
            onClick={reset}
            className="mt-6 px-6 py-3 rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900 text-sm font-bold hover:opacity-90 transition cursor-pointer"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/60 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FieldRow id="c-name" label="Name" icon={<User size={16} />} error={touched.name ? errors.name : undefined}>
          <input
            id="c-name"
            type="text"
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            placeholder="Your name"
            aria-invalid={Boolean(touched.name && errors.name)}
            suppressHydrationWarning
            className={`${inputBase} ${touched.name && errors.name ? errBorder : okBorder}`}
          />
        </FieldRow>

        <FieldRow id="c-email" label="Email" icon={<Mail size={16} />} error={touched.email ? errors.email : undefined}>
          <input
            id="c-email"
            type="email"
            value={values.email}
            onChange={(e) => setField("email", e.target.value)}
            onBlur={() => handleBlur("email")}
            placeholder="you@email.com"
            aria-invalid={Boolean(touched.email && errors.email)}
            suppressHydrationWarning
            className={`${inputBase} ${touched.email && errors.email ? errBorder : okBorder}`}
          />
        </FieldRow>

        <FieldRow id="c-subject" label="Subject (optional)" icon={<Tag size={16} />} error={touched.subject ? errors.subject : undefined}>
          <input
            id="c-subject"
            type="text"
            value={values.subject}
            onChange={(e) => setField("subject", e.target.value)}
            onBlur={() => handleBlur("subject")}
            placeholder="What's this about?"
            aria-invalid={Boolean(touched.subject && errors.subject)}
            suppressHydrationWarning
            className={`${inputBase} ${touched.subject && errors.subject ? errBorder : okBorder}`}
          />
        </FieldRow>

        <FieldRow id="c-message" label="Message" icon={<MessageSquare size={16} />} error={touched.message ? errors.message : undefined} topIcon>
          <textarea
            id="c-message"
            value={values.message}
            onChange={(e) => setField("message", e.target.value)}
            onBlur={() => handleBlur("message")}
            placeholder="Tell us how we can help…"
            rows={5}
            aria-invalid={Boolean(touched.message && errors.message)}
            suppressHydrationWarning
            className={`${inputBase} resize-none leading-relaxed ${touched.message && errors.message ? errBorder : okBorder}`}
          />
        </FieldRow>

        {formError && (
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm font-medium">
            <AlertCircle size={16} /> {formError}
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
              <span>Sending…</span>
            </>
          ) : (
            <>
              <Send size={16} /> Send message
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function FieldRow({
  id,
  label,
  icon,
  error,
  topIcon,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  topIcon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-1">
        {label}
      </label>
      <div className="relative">
        <span
          className={`absolute left-3.5 text-zinc-400 dark:text-zinc-500 ${
            topIcon ? "top-4" : "top-1/2 -translate-y-1/2"
          }`}
        >
          {icon}
        </span>
        {children}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400 ml-1">
          <AlertCircle size={13} /> {error}
        </p>
      )}
    </div>
  );
}
