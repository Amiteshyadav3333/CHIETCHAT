"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    Play,
    Users,
    Video,
    CheckCircle2,
    Clock,
    Heart,
    Share2,
    Mic,
    Loader2
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { buildApiUrl } from "@/lib/api";
import { useSocket } from "@/providers/SocketProvider";

export default function CreatorProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { socket } = useSocket();
    const [creatorData, setCreatorData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("recordings");
    const [isFollowing, setIsFollowing] = useState(false);

    useEffect(() => {
        if (!socket || !params.id) return;

        const handleFollowerUpdateForCreator = (data: { count: number }) => {
            // Only update if the event is for the current creator public profile we are looking at
            // Though currently the event is emitted to the target room, let's just update
            setCreatorData((prev: any) => prev ? ({ ...prev, follower_count: data.count }) : null);
        };

        socket.on('follower_count_update', handleFollowerUpdateForCreator);

        return () => {
            socket.off('follower_count_update', handleFollowerUpdateForCreator);
        };
    }, [socket, params.id]);

    const handleShare = async () => {
        const shareData = {
            title: `PodLive Creator: ${creatorData.display_name}`,
            text: `Follow this amazing podcast creator @${creatorData.unique_handle} on PodLive!`,
            url: window.location.href,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                alert("Profile link copied to clipboard!");
            }
        } catch (err) {
            console.error("Share failed:", err);
        }
    };

    useEffect(() => {
        const fetchCreator = async () => {
            if (!params.id) return;
            try {
                const res = await fetch(buildApiUrl(`/api/user/creator/${params.id}`));
                const data = await res.json();
                if (res.ok) {
                    setCreatorData(data);
                } else {
                    console.error("Error fetching creator:", data);
                }
            } catch (err) {
                console.error("Failed to fetch creator data", err);
            } finally {
                setLoading(false);
            }
        };

        const checkFollowStatus = async () => {
            if (!params.id) return;
            try {
                const token = localStorage.getItem("accessToken");
                if (!token) return;
                const res = await fetch(buildApiUrl(`/api/user/follow-status/${params.id}`), {
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

        fetchCreator();
        checkFollowStatus();
    }, [params.id]);

    const handleFollowToggle = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                // Should potentially redirect to login
                alert("Please login to follow creators");
                return;
            }

            const res = await fetch(buildApiUrl("/api/user/follow"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ creatorId: params.id })
            });
            const data = await res.json();
            if (res.ok) {
                setIsFollowing(data.following);
                // Also update local follower count optimistically
                setCreatorData((prev: any) => ({
                    ...prev,
                    follower_count: data.following ? prev.follower_count + 1 : prev.follower_count - 1
                }));
            }
        } catch (error) {
            console.error("Error toggling follow:", error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!creatorData) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white">
                <Users className="w-16 h-16 text-zinc-600 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Creator Not Found</h1>
                <p className="text-zinc-400">The person you are looking for does not exist.</p>
            </div>
        );
    }

    // Prepare info fallbacks
    const avatarUrl = creatorData.avatar_url || `https://ui-avatars.com/api/?name=${creatorData.display_name || 'User'}&background=random`;
    const bannerUrl = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2000"; // Can be dynamic if added to schema

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-indigo-500/30">
            {/* ===== HERO BANNER ===== */}
            <div className="relative w-full h-[250px] md:h-[350px] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent z-10" />
                <img
                    src={bannerUrl}
                    alt="Cover"
                    className="w-full h-full object-cover object-center opacity-80"
                />
            </div>

            {/* ===== PROFILE CONTAINER ===== */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-20 pb-20">
                <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-6 pb-8 border-b border-gray-800">

                    {/* Avatar & Info */}
                    <div className="flex flex-col md:flex-row items-center md:items-end gap-6 text-center md:text-left w-full md:w-auto">
                        {/* Avatar Profile Pic */}
                        <div className="relative group">
                            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500">
                                <img
                                    src={avatarUrl}
                                    alt={creatorData.display_name}
                                    className="w-full h-full rounded-full object-cover border-4 border-[#0a0a0a]"
                                />
                            </div>
                            <div className="absolute -bottom-2 right-4 bg-red-600 text-white text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md border-2 border-[#0a0a0a] shadow-lg animate-pulse hidden group-hover:block">
                                OFFLINE
                            </div>
                        </div>

                        {/* Name & Handle */}
                        <div className="mb-2">
                            <div className="flex items-center justify-center md:justify-start gap-2">
                                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                                    {creatorData.display_name}
                                </h1>
                                {creatorData.is_verified && (
                                    <CheckCircle2 className="w-6 h-6 text-blue-500" fill="currentColor" stroke="white" />
                                )}
                            </div>
                            <p className="text-gray-400 font-medium text-lg mt-1">@{creatorData.unique_handle}</p>

                            {/* Stats badges */}
                            <div className="flex items-center gap-4 mt-3 text-sm text-gray-300 justify-center md:justify-start">
                                <div className="flex flex-col items-center md:items-start">
                                    <span className="font-bold text-white text-lg">{creatorData.follower_count || 0}</span>
                                    <span className="text-gray-500 text-xs uppercase tracking-wider">Followers</span>
                                </div>
                                <div className="w-[1px] h-8 bg-gray-800" />
                                <div className="flex flex-col items-center md:items-start">
                                    <span className="font-bold text-white text-lg">{creatorData.totalViews || 0}</span>
                                    <span className="text-gray-500 text-xs uppercase tracking-wider">Views</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                        <button
                            onClick={handleShare}
                            className="p-3 rounded-full bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors text-white duration-300"
                        >
                            <Share2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleFollowToggle}
                            className={`flex-1 md:flex-none px-8 py-3 rounded-full font-bold transition-all duration-300 ${isFollowing
                                ? "bg-gray-800 text-white hover:bg-gray-700"
                                : "bg-white text-black hover:bg-gray-200 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                }`}
                        >
                            {isFollowing ? "Following" : "Follow"}
                        </button>
                    </div>
                </div>

                {/* Bio */}
                <div className="py-6 max-w-3xl text-gray-300 leading-relaxed text-sm md:text-base">
                    {creatorData.bio || "This creator hasn't added a bio yet."}
                </div>

                {/* ===== TABS ===== */}
                <div className="flex items-center gap-8 border-b border-gray-800 mt-2">
                    {['recordings', 'about', 'community'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-4 relative text-sm md:text-base font-semibold capitalize transition-colors duration-300 ${activeTab === tab ? "text-white" : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            {tab}
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-1 rounded-t-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* ===== TAB CONTENT ===== */}
                <div className="py-8">
                    {activeTab === "recordings" && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Video className="w-5 h-5 text-indigo-400" />
                                    Past Broadcasts
                                </h2>
                            </div>

                            {/* Grid of Recordings */}
                            {(!creatorData.recordings || creatorData.recordings.length === 0) ? (
                                <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
                                    <Video className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                                    <h3 className="text-lg font-bold text-zinc-300 mb-1">No recordings yet</h3>
                                    <p className="text-zinc-500">This creator hasn't published any past sessions.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {creatorData.recordings.map((recording: any, idx: number) => (
                                        <motion.div
                                            key={recording.id}
                                            onClick={() => router.push(`/watch/${recording.id}`)}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, delay: idx * 0.1 }}
                                            className="group cursor-pointer flex flex-col gap-3"
                                        >
                                            {/* Thumbnail Container */}
                                            <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-800 group-hover:border-indigo-500/50 transition-colors duration-300">
                                                <img
                                                    src={recording.thumbnail_url || "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=600"}
                                                    alt={recording.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60 group-hover:opacity-100"
                                                />
                                                {/* Overlays */}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-xl">
                                                        <Play className="w-5 h-5 text-white ml-1" fill="currentColor" />
                                                    </div>
                                                </div>
                                                <div className="absolute top-2 left-2 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded">
                                                    {recording.category || 'Podcast'}
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div>
                                                <h3 className="font-semibold text-gray-100 line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors duration-300">
                                                    {recording.title}
                                                </h3>
                                                <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                                                    <span className="flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                        {recording.viewer_count_peak || 0} views
                                                    </span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-700" />
                                                    <span>{formatDistanceToNow(new Date(recording.created_at), { addSuffix: true })}</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "about" && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-8 rounded-2xl bg-[#111] border border-gray-800 text-gray-300 max-w-3xl"
                        >
                            <h3 className="text-xl font-bold text-white mb-4">About {creatorData.display_name}</h3>
                            <p className="leading-relaxed mb-6">
                                {creatorData.bio || "No bio available."}
                            </p>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 bg-[#1a1a1a] px-4 py-2 rounded-lg border border-gray-800">
                                    <Mic className="w-5 h-5 text-purple-400" />
                                    <span className="font-medium text-sm">{creatorData.totalLives || 0} Streams Completed</span>
                                </div>
                                <div className="flex items-center gap-2 bg-[#1a1a1a] px-4 py-2 rounded-lg border border-gray-800">
                                    <Heart className="w-5 h-5 text-pink-400" />
                                    <span className="font-medium text-sm">{creatorData.totalViews || 0} Total Likes/Views</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "community" && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-20 text-gray-500"
                        >
                            <Users className="w-16 h-16 mb-4 text-gray-700" />
                            <h3 className="text-xl font-semibold text-gray-300">Community Features</h3>
                            <p className="mt-2 text-sm max-w-md text-center">
                                Community posts and discussions will appear here soon. Stay tuned!
                            </p>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}
