"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import ContactForm from "@/components/ContactForm";

/** Standalone /contact page (also available inline on the homepage #contact). */
export default function ContactClient() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-x-hidden">
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight">
              Sahayak <span className="text-zinc-400 dark:text-zinc-500 font-medium">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
            >
              <ArrowLeft size={15} /> Home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-20 px-6">
        <div className="max-w-xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Get in touch</h1>
            <p className="mt-3 text-zinc-500 dark:text-zinc-400">
              Questions, feedback, or a demo request? Send us a message and we&apos;ll get back to you.
            </p>
          </motion.div>
          <ContactForm />
        </div>
      </section>
    </div>
  );
}
