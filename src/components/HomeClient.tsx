"use client";
import axios from "axios";
import { ExternalLink, LogOut, Plus, Shield } from "lucide-react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface PropsType {
  email?: string;
}

function HomeClient({ email }: PropsType) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/login";
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      // Wait for the server to clear the session cookie
      await axios.get("/api/auth/logout");
      // Force a hard redirect to the home page to clear the 'email' prop
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
    // This tells Next.js to fetch the latest server data (email) 
    // whenever the component mounts or the email prop changes
    router.refresh();

    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [router, email]);

  // Animation Variants with explicit Types
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { type: "spring", stiffness: 100 }
    },
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-white to-zinc-50 text-zinc-900 overflow-x-hidden">
      <motion.div
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-zinc-200"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight cursor-pointer" onClick={() => router.push("/")}>
            <span className="text-lg font-bold tracking-tight">Sahayak <span className="text-zinc-400 font-medium">AI</span></span>
          </div>
          {email ? (
            <div className="relative" ref={popupRef}>
              <button
                className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-semibold hover:scale-105 transition cursor-pointer"
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
                    className="absolute right-0 mt-3 w-44 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden"
                  >
                    <button
                      className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-100 cursor-pointer"
                      onClick={() => router.push("/dashboard")}
                    >
                      Dashboard
                    </button>
                    <button
                      className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-zinc-100 flex align-center gap-2 cursor-pointer"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4 text-red-600" /> {loading ? "Logging out..." : "Logout"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              className="px-5 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-60 flex items-center gap-2 cursor-pointer"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Loading..." : "Login / Signup"}
            </button>
          )}
        </div>
      </motion.div>

      <section className="pt-36 pb-28 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
              AI Customer Support <br />
              Built for Modern websites
            </h1>

            <p className="mt-6 text-lg text-zinc-600 max-w-xl">
              Add a powerful AI chatbot to your website in minutes. Let your
              customers get instant answers using your own business knowledge.
            </p>

            <div className="mt-10 flex gap-4">
              {email ? (
                <button
                  className="px-7 py-3 rounded-xl bg-black text-white font-medium hover:bg-zinc-800 transition disabled:opacity-60 cursor-pointer"
                  onClick={() => router.push("/dashboard")}
                >
                  Go to Dashboard
                </button>
              ) : (
                <button
                  className="px-7 py-3 rounded-xl bg-black text-white font-medium hover:bg-zinc-800 transition disabled:opacity-60 cursor-pointer"
                  onClick={handleLogin}
                >
                  Get Started
                </button>
              )}
              <a
                href="#feature"
                className="px-7 py-3 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
              >
                Learn More
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="rounded-2xl bg-white shadow-2xl border border-zinc-200 p-6">
              <div className="text-sm text-zinc-500 mb-3">
                Live Chat Preview
              </div>
              <hr className="mb-3 text-zinc-500" />
              <div className="space-y-3">
                <div className="bg-black text-white rounded-lg px-4 py-2 text-sm ml-auto w-fit">
                  Do you offer Cash on Delivery?
                </div>
                <div className="bg-zinc-100 rounded-lg px-4 py-2 text-sm w-fit">
                  Yes, Cash on Delivery is available.
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="absolute -bottom-6 -right-6 w-14 h-14 rounded-full bg-black text-white flex items-center justify-center shadow-xl"
              >
                🗨️
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      <section
        id="feature"
        className="bg-zinc-50 pt-28 pb-12 px-6 border-t border-zinc-200"
      >
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="text-3xl font-semibold text-center"
          >
            Why Businesses Choose SupportAI?
          </motion.h2>

          <section id="features" className="bg-zinc-50/50 pt-16 pb-0 px-0">
            <div className="max-w-6xl mx-auto">
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-1 md:grid-cols-12 gap-4"
              >
                <motion.div 
                  variants={itemVariants}
                  className="md:col-span-8 bg-white border border-zinc-200 p-10 rounded-3xl group hover:border-black transition-colors duration-500"
                >
                  <Plus className="mb-6 text-zinc-300 group-hover:rotate-90 group-hover:text-black transition-all duration-500" />
                  <h3 className="text-2xl font-bold mb-4 tracking-tight">Zero-Code Integration</h3>
                  <p className="text-zinc-500 max-w-sm">Just paste our lightweight script tag and your chatbot is live. No complex API management or backend setup required.</p>
                </motion.div>
                
                <motion.div 
                  variants={itemVariants}
                  className="md:col-span-4 bg-black p-10 rounded-3xl text-white"
                >
                  <Shield className="mb-6 text-zinc-600" />
                  <h3 className="text-2xl font-bold mb-4 tracking-tight">Full Control</h3>
                  <p className="text-zinc-400">You manage the knowledge base. The AI only speaks what you allow it to know.</p>
                </motion.div>
    
                <motion.div 
                  variants={itemVariants}
                  className="md:col-span-12 bg-white border border-zinc-200 p-10 rounded-3xl flex flex-col md:flex-row justify-between items-end group hover:border-black transition-colors duration-500"
                >
                  <div className="max-w-md">
                    <ExternalLink className="mb-6 text-zinc-300 group-hover:text-black transition-colors" />
                    <h3 className="text-2xl font-bold mb-4 tracking-tight">Live 24/7 Support</h3>
                    <p className="text-zinc-500">Your AI never sleeps. Resolve customer tickets, answer FAQs, and capture leads while you are offline.</p>
                  </div>
                  <div className="mt-8 md:mt-0 text-[80px] font-bold leading-none tracking-tighter text-zinc-100 select-none group-hover:text-zinc-200 transition-colors">
                    24/7
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </section>
        </div>
      </section>

      <footer className="py-10 text-center text-sm text-zinc-500 border-t border-zinc-100">
        &copy; {new Date().getFullYear()} SupportAI. All rights reserved.
      </footer>
    </div>
  );
}

export default HomeClient;