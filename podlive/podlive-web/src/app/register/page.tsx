"use client";

import { useState } from "react";
import { Mic, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";

export default function Register() {
  const router = useRouter();
  const [formData, setFormData] = useState({ unique_handle: "", display_name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    let handle = formData.unique_handle.trim();
    if (!handle.startsWith("@")) handle = "@" + handle;
    try {
      const res = await fetch(buildApiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, unique_handle: handle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-purple-950 via-[#0d0d1a] to-[#080808]">
        <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="relative z-10 p-12 flex flex-col justify-between h-full">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">PodLive</span>
          </Link>
          <div>
            <h2 className="text-3xl font-extrabold text-white mb-3 leading-tight">
              Join thousands<br />of creators.
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
              Start your first live stream in minutes. No equipment needed — just your voice and your story.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 lg:max-w-md flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white">PodLive</span>
          </Link>

          <h1 className="text-2xl font-bold text-white mb-1">Create account</h1>
          <p className="text-sm text-zinc-400 mb-8">
            Already have one?{" "}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Log in</Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Handle</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">@</span>
                <input
                  type="text" required
                  value={formData.unique_handle}
                  onChange={(e) => setFormData({ ...formData, unique_handle: e.target.value })}
                  placeholder="yourname"
                  className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Display Name</label>
              <input
                type="text" required
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="Your Full Name"
                className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Email</label>
              <input
                type="email" required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 flex items-center text-zinc-500 hover:text-zinc-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all glow-indigo disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 mt-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
