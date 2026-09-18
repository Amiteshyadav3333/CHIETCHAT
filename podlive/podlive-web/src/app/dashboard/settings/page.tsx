"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    fetch(buildApiUrl("/api/user/profile"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setProfile).catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(buildApiUrl("/api/user/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: profile.display_name, bio: profile.bio })
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        const u = localStorage.getItem("user");
        if (u) localStorage.setItem("user", JSON.stringify({ ...JSON.parse(u), display_name: profile.display_name }));
      } else {
        setMessage({ type: "error", text: "Failed to save changes." });
      }
    } catch { setMessage({ type: "error", text: "Network error." }); }
    finally { setSaving(false); }
  };

  const handleLogout = () => {
    ["accessToken", "refreshToken", "user"].forEach(k => localStorage.removeItem(k));
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">Settings</h1>
        </div>

        <div className="p-6 max-w-2xl">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="glass p-6 rounded-2xl space-y-5">
                <h2 className="font-semibold">Profile Details</h2>

                {message && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-xl ${
                    message.type === "success"
                      ? "bg-green-500/10 border border-green-500/30 text-green-400"
                      : "bg-red-500/10 border border-red-500/30 text-red-400"
                  }`}>
                    {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message.text}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Display Name</label>
                  <input
                    type="text"
                    value={profile?.display_name || ""}
                    onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Handle</label>
                  <input
                    type="text"
                    value={profile?.unique_handle || ""}
                    disabled
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-600 cursor-not-allowed"
                  />
                  <p className="text-xs text-zinc-600 mt-1.5">Handles cannot be changed.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Bio</label>
                  <textarea
                    rows={4}
                    value={profile?.bio || ""}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Tell your audience about yourself..."
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600 resize-none"
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div className="glass p-6 rounded-2xl border-red-500/10">
                <h2 className="font-semibold text-red-400 mb-4">Danger Zone</h2>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
