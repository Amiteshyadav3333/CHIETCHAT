"use client";

import { useEffect, useState } from "react";
import { Mic, Search, Play, Users, Radio, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";

const CATEGORIES = ["All", "Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General"];

export default function Discover() {
  const router = useRouter();
  const [lives, setLives] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    axios.get(buildApiUrl("/api/live/active"))
      .then(r => { setLives(r.data); setFiltered(r.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = lives;
    if (activeCategory !== "All") result = result.filter(l => l.category === activeCategory);
    if (searchQuery.trim()) result = result.filter(l =>
      l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.host?.unique_handle?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFiltered(result);
  }, [lives, activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight hidden sm:block">PodLive</span>
          </Link>

          <div className="flex-1 max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search live streams..."
                className="w-full bg-zinc-900/80 border border-white/[0.08] rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500/60 transition-all text-white placeholder:text-zinc-500"
              />
            </div>
          </div>

          <Link href="/dashboard" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors flex items-center gap-1.5 shrink-0">
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Go Live</span>
          </Link>
        </div>
      </nav>

      <main className="pt-14">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">Discover Live</h1>
            <p className="text-zinc-400 text-sm">Join real-time podcast streams happening right now</p>
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-6">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat ? "bg-white text-black" : "bg-zinc-900 border border-white/[0.07] text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => <div key={i} className="aspect-video skeleton rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass p-16 rounded-2xl text-center">
              <Radio className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
              <h3 className="text-xl font-bold text-white mb-2">No live streams right now</h3>
              <p className="text-zinc-400 text-sm mb-6">Be the first to go live!</p>
              <Link href="/dashboard/setup" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-colors">
                Start Broadcasting <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((session) => {
                const avatar = session.host?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.host?.display_name || "H")}&background=6366f1&color=fff`;
                return (
                  <div key={session.id} onClick={() => router.push(`/live/${session.id}`)} className="group cursor-pointer fade-up">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-red-500/40 transition-all">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Radio className="w-8 h-8 text-zinc-700" />
                      </div>
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                          <Play className="w-6 h-6 text-white ml-1" fill="white" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-white rounded-full live-dot" /> LIVE
                      </div>
                      <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                        <Users className="w-3 h-3" />{session.viewer_count_peak || 0}
                      </div>
                      {session.category && (
                        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded">{session.category}</div>
                      )}
                    </div>
                    <div className="mt-2.5 flex gap-2.5">
                      <img src={avatar} className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" alt="" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-red-400 transition-colors">{session.title}</p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">@{session.host?.unique_handle}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
