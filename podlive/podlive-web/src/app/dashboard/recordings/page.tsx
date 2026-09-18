"use client";

import { useEffect, useState } from "react";
import { Video, Play, Loader2, Trash2, Eye, Clock, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";
import { formatDistanceToNow } from "date-fns";

export default function Recordings() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(buildApiUrl("/api/user/recordings"), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setRecordings(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this recording? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(buildApiUrl(`/api/live/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setRecordings(prev => prev.filter(r => r.id !== id));
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center justify-between">
          <h1 className="font-bold text-base">My Recordings</h1>
          <span className="text-xs text-zinc-500">{recordings.length} videos</span>
        </div>

        <div className="p-6 max-w-6xl">
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => (
                <div key={i}>
                  <div className="aspect-video skeleton rounded-xl mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 skeleton rounded w-3/4" />
                    <div className="h-3 skeleton rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <div className="glass p-12 rounded-2xl flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-4">
                <Video className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">No recordings yet</h2>
              <p className="text-zinc-400 text-sm max-w-sm mb-6">Your live sessions will be saved here automatically. Upload a recording to get started.</p>
              <button onClick={() => router.push("/dashboard/setup")} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors">
                <Play className="w-4 h-4" /> Start First Broadcast
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {recordings.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => router.push(`/watch/${rec.id}`)}
                  className="group cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-indigo-500/40 transition-all">
                    {rec.thumbnail_url ? (
                      <img src={rec.thumbnail_url} alt={rec.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-10 h-10 text-zinc-700" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                        <Play className="w-5 h-5 text-white ml-1" fill="white" />
                      </div>
                    </div>

                    {/* Delete btn */}
                    <button
                      onClick={(e) => handleDelete(rec.id, e)}
                      disabled={deletingId === rec.id}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-600/90 hover:bg-red-500 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {deletingId === rec.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>

                    {/* Processing */}
                    {rec.is_processing && (
                      <div className="absolute bottom-2 left-2 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded">Processing</div>
                    )}

                    {/* Category */}
                    {rec.category && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded">{rec.category}</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="mt-2.5">
                    <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors">{rec.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{rec.views || 0}</span>
                      <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{rec.viewer_count_peak || 0} peak</span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" />
                        {rec.ended_at ? formatDistanceToNow(new Date(rec.ended_at), { addSuffix: true }) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
