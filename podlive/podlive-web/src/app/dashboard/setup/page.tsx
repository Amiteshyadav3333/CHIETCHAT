"use client";

import { useState } from "react";
import { Radio, AlertCircle, Loader2, CheckCircle2, Mic, Camera, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

const CATEGORIES = ["Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General"];

export default function SetupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ title: "", description: "", category: "Technology" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoLive = async () => {
    if (!formData.title.trim()) { setError("Title is required."); return; }
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) throw new Error("Please log in again.");
      const res = await fetch(buildApiUrl("/api/live/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start session.");
      router.push(`/live/${data.session.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const checks = [
    { icon: Mic, label: "Microphone ready", ok: true },
    { icon: Camera, label: "Camera connected", ok: true },
    { icon: Wifi, label: "Stable connection", ok: true },
    { icon: CheckCircle2, label: "Title filled", ok: !!formData.title.trim() },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">Live Setup</h1>
        </div>

        <div className="p-6 max-w-4xl">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2 space-y-5">
              <div className="glass p-6 rounded-2xl">
                <h2 className="font-semibold mb-5 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-400" />
                  Stream Details
                </h2>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Title *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="E.g., Tech Talk Episode 12"
                      className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 focus:bg-zinc-900 transition-all text-white placeholder:text-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Description</label>
                    <textarea
                      rows={4}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Tell viewers what this stream is about..."
                      className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 focus:bg-zinc-900 transition-all text-white placeholder:text-zinc-600 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Go Live Button */}
              <div className="glass p-5 rounded-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 to-transparent pointer-events-none" />
                <h3 className="font-semibold mb-1 relative">Ready to broadcast?</h3>
                <p className="text-xs text-zinc-500 mb-5 relative">Make sure your mic and camera are granted.</p>
                <button
                  onClick={handleGoLive}
                  disabled={loading}
                  className="w-full relative bg-red-600 hover:bg-red-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all glow-red disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                  {loading ? "Starting..." : "Go Live Now"}
                </button>
              </div>

              {/* Checklist */}
              <div className="glass p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-zinc-400" />
                  Pre-flight Checklist
                </h3>
                <ul className="space-y-2.5">
                  {checks.map(({ icon: Icon, label, ok }) => (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-green-500/20" : "bg-zinc-800 border border-zinc-700"}`}>
                        {ok && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                      </div>
                      <span className={ok ? "text-zinc-300" : "text-zinc-500"}>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
