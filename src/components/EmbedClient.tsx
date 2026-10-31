"use client";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import {
  Copy,
  CopyCheck,
  Code2,
  Globe,
  ArrowLeft,
  SendHorizonal,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

function EmbedClient({ ownerId }: { ownerId: string }) {
  const navigate = useRouter();
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const scriptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/chatBot.js`;

  const embedCode = `<script 
  src="${scriptUrl}" 
  data-owner-id="${ownerId}">
</script>`;

  const copyCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-8 overflow-x-hidden">
      {/* Navigation */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="text-lg font-semibold cursor-pointer flex items-center gap-2"
            onClick={() => navigate.push("/")}
          >
            <Logo size={32} />
            <span className="text-lg font-bold tracking-tight">Sahayak <span className="text-zinc-400 dark:text-zinc-500 font-medium">AI</span></span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-800 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer font-medium"
              onClick={() => navigate.push("/dashboard")}
            >
              <ArrowLeft size={16} />
              Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl space-y-8"
        >
          {/* Header Section */}
          <section>
            <h1 className="text-3xl font-bold tracking-tight">Installation</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2">
              Follow these steps to integrate the AI support assistant into your
              website.
            </p>
          </section>

          {/* Code Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/40">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                <Code2 size={18} />
                Embed Script
              </div>
              <button
                className={`flex items-center gap-2 min-w-[95px] justify-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  copied
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30"
                    : "bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-200 shadow-sm dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:border-zinc-800"
                }`}
                onClick={copyCode}
              >
                {copied ? (
                  <>
                    <CopyCheck size={14} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy Code
                  </>
                )}
              </button>
            </div>
            <div className="p-6 bg-zinc-900 dark:bg-black overflow-x-auto">
              <pre className="text-sm font-mono leading-relaxed">
                <code className="text-zinc-400">&lt;</code>
                <code className="text-pink-400">script</code>
                <br />
                <span className="pl-4 text-blue-300">src</span>
                <code className="text-zinc-400">=&quot;</code>
                <code className="text-emerald-400">{scriptUrl}</code>
                <code className="text-zinc-400">&quot;</code>
                <br />
                <span className="pl-4 text-blue-300">data-owner-id</span>
                <code className="text-zinc-400">=&quot;</code>
                <code className="text-emerald-400">{ownerId}</code>
                <code className="text-zinc-400">&quot;</code>
                <code className="text-zinc-400">&gt;</code>
                <br />
                <code className="text-zinc-400">&lt;/</code>
                <code className="text-pink-400">script</code>
                <code className="text-zinc-400">&gt;</code>
              </pre>
            </div>
          </div>

          {/* Instructions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                text: "Copy the unique script generated for your account.",
              },
              {
                step: "02",
                text: "Paste it directly before the closing </body> tag.",
              },
              {
                step: "03",
                text: "Refresh your site to see the widget in action.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm"
              >
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 block mb-2">
                  {item.step}
                </span>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-snug">
                  {item.text}
                </p>
              </div>
            ))}
          </div>

          {/* Live Preview Section */}
          <div className="pt-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Globe size={18} className="text-zinc-400 dark:text-zinc-500" />
                  Live Preview
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Preview how it interacts with your site.
                </p>
              </div>
              {!showPreview && (
                <button
                  onClick={() => setShowPreview(true)}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Reset Preview
                </button>
              )}
            </div>

            <div className="rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden h-[440px] md:h-[400px]">
              {/* Browser Header */}
              <div className="flex items-center gap-2 px-4 h-10 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-1 text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-2 w-48 sm:w-64 max-w-full justify-center">
                  <Globe size={10} /> your-domain.com
                </div>
              </div>

              {/* Website Content Mockup */}
              <div className="relative h-full bg-zinc-50 dark:bg-zinc-800/40 p-8">
                <div className="space-y-4 max-w-md">
                  <div className="h-8 w-2/3 bg-zinc-200 dark:bg-zinc-700 rounded-lg animate-pulse" />
                  <div className="h-4 w-full bg-zinc-200 dark:bg-zinc-700 rounded-md animate-pulse" />
                  <div className="h-4 w-5/6 bg-zinc-200 dark:bg-zinc-700 rounded-md animate-pulse" />
                </div>

                {/* The Chat Widget Preview */}
                <AnimatePresence>
                  {showPreview && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: 40 }}
                      className="absolute bottom-6 right-4 sm:bottom-10 sm:right-10 flex flex-col items-end gap-4"
                    >
                      {/* Chat Window */}
                      <div className="w-64 sm:w-72 max-w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
                        <div className="bg-black text-white px-4 py-3 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium">
                              Assistant
                            </span>
                          </div>
                          <button
                            onClick={() => setShowPreview(false)}
                            className="hover:opacity-70 transition"
                          >
                            <span className="text-xs">╳</span>
                          </button>
                        </div>
                        <div className="p-4 space-y-3 h-48 bg-white dark:bg-zinc-900 overflow-y-auto">
                          <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 text-[11px] px-3 py-2 rounded-2xl rounded-tl-none w-fit max-w-[80%]">
                            Hello! How can I help you today?
                          </div>
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1 }}
                            className="bg-black text-white text-[11px] px-3 py-2 rounded-2xl rounded-tr-none ml-auto w-fit max-w-[80%]"
                          >
                            What is your return policy?
                          </motion.div>
                        </div>
                        <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex gap-2">
                          <div className="h-8 flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg" />
                          <div className="h-8 w-8 bg-black rounded-lg text-white font-xs" />
                        </div>
                      </div>

                      {/* Floating Button */}
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 4 }}
                        className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center shadow-xl text-xl"
                      >
                        🗨️
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default EmbedClient;
