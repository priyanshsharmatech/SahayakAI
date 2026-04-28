"use client";
import axios from "axios";
import { LogOut, ArrowRight, Plus, ExternalLink, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface PropsType {
  email?: string;
}

function HomeClient({ email }: PropsType) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const navigate = useRouter();

  const handleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/login";
  };

  const handleLogout = async () => {
    try {
      await axios.get("/api/auth/logout");
      window.location.href = "/";
    } catch (error) { console.log(error); }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const firstLetter = email ? email[0].toUpperCase() : "";

  return (
    <div className="min-h-screen bg-white text-[#111] selection:bg-black selection:text-white font-sans antialiased">
      {/* Header */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-base font-bold tracking-tighter flex items-center gap-2 cursor-pointer" onClick={() => navigate.push("/")}>
            <div className="w-6 h-6 bg-black rounded-sm flex items-center justify-center text-[10px] text-white">S</div>
            SUPPORT AI
          </div>

          <div className="flex items-center gap-6">
            {email ? (
              <div className="relative" ref={popupRef}>
                <button 
                  onClick={() => setOpen(!open)}
                  className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-xs font-bold hover:bg-zinc-200 transition cursor-pointer"
                >
                  {firstLetter}
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: 8 }}
                      className="absolute right-0 mt-3 w-48 bg-white border border-zinc-200 rounded-xl shadow-2xl p-1 overflow-hidden"
                    >
                      <button onClick={() => navigate.push("/dashboard")} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 rounded-lg transition cursor-pointer flex items-center justify-between group">
                        Dashboard <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition" />
                      </button>
                      <div className="h-px bg-zinc-100 my-1" />
                      <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition flex items-center gap-2 cursor-pointer">
                        <LogOut size={14} /> Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                disabled={loading}
                className="text-sm font-bold bg-black text-white px-5 py-2 rounded-full hover:bg-zinc-800 transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Authenticating..." : "Get Started"}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase mb-4 block">Automated Intelligence</span>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-8">
                Your brand, <br />
                <span className="text-zinc-300">now automated.</span>
              </h1>
              <p className="text-lg text-zinc-500 max-w-md leading-relaxed mb-10">
                A minimal, powerful AI support agent trained on your business data. Deploy to any site with one line of code.
              </p>
              <div className="flex items-center gap-4">
                <button 
                  onClick={email ? () => navigate.push("/dashboard") : handleLogin}
                  className="bg-black text-white px-8 py-4 rounded-full text-sm font-bold hover:px-10 transition-all duration-300 cursor-pointer"
                >
                  {email ? "Open Dashboard" : "Start Building"}
                </button>
                <a href="#features" className="text-sm font-bold text-zinc-400 hover:text-black transition">View Features</a>
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-5 relative">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              transition={{ delay: 0.2, duration: 0.8 }}
              className="bg-white border border-zinc-200 rounded-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.1)] p-6 relative overflow-hidden"
            >
              <div className="flex items-center gap-1.5 mb-6">
                <div className="w-2 h-2 rounded-full bg-zinc-200" />
                <div className="w-2 h-2 rounded-full bg-zinc-200" />
              </div>
              <div className="space-y-4 mb-20">
                <div className="bg-zinc-100 p-3 rounded-xl rounded-tl-none w-3/4 text-sm text-zinc-600">
                  Hi! How can I help you today?
                </div>
                <div className="bg-black p-3 rounded-xl rounded-tr-none w-2/3 ml-auto text-sm text-white">
                  What is your refund policy?
                </div>
                <div className="bg-zinc-100 p-3 rounded-xl rounded-tl-none w-4/5 text-sm text-zinc-600 leading-relaxed">
                  We offer a 14-day no-questions-asked refund policy for all customers.
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full p-4 border-t border-zinc-100 bg-white flex gap-2">
                <div className="flex-1 h-8 bg-zinc-50 border border-zinc-100 rounded-md" />
                <div className="w-8 h-8 bg-black rounded-md flex items-center justify-center text-[10px] text-white">↑</div>
              </div>
            </motion.div>
            {/* The Floating UI Element */}
            <motion.div 
              animate={{ y: [0, -10, 0] }} 
              transition={{ repeat: Infinity, duration: 4 }}
              className="absolute -top-6 -right-6 bg-white border border-zinc-200 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 z-10"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold tracking-tight">AI Active</span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Bento-style Features */}
      <section id="features" className="bg-zinc-50/50 py-24 border-t border-zinc-100 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 bg-white border border-zinc-200 p-10 rounded-3xl group hover:border-black transition-colors duration-500">
              <Plus className="mb-6 text-zinc-300 group-hover:rotate-90 group-hover:text-black transition-all duration-500" />
              <h3 className="text-2xl font-bold mb-4 tracking-tight">Zero-Code Integration</h3>
              <p className="text-zinc-500 max-w-sm">Just paste our lightweight script tag and your chatbot is live. No complex API management or backend setup required.</p>
            </div>
            
            <div className="md:col-span-4 bg-black p-10 rounded-3xl text-white">
              <Shield className="mb-6 text-zinc-600" />
              <h3 className="text-2xl font-bold mb-4 tracking-tight">Full Control</h3>
              <p className="text-zinc-400">You manage the knowledge base. The AI only speaks what you allow it to know.</p>
            </div>

            <div className="md:col-span-12 bg-white border border-zinc-200 p-10 rounded-3xl flex flex-col md:flex-row justify-between items-end group hover:border-black transition-colors duration-500">
              <div className="max-w-md">
                <ExternalLink className="mb-6 text-zinc-300 group-hover:text-black transition-colors" />
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Live 24/7 Support</h3>
                <p className="text-zinc-500">Your AI never sleeps. Resolve customer tickets, answer FAQs, and capture leads while you are offline.</p>
              </div>
              <div className="mt-8 md:mt-0 text-[80px] font-bold leading-none tracking-tighter text-zinc-100 select-none group-hover:text-zinc-200 transition-colors">
                24/7
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-zinc-100 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xs font-bold tracking-tighter text-zinc-400">
            &copy; {new Date().getFullYear()} SUPPORTAI LABS. ALL RIGHTS RESERVED.
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-xs font-bold text-zinc-400 hover:text-black transition uppercase tracking-widest">Privacy</a>
            <a href="#" className="text-xs font-bold text-zinc-400 hover:text-black transition uppercase tracking-widest">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomeClient;