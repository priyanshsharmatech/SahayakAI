"use client";
import axios from "axios";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings, Mail, Building2, BookOpen, Save, AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";

function DashboardClient({ ownerId }: { ownerId: string }) {
  const navigate = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSettings = async () => {
    if (!businessName.trim() || !supportEmail.trim() || !knowledge.trim()) {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setLoading(true);
    setStatus("idle");

    try {
      await axios.post("/api/settings", {
        ownerId,
        businessName,
        supportEmail,
        knowledge,
      });
      setLoading(false);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      console.error(error);
      setLoading(false);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (ownerId) {
      const handleGetDetails = async () => {
        try {
          const result = await axios.post("/api/settings/get", { ownerId });
          setBusinessName(result.data?.businessName || "");
          setSupportEmail(result.data?.supportEmail || "");
          setKnowledge(result.data?.knowledge || "");
        } catch (error) {
          console.error(error);
        }
      };
      handleGetDetails();
    }
  }, [ownerId]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans">
      {/* Navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200/60"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => navigate.push("/")}
          >
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white transition-transform group-hover:scale-105">
              <Settings size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight">Sahayak <span className="text-zinc-400 font-medium">AI</span></span>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium hover:bg-zinc-50 transition shadow-sm cursor-pointer"
            onClick={() => navigate.push("/embed")}
          >
            Embed Chatbot
          </button>
        </div>
      </motion.nav>

      <main className="max-w-3xl mx-auto pt-32 pb-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="mb-10">
            <h1 className="text-3xl font-extrabold tracking-tight">Chatbot Config</h1>
            <p className="text-zinc-500 mt-2">
              Train your AI by providing context about your business.
            </p>
          </div>

          <div className="space-y-8">
            {/* Business Details Card */}
            <section className="bg-white rounded-3xl border border-zinc-200/60 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6 text-zinc-800">
                <Building2 size={20} className="text-zinc-400" />
                <h2 className="text-lg font-bold">Identity</h2>
              </div>
              
              <div className="grid gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 ml-1">Business Name</label>
                  <input
                    type="text"
                    className={`w-full rounded-2xl border ${status === 'error' && !businessName ? 'border-red-300 bg-red-50/30' : 'border-zinc-200'} px-4 py-3.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all`}
                    placeholder="Enter brand name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 ml-1">Support Email</label>
                  <input
                    type="email"
                    className={`w-full rounded-2xl border ${status === 'error' && !supportEmail ? 'border-red-300 bg-red-50/30' : 'border-zinc-200'} px-4 py-3.5 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all`}
                    placeholder="help@yourbrand.com"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Knowledge Base Card */}
            <section className="bg-white rounded-3xl border border-zinc-200/60 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 text-zinc-800">
                  <BookOpen size={20} className="text-zinc-400" />
                  <h2 className="text-lg font-bold">Knowledge Base</h2>
                </div>
                <span className="text-[10px] font-bold bg-zinc-100 px-2 py-1 rounded text-zinc-500 uppercase tracking-tighter">AI Training Data</span>
              </div>
              
              <textarea
                className={`w-full h-64 rounded-2xl border ${status === 'error' && !knowledge ? 'border-red-300 bg-red-50/30' : 'border-zinc-200'} px-4 py-4 text-sm focus:ring-4 focus:ring-black/5 focus:border-black outline-none transition-all resize-none leading-relaxed`}
                placeholder="Paste your FAQ, shipping rules, and refund policy here..."
                value={knowledge}
                onChange={(e) => setKnowledge(e.target.value)}
              />
              <p className="mt-3 text-[11px] text-zinc-400 italic">
                Tip: The more detail you provide, the better the AI responds.
              </p>
            </section>

            {/* Action Bar */}
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-zinc-200/60 shadow-sm">
              <div className="flex items-center gap-3 ml-2">
                <AnimatePresence mode="wait">
                  {status === "success" && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                      <CheckCircle2 size={18} />
                      Saved successfully
                    </motion.div>
                  )}
                  {status === "error" && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-2 text-red-500 font-bold text-sm">
                      <AlertCircle size={18} />
                      Fields cannot be empty
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                onClick={handleSettings}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-black text-white text-sm font-bold hover:bg-zinc-800 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-black/10"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Save size={18} /> Save Settings</>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default DashboardClient;