"use client";

import { useState, useEffect } from "react";
import { UploadCloud, Video, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

const CATEGORIES = ["Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General"];

export default function UploadPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ title: "", description: "", category: "Technology" });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sessionId");
    if (sid) setSessionId(sid);
  }, []);

  const handleUpload = async () => {
    if (!formData.title || !videoFile) { setError("Title and video file are required."); return; }
    setLoading(true); setError(""); setUploadProgress(0);
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) throw new Error("Please log in again.");

      const data = new FormData();
      data.append("title", formData.title);
      data.append("description", formData.description);
      data.append("category", formData.category);
      data.append("video", videoFile);
      if (thumbnailFile) data.append("thumbnail", thumbnailFile);
      if (sessionId) data.append("sessionId", sessionId);

      // Simulate progress (XHR for real progress tracking)
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else { try { reject(new Error(JSON.parse(xhr.responseText).error || "Upload failed")); } catch { reject(new Error("Upload failed")); } }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", buildApiUrl("/api/upload"));
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(data);
      });

      setSuccess(true);
      setTimeout(() => router.push("/dashboard/recordings"), 2000);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const thumbnailPreview = thumbnailFile ? URL.createObjectURL(thumbnailFile) : null;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">{sessionId ? "Upload Recording" : "Upload Video"}</h1>
        </div>

        <div className="p-6 max-w-4xl">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2">
              <div className="glass p-6 rounded-2xl space-y-5">
                <h2 className="font-semibold flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-400" />
                  Video Details
                </h2>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}
                {success && (
                  <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm p-3 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />Published successfully! Redirecting...
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="E.g., How to build a startup in 2025"
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Description</label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Tell viewers about this episode..."
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Thumbnail</label>
                    <label className="flex items-center justify-center w-full h-[46px] bg-zinc-900/60 border border-white/[0.08] border-dashed rounded-xl cursor-pointer hover:border-indigo-500/50 transition-all overflow-hidden relative">
                      {thumbnailPreview ? (
                        <img src={thumbnailPreview} className="w-full h-full object-cover absolute inset-0 opacity-70" alt="" />
                      ) : (
                        <span className="flex items-center gap-2 text-xs text-zinc-500">
                          <ImageIcon className="w-4 h-4" />Choose Image
                        </span>
                      )}
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && setThumbnailFile(e.target.files[0])} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Action sidebar */}
            <div className="space-y-4">
              <div className="glass p-5 rounded-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-transparent pointer-events-none" />

                <h3 className="font-semibold mb-4 relative">Select Video</h3>

                <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-indigo-500/30 border-dashed rounded-xl cursor-pointer bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors">
                  <UploadCloud className="w-8 h-8 mb-2 text-indigo-400" />
                  {videoFile ? (
                    <span className="text-xs text-white font-semibold px-3 text-center break-all">{videoFile.name}</span>
                  ) : (
                    <span className="text-xs text-zinc-400 text-center">Click to select MP4 / WebM</span>
                  )}
                  <input type="file" className="hidden" accept="video/mp4,video/webm" onChange={(e) => e.target.files?.[0] && setVideoFile(e.target.files[0])} />
                </label>

                {/* Upload progress */}
                {loading && uploadProgress > 0 && (
                  <div className="mt-4 relative">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={loading || success}
                  className="mt-4 w-full relative bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all glow-indigo disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  {loading ? "Uploading..." : "Publish Video"}
                </button>
              </div>

              <div className="glass p-4 rounded-2xl text-xs text-zinc-500 space-y-1.5">
                <p className="font-semibold text-zinc-400 mb-2">After upload:</p>
                <p>✓ AI subtitles generated (EN, HI, ES)</p>
                <p>✓ HLS adaptive transcoding (1080p → 360p)</p>
                <p>✓ Published to your profile</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
