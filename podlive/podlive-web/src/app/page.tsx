"use client";

import { useEffect, useState } from "react";
import { Mic, Radio, Users, Play, Video, Search, TrendingUp, Clock, Eye, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function VideoCard({ session, isLive = false }: { session: any; isLive?: boolean }) {
  const router = useRouter();
  const href = isLive ? `/live/${session.id}` : `/watch/${session.id}`;
  const avatar = session.host?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.host?.display_name || "H")}&background=6366f1&color=fff`;

  return (
    <div
      onClick={() => router.push(href)}
      className="group cursor-pointer fade-up"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/5 group-hover:border-indigo-500/40 transition-all duration-300">
        {session.thumbnail_url ? (
          <img
            src={session.thumbnail_url}
            alt={session.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full skeleton flex items-center justify-center">
            <Video className="w-10 h-10 text-zinc-700" />
          </div>
        )}

        {/* Hover Play */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30">
            <Play className="w-6 h-6 text-white ml-1" fill="white" />
          </div>
        </div>

        {/* LIVE badge */}
        {isLive && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-white rounded-full live-dot" />
            LIVE
          </div>
        )}

        {/* Viewer count */}
        {isLive && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1">
            <Users className="w-3 h-3" />
            {session.viewer_count_peak || 0}
          </div>
        )}

        {/* Processing badge */}
        {!isLive && session.is_processing && (
          <div className="absolute bottom-2 left-2 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded">
            Processing...
          </div>
        )}

        {/* Category tag */}
        {!isLive && session.category && (
          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded">
            {session.category}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-3 flex gap-3">
        <div
          onClick={(e) => { e.stopPropagation(); router.push(`/creator/${session.host?.id}`); }}
          className="shrink-0 mt-0.5"
        >
          <img
            src={avatar}
            alt={session.host?.display_name}
            className="w-9 h-9 rounded-full object-cover border border-white/10 hover:border-indigo-500 transition-colors"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-white line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors">
            {session.title}
          </h3>
          <div
            onClick={(e) => { e.stopPropagation(); router.push(`/creator/${session.host?.id}`); }}
            className="mt-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            @{session.host?.unique_handle || session.host?.username}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            {isLive ? (
              <span className="text-red-400 font-medium">Live now</span>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                <span>{session.views || session.viewer_count_peak || 0} views</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(session.ended_at || session.created_at), { addSuffix: true })}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = ["All", "Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General"];

export default function Home() {
  const [lives, setLives] = useState<any[]>([]);
  const [vods, setVods] = useState<any[]>([]);
  const [filteredVods, setFilteredVods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vodsLoading, setVodsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const u = localStorage.getItem("user");
      if (u) setUser(JSON.parse(u));
    }

    const fetchLives = async () => {
      try {
        const res = await axios.get(buildApiUrl("/api/live/active"));
        setLives(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchVods = async () => {
      try {
        const res = await axios.get(buildApiUrl("/api/live/vods"));
        setVods(res.data);
        setFilteredVods(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setVodsLoading(false);
      }
    };

    fetchLives();
    fetchVods();
    const interval = setInterval(fetchLives, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeCategory === "All") {
      setFilteredVods(vods);
    } else {
      setFilteredVods(vods.filter(v => v.category === activeCategory));
    }
  }, [activeCategory, vods]);

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight hidden sm:block">PodLive</span>
          </Link>

          {/* Search */}
          <form
            onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) router.push(`/search?q=${searchQuery}`); }}
            className="flex-1 max-w-xl mx-auto"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search podcasts, creators..."
                className="w-full bg-zinc-900/80 border border-white/[0.08] rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500/70 focus:bg-zinc-900 transition-all text-white placeholder:text-zinc-500"
              />
            </div>
          </form>

          {/* Auth */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <Link href="/dashboard" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
                <Radio className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Studio</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/5">
                  Log in
                </Link>
                <Link href="/register" className="text-sm font-semibold bg-white text-black px-4 py-1.5 rounded-full hover:bg-zinc-100 transition-colors">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-14">
        {/* ── HERO (only when no lives) ── */}
        {!loading && lives.length === 0 && (
          <div className="relative overflow-hidden border-b border-white/[0.05]">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-transparent to-purple-950/20" />
            <div className="absolute top-0 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
            <div className="relative max-w-7xl mx-auto px-6 py-20 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-6 text-xs font-medium text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 live-dot" />
                Har Awaaz Ko Ek Stage
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5 gradient-text text-glow">
                Next-Generation<br />Live Podcast Platform
              </h1>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-8">
                Ultra-low latency streams. Invite viewers to stage. Auto-record and publish.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-full font-bold transition-all hover:scale-105 active:scale-95 glow-indigo"
              >
                <Radio className="w-5 h-5" />
                Go Live Now
              </Link>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-12">

          {/* ── LIVE NOW ── */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                Live Now
              </h2>
              <Link href="/discover" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="aspect-video rounded-xl skeleton" />
                ))}
              </div>
            ) : lives.length === 0 ? (
              <div className="flex items-center gap-4 p-5 bg-zinc-900/50 border border-white/[0.05] rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5 text-zinc-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-300">No one is live right now</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Be the first — <Link href="/dashboard/setup" className="text-indigo-400 hover:underline">start broadcasting</Link></p>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {lives.slice(0, 8).map(s => <VideoCard key={s.id} session={s} isLive />)}
              </div>
            )}
          </section>

          {/* ── RECORDED VIDEOS ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                Recorded Videos
              </h2>
            </div>

            {/* Category Filter Chips */}
            <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeCategory === cat
                    ? "bg-white text-black shadow-sm"
                    : "bg-zinc-900 border border-white/[0.07] text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {vodsLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i}>
                    <div className="aspect-video rounded-xl skeleton mb-3" />
                    <div className="flex gap-2">
                      <div className="w-9 h-9 rounded-full skeleton shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 skeleton rounded w-3/4" />
                        <div className="h-3 skeleton rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredVods.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <Video className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
                <p className="font-medium text-zinc-400">No videos in this category yet</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredVods.map(s => <VideoCard key={s.id} session={s} />)}
              </div>
            )}
          </section>

          {/* ── FEATURES STRIP ── */}
          <section className="grid md:grid-cols-3 gap-4 pt-4 border-t border-white/[0.05]">
            {[
              { icon: Radio, color: "indigo", title: "Ultra-Low Latency", desc: "Sub-second WebRTC streams for real-time audience interaction." },
              { icon: Users, color: "purple", title: "Audience to Stage", desc: "Invite any viewer to speak live with a single click." },
              { icon: Video, color: "orange", title: "Auto Recording + HLS", desc: "Auto-recorded in multiple resolutions with adaptive streaming." },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="glass p-5 rounded-2xl hover:border-white/10 transition-colors">
                <div className={`w-10 h-10 rounded-xl bg-${color}-500/15 flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 text-${color}-400`} />
                </div>
                <h3 className="font-bold mb-1.5">{title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
