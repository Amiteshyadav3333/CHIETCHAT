"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
    Play,
    Pause,
    Volume2,
    Maximize,
    Heart,
    Share2,
    MoreVertical,
    MessageSquare,
    CheckCircle2,
    Users,
    Clock,
    ArrowLeft,
    Loader2,
    Send,
    Settings,
    Activity
} from "lucide-react";
import Hls from "hls.js";
import { buildApiUrl } from "@/lib/api";

// Custom HLS Player Component with Quality Selector
function HlsPlayer({ url, poster, subtitles }: { url: string, poster: string, subtitles: any[] }) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [qualities, setQualities] = useState<any[]>([]);
    const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 is Auto
    const [hlsInstance, setHlsInstance] = useState<Hls | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !url) return;

        let hls: Hls;

        if (Hls.isSupported() && url.includes('.m3u8')) {
            hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
            });
            hls.loadSource(url);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                // Auto is at index -1, then list from lowest to highest
                setQualities(data.levels);
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                setCurrentQuality(hls.currentLevel);
            });

            setHlsInstance(hls);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari supports HLS natively
            video.src = url;
            video.addEventListener('loadedmetadata', () => {
                // Quality selection not cleanly supported on native Safari without custom controls
            });
        } else {
            // Fallback for non-HLS URLs (like raw MP4)
            video.src = url;
            setQualities([{ height: 'Original (MP4)' }]);
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [url]);

    const handleQualityChange = (levelIndex: number) => {
        if (hlsInstance) {
            hlsInstance.currentLevel = levelIndex;
            setCurrentQuality(levelIndex);
            setShowSettings(false);
        }
    };

    return (
        <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
            <video
                ref={videoRef}
                controls
                autoPlay
                crossOrigin="anonymous"
                className="w-full h-full object-contain"
                poster={poster}
            >
                {subtitles && subtitles.map((sub: any, idx: number) => (
                    <track
                        key={sub.id}
                        kind="subtitles"
                        srcLang={sub.language}
                        label={sub.label}
                        src={sub.vtt_url}
                        default={idx === 0}
                    />
                ))}
            </video>

            {/* Quality Settings UI Overlay */}
            {qualities.length > 0 && (
                <div className="absolute top-4 right-4 z-10 flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                    </button>

                    {showSettings && (
                        <div className="mt-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden w-48 shadow-2xl">
                            <div className="px-4 py-2 border-b border-white/10 shadow-sm text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                Video Quality
                            </div>
                            <button
                                onClick={() => handleQualityChange(-1)}
                                className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentQuality === -1 ? 'text-indigo-400 font-bold bg-indigo-500/10' : 'text-zinc-200'}`}
                            >
                                Auto
                                {currentQuality === -1 && <CheckCircle2 className="w-4 h-4" />}
                            </button>
                            {/* Reverse to show Highest to Lowest */}
                            {qualities.length === 1 && qualities[0].height === 'Original (MP4)' ? (
                                <button
                                    className="w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-white/5 transition-colors border-t border-white/5 text-indigo-400 font-bold bg-indigo-500/10"
                                >
                                    Original (MP4)
                                    <CheckCircle2 className="w-4 h-4" />
                                </button>
                            ) : (
                                [...qualities].reverse().map((level, i) => {
                                    const actualIndex = qualities.length - 1 - i;
                                    const isActive = currentQuality === actualIndex;
                                    return (
                                        <button
                                            key={actualIndex}
                                            onClick={() => handleQualityChange(actualIndex)}
                                            className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-white/5 transition-colors border-t border-white/5 ${isActive ? 'text-indigo-400 font-bold bg-indigo-500/10' : 'text-zinc-200'}`}
                                        >
                                            {level.height}p
                                            {isActive && <CheckCircle2 className="w-4 h-4" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function WatchPage() {
    const router = useRouter();
    const params = useParams();
    const [recording, setRecording] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isLiked, setIsLiked] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchRecording = async () => {
            try {
                const res = await fetch(buildApiUrl(`/api/live/${params.id}/recording`));
                const data = await res.json();
                if (res.ok) {
                    setRecording(data);
                }
            } catch (err) {
                console.error("Failed to fetch recording:", err);
            } finally {
                setLoading(false);
            }
        };

        const checkFollowStatus = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token || !recording?.host?.id) return;
                const res = await fetch(buildApiUrl(`/api/user/follow-status/${recording.host.id}`), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setIsFollowing(data.following);
                }
            } catch (err) {
                console.error("Failed to fetch follow status", err);
            }
        };

        const checkLikeStatus = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token) return;
                const res = await fetch(buildApiUrl(`/api/live/${params.id}/like-status`), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setIsLiked(data.liked);
                }
            } catch (err) {
                console.error("Failed to fetch like status", err);
            }
        };

        if (params.id) {
            fetchRecording();
            checkLikeStatus();
        }
    }, [params.id]);

    useEffect(() => {
        const checkFollowStatus = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token || !recording?.host?.id) return;
                const res = await fetch(buildApiUrl(`/api/user/follow-status/${recording.host.id}`), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setIsFollowing(data.following);
                }
            } catch (err) {
                console.error("Failed to fetch follow status", err);
            }
        };
        if (recording && recording.host) {
            checkFollowStatus();
        }
    }, [recording]);

    const handleFollowToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please login to follow creators");
                return;
            }

            const res = await fetch(buildApiUrl("/api/user/follow"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ creatorId: recording.host.id })
            });
            const data = await res.json();
            if (res.ok) {
                setIsFollowing(data.following);
                setRecording((prev: any) => ({
                    ...prev,
                    host: {
                        ...prev.host,
                        follower_count: data.following ? prev.host.follower_count + 1 : prev.host.follower_count - 1
                    }
                }));
            }
        } catch (error) {
            console.error("Error toggling follow:", error);
        }
    };

    const handleLikeToggle = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please log in to like videos.");
                return;
            }

            const res = await fetch(buildApiUrl(`/api/live/${params.id}/like`), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            const data = await res.json();
            if (res.ok) {
                setIsLiked(data.liked);
                setRecording((prev: any) => ({
                    ...prev,
                    like_count: data.liked ? (prev.like_count || 0) + 1 : Math.max(0, (prev.like_count || 1) - 1)
                }));
            }
        } catch (error) {
            console.error("Error toggling like:", error);
        }
    };

    const handleShare = async () => {
        const shareData = {
            title: recording.title,
            text: `Check out this podcast: ${recording.title} on PodLive!`,
            url: window.location.href,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                alert("Link copied to clipboard!");
            }
        } catch (err) {
            console.error("Share failed:", err);
        }
    };

    useEffect(() => {
        if (params.id && !loading) {
            // Increment view count on video playback
            fetch(buildApiUrl(`/api/live/${params.id}/view`), { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.views) {
                        setRecording((prev: any) => prev ? ({ ...prev, views: data.views }) : null);
                    }
                })
                .catch(err => console.error("View count increment failed", err));
        }
    }, [params.id, loading]);

    const handlePostComment = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newComment.trim()) return;

        setIsSubmitting(true);
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please log in to post a comment.");
                setIsSubmitting(false);
                return;
            }

            const res = await fetch(buildApiUrl(`/api/live/${params.id}/comment`), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ message: newComment })
            });

            const data = await res.json();
            if (res.ok) {
                setRecording((prev: any) => ({
                    ...prev,
                    chat_messages: [...(prev.chat_messages || []), data.comment]
                }));
                setNewComment("");
            } else {
                alert(data.error || 'Failed to post comment');
            }
        } catch (err) {
            console.error("Error posting comment", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!recording) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white">
                <h1 className="text-2xl font-bold mb-2">Video Not Found</h1>
                <p className="text-zinc-400 mb-6">This recording may have been deleted or is unavailable.</p>
                <button onClick={() => router.push('/')} className="px-6 py-2 bg-indigo-600 rounded-full font-medium hover:bg-indigo-500 transition-colors">
                    Go Home
                </button>
            </div>
        );
    }

    const host = recording.host;
    const avatarUrl = host.avatar_url || `https://ui-avatars.com/api/?name=${host.display_name}&background=random`;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-indigo-500/30 font-sans pb-20">

            {/* ===== NAVBAR ===== */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back</span>
                    </button>

                    <div className="flex flex-col items-center">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Recorded Broadcast</span>
                    </div>

                    <div className="w-16"></div> {/* Spacer for centering */}
                </div>
            </nav>

            <main className="pt-20 px-4 md:px-8 max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row gap-8">

                    {/* ===== LEFT COLUMN (VIDEO & INFO) ===== */}
                    <div className="flex-1 w-full">

                        {/* VIDEO PLAYER CONTAINER */}
                        {recording.is_processing ? (
                            <div className="relative aspect-video w-full bg-zinc-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col items-center justify-center p-8 text-center">
                                <Activity className="w-12 h-12 text-indigo-500 animate-pulse mb-6" />
                                <h2 className="text-2xl font-bold text-white mb-2">Processing High-Quality Video</h2>
                                <p className="text-zinc-400 max-w-md">
                                    We're currently converting this video into multiple resolutions (1080p, 720p, 480p) for smooth, buffer-free adaptive streaming.
                                </p>
                                <div className="mt-8 flex items-center gap-2 text-indigo-400 text-sm font-semibold bg-indigo-500/10 px-4 py-2 rounded-full">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Please check back in a few moments...
                                </div>
                            </div>
                        ) : (
                            <HlsPlayer
                                url={recording.recording_url}
                                poster={recording.thumbnail_url || "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200"}
                                subtitles={recording.subtitles}
                            />
                        )}

                        {/* VIDEO INFO */}
                        <div className="mt-6">
                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider border border-indigo-500/20">
                                    {recording.category || 'Podcast'}
                                </span>
                                <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 text-xs font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDistanceToNow(new Date(recording.ended_at || recording.created_at), { addSuffix: true })}
                                </span>
                            </div>

                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                                {recording.title}
                            </h1>

                            {/* ACTION BAR */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-y border-white/10">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                                    <div className="flex items-center gap-1.5 bg-white/5 py-1.5 px-3 rounded-lg border border-white/5">
                                        <Users className="w-4 h-4 text-indigo-400" />
                                        <span className="font-medium text-white">{recording.views || 0} Views</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-white/5 py-1.5 px-3 rounded-lg border border-white/5">
                                        <Activity className="w-4 h-4 text-zinc-300" />
                                        <span className="font-medium text-white">{recording.viewer_count_peak || 25} Peak</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleLikeToggle}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${isLiked ? 'bg-pink-500/20 text-pink-500 border border-pink-500/50' : 'bg-white/5 hover:bg-white/10 text-white border border-transparent'}`}
                                    >
                                        <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                                        <span>{recording.like_count || 0}</span>
                                    </button>
                                    <button
                                        onClick={handleShare}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-full font-medium text-indigo-400 transition-all border border-indigo-500/20"
                                    >
                                        <Share2 className="w-5 h-5" />
                                        Share
                                    </button>
                                    <button className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* HOST PROFILE BANNER */}
                            <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-950 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div
                                    className="flex items-center gap-4 cursor-pointer group"
                                    onClick={() => router.push(`/creator/${host.id}`)}
                                >
                                    <div className="relative">
                                        <img src={avatarUrl} alt={host.display_name} className="w-14 h-14 rounded-full object-cover border-2 border-transparent group-hover:border-indigo-500 transition-colors" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg text-white group-hover:text-indigo-400 transition-colors">{host.display_name}</h3>
                                            {host.is_verified && <CheckCircle2 className="w-4 h-4 text-blue-500" fill="currentColor" stroke="white" />}
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">@{host.unique_handle} • {host.follower_count || 0} Followers</p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleFollowToggle}
                                    className={`px-6 py-2.5 rounded-full font-bold transition-all duration-300 w-full sm:w-auto ${isFollowing
                                        ? "bg-zinc-800 text-white hover:bg-zinc-700"
                                        : "bg-white text-black hover:bg-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                                        }`}
                                >
                                    {isFollowing ? "Following" : "Follow"}
                                </button>
                            </div>

                            {/* DESCRIPTION SECTION */}
                            <div className="mt-6 p-5 rounded-xl bg-zinc-900/50 border border-white/5">
                                <h4 className="font-semibold text-white mb-2">Description</h4>
                                <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm md:text-base">
                                    {recording.description || "No description provided for this broadcast."}
                                </p>
                            </div>

                        </div>
                    </div>

                    {/* ===== RIGHT COLUMN (COMMENTS / SIDEPANEL) ===== */}
                    <div className="w-full lg:w-[380px] shrink-0">
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl h-[600px] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                                <h3 className="font-bold flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-indigo-400" />
                                    Comments / Live Replay
                                </h3>
                            </div>

                            {/* Chat Messages Area */}
                            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                                {(!recording.chat_messages || recording.chat_messages.length === 0) ? (
                                    <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                        <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                                        <p className="text-sm">No chat history available.</p>
                                    </div>
                                ) : (
                                    recording.chat_messages.map((chat: any) => {
                                        // Simple hash for consistent colors based on handle
                                        const hash = [...chat.sender_handle].reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                        const colors = ['bg-orange-500', 'bg-green-500', 'bg-blue-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500'];
                                        const textColor = colors[hash % colors.length].replace('bg-', 'text-');
                                        const bgColor = colors[hash % colors.length];

                                        return (
                                            <div key={chat.id} className="flex gap-3">
                                                <div className={`w-8 h-8 rounded-full ${bgColor} flex items-center justify-center shrink-0`}>
                                                    <span className="text-xs font-bold text-white uppercase">{chat.sender_handle.charAt(0)}</span>
                                                </div>
                                                <div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className={`font-medium text-sm ${textColor}`}>{chat.sender_handle}</span>
                                                        <span className="text-[10px] text-zinc-500">
                                                            {new Date(chat.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">{chat.message}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Chat Input */}
                            <div className="p-4 bg-zinc-800/50 border-t border-white/5">
                                <form onSubmit={handlePostComment} className="relative flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Add a comment..."
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                                        disabled={isSubmitting}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newComment.trim() || isSubmitting}
                                        className="p-2.5 bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
