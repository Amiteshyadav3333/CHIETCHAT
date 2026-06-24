"use client";

import { useEffect, useState } from "react";
import { Users, Eye, Radio, TrendingUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";
import { useSocket } from "@/providers/SocketProvider";

export default function Audience() {
  const router = useRouter();
  const { socket } = useSocket();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }

    fetch(buildApiUrl("/api/user/audience"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setStats).catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!socket) return;
    const u = localStorage.getItem("user");
    if (u) socket.emit("register_user", JSON.parse(u).id);
    const handler = (data: { count: number }) => setStats((p: any) => p ? { ...p, followers: data.count } : p);
    socket.on("follower_count_update", handler);
    return () => { socket.off("follower_count_update", handler); };
  }, [socket]);

  const METRICS = stats ? [
    { label: "Total Followers", value: stats.followers || 0, icon: Users, color: "purple", change: "+12% this month" },
    { label: "Total Views", value: stats.totalViews || 0, icon: Eye, color: "blue", change: "Across all sessions" },
    { label: "Live Sessions", value: stats.totalLives || 0, icon: Radio, color: "red", change: "Completed streams" },
    { label: "Avg. Peak Viewers", value: stats.totalLives > 0 ? Math.round(stats.totalViews / stats.totalLives) : 0, icon: TrendingUp, color: "green", change: "Per session" },
  ] : [];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">Audience Insights</h1>
        </div>

        <div className="p-6 max-w-5xl space-y-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {METRICS.map(({ label, value, icon: Icon, color, change }) => (
                  <div key={label} className="glass p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
                      <div className={`w-8 h-8 rounded-xl bg-${color}-500/15 flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 text-${color}-400`} />
                      </div>
                    </div>
                    <p className="text-3xl font-bold mb-1">{value.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">{change}</p>
                  </div>
                ))}
              </div>

              <div className="glass p-8 rounded-2xl text-center">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/15 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-purple-400" />
                </div>
                <h2 className="font-bold text-xl mb-2">Grow your community</h2>
                <p className="text-sm text-zinc-400 max-w-md mx-auto">
                  Go live consistently to build a loyal audience. Viewers who watch you live are 3x more likely to return.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
