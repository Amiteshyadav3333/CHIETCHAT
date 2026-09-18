"use client";

import { useEffect, useState } from "react";
import { Radio, Users, Play, Search, TrendingUp, Video, Clock, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";
import { formatDistanceToNow } from "date-fns";

export default function DashboardHome() {
  const router = useRouter();
  const [lives, setLives] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (!u) { router.push("/login"); return; }
    setUser(JSON.parse(u));

    const fetchData = async () => {
      const token = localStorage.getItem("accessToken");
      try {
        const [livesRes, statsRes] = await Promise.all([
          axios.get(buildApiUrl("/api/live/active")),
          fetch(buildApiUrl("/api/user/audience"), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
        ]);
        setLives(livesRes.data);
        setStats(statsRes);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };

    fetchData();
    const interval = setInterval(() => {
      axios.get(buildApiUrl("/api/live/active")).then(r => setLives(r.data)).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [router]);

  const avatar = user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.display_name || "U")}&background=6366f1&color=fff`;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />

      <div className="md:ml-60">
        {/* Top bar */}
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center justify-between">
          <form onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) router.push(`/search?q=${searchQuery}`); }} className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search platform..."
              className="w-full bg-zinc-900/80 border border-white/[0.07] rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500/60 transition-all text-white placeholder:text-zinc-500"
            />
          </form>
          {user && (
            <div className="flex items-center gap-3 ml-4">
              <Link href="/dashboard/setup" className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-white live-dot" />
                Go Live
              </Link>
              <img src={avatar} alt={user.display_name} className="w-8 h-8 rounded-full object-cover border border-white/10" />
            </div>
          )}
        </div>

        <div className="p-6 space-y-8 max-w-6xl">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Followers", value: stats.followers || 0, icon: Users, color: "purple" },
                { label: "Total Views", value: stats.totalViews || 0, icon: Eye, color: "blue" },
                { label: "Live Sessions", value: stats.totalLives || 0, icon: Radio, color: "red" },
                { label: "Active Streams", value: lives.length, icon: TrendingUp, color: "green" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="glass p-4 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
                    <div className={`w-7 h-7 rounded-lg bg-${color}-500/15 flex items-center justify-center`}>
                      <Icon className={`w-3.5 h-3.5 text-${color}-400`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/dashboard/setup" className="glass p-4 rounded-2xl hover:border-red-500/30 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center mb-3">
                <Radio className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="font-semibold text-sm mb-0.5">Start Live Stream</h3>
              <p className="text-xs text-zinc-500">Go live with your audience</p>
            </Link>
            <Link href="/dashboard/upload" className="glass p-4 rounded-2xl hover:border-indigo-500/30 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-3">
                <Video className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="font-semibold text-sm mb-0.5">Upload Video</h3>
              <p className="text-xs text-zinc-500">Publish pre-recorded content</p>
            </Link>
            <Link href="/dashboard/recordings" className="glass p-4 rounded-2xl hover:border-purple-500/30 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center mb-3">
                <Clock className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="font-semibold text-sm mb-0.5">My Recordings</h3>
              <p className="text-xs text-zinc-500">Manage past broadcasts</p>
            </Link>
          </div>

          {/* Live Feed */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold flex items-center gap-2 text-base">
                <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                Live Now
              </h2>
              <Link href="/discover" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">View all →</Link>
            </div>

            {loading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="aspect-video skeleton rounded-xl" />)}
              </div>
            ) : lives.length === 0 ? (
              <div className="glass p-8 rounded-2xl text-center">
                <Radio className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
                <p className="font-semibold text-zinc-300 mb-1">No active streams</p>
                <p className="text-sm text-zinc-500 mb-4">Be the first one to go live!</p>
                <Link href="/dashboard/setup" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
                  <Radio className="w-4 h-4" /> Start Broadcasting
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {lives.map((session) => {
                  const avatar2 = session.host?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.host?.display_name || "H")}&background=6366f1&color=fff`;
                  return (
                    <div key={session.id} onClick={() => router.push(`/live/${session.id}`)} className="group cursor-pointer">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-red-500/40 transition-all">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Radio className="w-8 h-8 text-zinc-700" />
                        </div>
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-1" fill="white" />
                          </div>
                        </div>
                        <div className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-white rounded-full live-dot" /> LIVE
                        </div>
                        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                          <Users className="w-3 h-3" />{session.viewer_count_peak || 0}
                        </div>
                      </div>
                      <div className="mt-2.5 flex gap-2.5">
                        <img src={avatar2} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" alt="" />
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
        </div>
      </div>
    </div>
  );
}
