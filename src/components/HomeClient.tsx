"use client";
import axios from "axios";
import {
  ArrowRight,
  BarChart3,
  Code2,
  LogOut,
  MessagesSquare,
  Palette,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import ContactForm from "@/components/ContactForm";
import { useEffect, useRef, useState } from "react";

interface PropsType {
  email?: string;
  isAdmin?: boolean;
}

function HomeClient({ email, isAdmin }: PropsType) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleLogin = () => {
    router.push("/login");
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await axios.post("/api/auth/logout");
      window.location.href = window.location.origin;
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  };

  const firstLetter = email ? email[0].toUpperCase() : "";

  useEffect(() => {
    router.refresh();
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [router, email]);

  const container: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 90 },
    },
  };

  const primaryCta = () => (email ? router.push("/dashboard") : handleLogin());

  // Smoothly scroll to an in-page section. Done in JS (not just CSS) because
  // Next's router intercepts hash-link clicks and would otherwise jump instantly.
  const scrollToSection = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    const el = document.getElementById(id);
    if (!el) return; // let the default anchor behavior handle it
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const logo = <Logo size={32} />;

  const cardHover =
    "hover:border-zinc-900 dark:hover:border-zinc-100 transition-colors duration-300";
  const iconTile =
    "w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100 mb-5";

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-x-hidden">
      {/* ---------------- Nav ---------------- */}
      <motion.nav
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 w-full z-50 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl border-b border-zinc-200/70 dark:border-zinc-800/70"
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => router.push("/")}
          >
            {logo}
            <span className="text-lg font-bold tracking-tight">
              Sahayak{" "}
              <span className="text-zinc-400 dark:text-zinc-500 font-medium">
                AI
              </span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <a
              href="#features"
              onClick={(e) => scrollToSection(e, "features")}
              className="hover:text-zinc-900 dark:hover:text-white transition"
            >
              Features
            </a>
            <a
              href="#how"
              onClick={(e) => scrollToSection(e, "how")}
              className="hover:text-zinc-900 dark:hover:text-white transition"
            >
              How it works
            </a>
            <a
              href="#contact"
              onClick={(e) => scrollToSection(e, "contact")}
              className="hover:text-zinc-900 dark:hover:text-white transition"
            >
              Contact Us
            </a>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {email ? (
              <div className="relative" ref={popupRef}>
                <button
                  suppressHydrationWarning
                  className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-semibold hover:scale-105 transition cursor-pointer"
                  onClick={() => setOpen(!open)}
                >
                  {firstLetter}
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="absolute right-0 mt-3 w-44 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                    >
                      <button
                        suppressHydrationWarning
                        className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                        onClick={() => router.push("/dashboard")}
                      >
                        Dashboard
                      </button>
                      {isAdmin && (
                        <button
                          suppressHydrationWarning
                          className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          onClick={() => router.push("/admin")}
                        >
                          Admin Panel
                        </button>
                      )}
                      <button
                        suppressHydrationWarning
                        className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-4 h-4" />{" "}
                        {loading ? "Logging out..." : "Logout"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                suppressHydrationWarning
                className="px-5 py-2 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? "Loading..." : "Sign in"}
              </button>
            )}
          </div>
        </div>
      </motion.nav>

      {/* ---------------- Hero ---------------- */}
      <section className="relative pt-28 pb-16 px-6">
        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              AI customer support, done right
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] text-balance">
              Turn visitors into
              <br className="hidden sm:block" />
              customers with an
              <br className="hidden sm:block" />
              AI support agent
            </h1>

            <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400 max-w-lg leading-relaxed">
              Add a smart, on-brand chatbot to your website in minutes. It
              answers instantly from your own knowledge base and hands off to a
              human when it matters.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button
                suppressHydrationWarning
                onClick={primaryCta}
                className="group px-6 py-3.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold hover:opacity-90 transition flex items-center gap-2 cursor-pointer"
              >
                {email ? "Go to Dashboard" : "Get started free"}
                <ArrowRight
                  size={18}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </button>
              <a
                href="#how"
                onClick={(e) => scrollToSection(e, "how")}
                className="px-6 py-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                See how it works
              </a>
            </div>

            <div className="mt-6 flex items-center gap-5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> No
                credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{" "}
                Live in ~2 minutes
              </span>
            </div>
          </motion.div>

          {/* Chat mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl shadow-zinc-900/10 border border-zinc-200 dark:border-zinc-800 overflow-hidden max-w-sm mx-auto">
              <div className="bg-zinc-900 dark:bg-zinc-800 px-5 py-4 flex items-center gap-3 text-white">
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg">
                  🤖
                </div>
                <div>
                  <div className="font-semibold text-sm">Support Assistant</div>
                  <div className="flex items-center gap-1.5 text-[11px] opacity-90">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{" "}
                    Online now
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-3 bg-zinc-50 dark:bg-zinc-950/40">
                <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm w-fit max-w-[85%]">
                  Hi! How can I help you today? 👋
                </div>
                <div className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm w-fit max-w-[85%] ml-auto">
                  Do you offer cash on delivery?
                </div>
                <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm w-fit max-w-[85%]">
                  Yes! Cash on delivery is available across all major cities.
                </div>
                <div className="flex items-center gap-1 px-2">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600"
                      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{
                        duration: 1.1,
                        repeat: Infinity,
                        delay: i * 0.15,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                <div className="flex-1 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                <div className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-900">
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4 }}
              className="absolute -top-4 -right-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-xl shadow-xl flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold">AI Active</span>
            </motion.div>

            {/* Floating chat launcher bubble */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="absolute -bottom-5 -right-1 w-14 h-14 rounded-full bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-900 flex items-center justify-center shadow-xl shadow-zinc-900/25"
            >
              {/* <MessagesSquare size={22} /> */}
              💬
            </motion.div>
          </motion.div>
        </div>

        {/* Stats band */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative max-w-4xl mx-auto mt-16 grid grid-cols-3 gap-4"
        >
          {[
            { k: "~2 min", v: "to go live" },
            { k: "24/7", v: "instant answers" },
            { k: "100%", v: "your own data" },
          ].map((s) => (
            <div key={s.v} className="text-center">
              <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
                {s.k}
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {s.v}
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section
        id="features"
        className="scroll-mt-20 px-6 py-16 bg-zinc-50 dark:bg-zinc-900/40 border-t border-zinc-200/70 dark:border-zinc-800/70"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Everything you need
            </h2>
            <p className="mt-3 text-zinc-500 dark:text-zinc-400">
              A complete support layer for your website.
            </p>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-12 gap-4"
          >
            <motion.div
              variants={item}
              className={`md:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-9 rounded-3xl ${cardHover}`}
            >
              <div className={iconTile}>
                <Code2 size={20} />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">
                Zero-code integration
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
                Paste one lightweight script tag and your chatbot is live. No
                APIs, no backend, no maintenance.
              </p>
            </motion.div>

            <motion.div
              variants={item}
              className="md:col-span-4 bg-zinc-900 dark:bg-zinc-800 p-9 rounded-3xl text-white"
            >
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center mb-5">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">
                Full control
              </h3>
              <p className="text-white/70 text-sm">
                The AI only speaks from the knowledge you give it, no
                hallucinated policies or prices.
              </p>
            </motion.div>

            <motion.div
              variants={item}
              className={`md:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-9 rounded-3xl ${cardHover}`}
            >
              <div className={iconTile}>
                <Palette size={20} />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">
                Fully customizable
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                Match your brand colors, avatar, welcome message, and
                conversation starters.
              </p>
            </motion.div>

            <motion.div
              variants={item}
              className={`md:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-9 rounded-3xl ${cardHover}`}
            >
              <div className={iconTile}>
                <MessagesSquare size={20} />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">
                Human handoff
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                Jump into any conversation live when a visitor needs a real
                person.
              </p>
            </motion.div>

            <motion.div
              variants={item}
              className={`md:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-9 rounded-3xl ${cardHover}`}
            >
              <div className={iconTile}>
                <BarChart3 size={20} />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">
                Insightful analytics
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                See conversations, feedback, and the questions your bot
                couldn&apos;t answer.
              </p>
            </motion.div>

            <motion.div
              variants={item}
              className={`md:col-span-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-9 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 ${cardHover}`}
            >
              <div className="max-w-md">
                <div className={iconTile}>
                  <Clock size={20} />
                </div>
                <h3 className="text-xl font-bold mb-2 tracking-tight">
                  Always on, 24/7
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                  Your assistant never sleeps resolving tickets and capturing
                  leads while you&apos;re offline.
                </p>
              </div>
              <div className="text-[80px] md:text-[100px] font-bold leading-none tracking-tighter text-zinc-100 dark:text-zinc-800 select-none">
                24/7
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section
        id="how"
        className="scroll-mt-20 px-6 py-16 border-t border-zinc-200/70 dark:border-zinc-800/70"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Live in three steps
            </h2>
            <p className="mt-3 text-zinc-500 dark:text-zinc-400">
              No developers, no complex setup.
            </p>
          </div>
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-6"
          >
            {[
              {
                n: "01",
                t: "Add your knowledge",
                d: "Paste your FAQs, policies, and product info into the dashboard - that's your bot's brain.",
              },
              {
                n: "02",
                t: "Copy one script tag",
                d: "Grab your unique embed snippet and paste it before the </body> tag of your site.",
              },
              {
                n: "03",
                t: "Go live instantly",
                d: "Your branded assistant starts answering visitors 24/7, and escalates to you when needed.",
              },
            ].map((step) => (
              <motion.div
                key={step.n}
                variants={item}
                className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 ${cardHover}`}
              >
                <div className="text-5xl font-extrabold tracking-tighter text-zinc-100 dark:text-zinc-800">
                  {step.n}
                </div>
                <h3 className="text-lg font-bold mt-3 mb-2">{step.t}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {step.d}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-5xl mx-auto rounded-3xl bg-zinc-900 dark:bg-zinc-900 border border-zinc-800 p-12 md:p-16 text-center"
        >
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Ready to automate your support?
          </h2>
          <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
            Set up your AI assistant in minutes and start delighting customers
            today.
          </p>
          <button
            suppressHydrationWarning
            onClick={primaryCta}
            className="mt-8 px-8 py-3.5 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition inline-flex items-center gap-2 cursor-pointer"
          >
            {email ? "Open Dashboard" : "Get started free"}
            <ArrowRight size={18} />
          </button>
        </motion.div>
      </section>

      {/* ---------------- Contact ---------------- */}
      <section
        id="contact"
        className="scroll-mt-20 px-6 py-16 bg-zinc-50 dark:bg-zinc-900/40 border-t border-zinc-200/70 dark:border-zinc-800/70"
      >
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Get in touch</h2>
            <p className="mt-3 text-zinc-500 dark:text-zinc-400">
              Questions, feedback, or a demo request? Send us a message and we&apos;ll get
              back to you.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="px-6 py-10 border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {logo}
            <span className="font-bold tracking-tight">
              Sahayak{" "}
              <span className="text-zinc-400 dark:text-zinc-500 font-medium">
                AI
              </span>
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            &copy; {new Date().getFullYear()} Sahayak AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default HomeClient;
