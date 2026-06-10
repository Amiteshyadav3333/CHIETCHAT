import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import {
    HeartIcon,
    ChatBubbleOvalLeftIcon,
    ShareIcon,
    PlayIcon,
    MusicalNoteIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';

const PublicReel = () => {
    const { reelId } = useParams();
    const navigate = useNavigate();
    const { token, user } = useContext(AuthContext);

    const [reel, setReel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isPaused, setIsPaused] = useState(false);
    const [showSignupPrompt, setShowSignupPrompt] = useState(false);
    const [showFullPrompt, setShowFullPrompt] = useState(false);
    const [hasWatched, setHasWatched] = useState(false);

    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const watchTimerRef = useRef(null);

    const filters = {
        'none': '',
        'grayscale': 'grayscale(100%)',
        'sepia': 'sepia(100%)',
        'invert': 'invert(100%)',
        'blur': 'blur(2px)',
        'bright': 'brightness(150%)',
        'contrast': 'contrast(200%)',
        'vintage': 'sepia(50%) contrast(150%)',
        'cold': 'hue-rotate(180deg) brightness(120%)',
        'warm': 'sepia(30%) brightness(110%) saturate(150%)',
        'dramatic': 'contrast(150%) saturate(50%)',
        'night': 'brightness(50%) hue-rotate(200deg)'
    };

    // If user is logged in, redirect to the app
    useEffect(() => {
        if (token && user) {
            navigate('/', { replace: true });
        }
    }, [token, user, navigate]);

    // Fetch the reel from public endpoint
    useEffect(() => {
        const fetchReel = async () => {
            try {
                const res = await axios.get(`/api/reels/${reelId}/public`);
                setReel(res.data);
            } catch (err) {
                setError(err.response?.data?.error || 'Reel not found');
            } finally {
                setLoading(false);
            }
        };
        fetchReel();
    }, [reelId]);

    // Auto-play video when loaded
    useEffect(() => {
        if (reel && videoRef.current) {
            videoRef.current.play().catch(() => {});
            if (audioRef.current) audioRef.current.play().catch(() => {});
        }
    }, [reel]);

    // Show signup prompt after watching for a bit
    useEffect(() => {
        if (reel && !hasWatched) {
            watchTimerRef.current = setTimeout(() => {
                setShowSignupPrompt(true);
                setHasWatched(true);
            }, 8000); // Show after 8 seconds
        }
        return () => {
            if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
        };
    }, [reel, hasWatched]);

    const togglePlayPause = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            if (audioRef.current) audioRef.current.play().catch(() => {});
            setIsPaused(false);
        } else {
            videoRef.current.pause();
            if (audioRef.current) audioRef.current.pause();
            setIsPaused(true);
        }
    };

    const triggerSignup = () => {
        setShowFullPrompt(true);
    };

    const handleShare = async () => {
        const shareData = {
            title: 'Check out this Reel on CHEETCHAT!',
            text: reel?.caption || 'Watch this amazing reel',
            url: window.location.href
        };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch {}
        } else {
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert('Link copied to clipboard!');
            } catch {}
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white z-50">
                <div className="w-14 h-14 border-4 border-white/15 border-t-white rounded-full animate-spin mb-5"></div>
                <p className="text-white/60 text-sm font-medium animate-pulse">Loading Reel...</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="fixed inset-0 bg-[#08090b] flex flex-col items-center justify-center text-white z-50 px-6">
                <div className="text-center max-w-sm">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
                        <span className="text-4xl">🎬</span>
                    </div>
                    <h2 className="text-2xl font-bold mb-3">Reel Not Found</h2>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">{error}. This reel may have been deleted or is no longer available.</p>
                    <button 
                        onClick={() => navigate('/login')}
                        className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg shadow-blue-500/25"
                    >
                        Explore CHEETCHAT
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden z-50">
            {/* Video */}
            <video
                ref={videoRef}
                src={reel.videoUrl}
                className="h-full w-full object-contain cursor-pointer"
                loop
                playsInline
                muted={!!reel.musicUrl}
                style={{ filter: filters[reel.filterName] || '' }}
                onClick={togglePlayPause}
            />

            {reel.musicUrl && (
                <audio ref={audioRef} src={reel.musicUrl} loop />
            )}

            {/* Pause indicator */}
            {isPaused && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-20 h-20 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center animate-fade-in">
                        <PlayIcon className="w-10 h-10 text-white ml-1" />
                    </div>
                </div>
            )}

            {/* Top gradient overlay */}
            <div className="absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/70 via-black/20 to-transparent h-32 pointer-events-none" />

            {/* Top bar — branding */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 pt-5">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-600/30">
                        <ShieldCheckIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-base tracking-wide leading-tight">CHEETCHAT</h1>
                        <p className="text-white/40 text-[10px] font-medium">Reels</p>
                    </div>
                </div>
                <button 
                    onClick={() => navigate('/login')}
                    className="px-4 py-2 bg-white text-black rounded-full text-xs font-bold hover:bg-gray-100 transition-colors shadow-lg"
                >
                    Open App
                </button>
            </div>

            {/* Side actions */}
            <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-20">
                {/* User avatar */}
                <div className="flex flex-col items-center mb-2">
                    <div 
                        className="relative cursor-pointer"
                        onClick={triggerSignup}
                    >
                        <img 
                            src={reel.user.avatar} 
                            className="w-11 h-11 rounded-full border-2 border-white shadow-lg object-cover" 
                            alt={reel.user.username} 
                        />
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center border-2 border-black text-white text-[10px] font-bold">
                            +
                        </div>
                    </div>
                </div>

                {/* Like */}
                <div className="flex flex-col items-center">
                    <button onClick={triggerSignup} className="p-2 active:scale-90 transition-transform">
                        <HeartIcon className="w-8 h-8 text-white drop-shadow-md" />
                    </button>
                    <span className="text-white text-xs font-bold drop-shadow-md">{reel.likesCount}</span>
                </div>

                {/* Comment */}
                <div className="flex flex-col items-center">
                    <button onClick={triggerSignup} className="p-2 active:scale-90 transition-transform">
                        <ChatBubbleOvalLeftIcon className="w-8 h-8 text-white drop-shadow-md" />
                    </button>
                    <span className="text-white text-xs font-bold drop-shadow-md">{reel.commentsCount}</span>
                </div>

                {/* Share — this one works without login */}
                <div className="flex flex-col items-center">
                    <button onClick={handleShare} className="p-2 active:scale-90 transition-transform">
                        <ShareIcon className="w-8 h-8 text-white drop-shadow-md" />
                    </button>
                    <span className="text-white text-xs font-bold drop-shadow-md">{reel.sharesCount}</span>
                </div>
            </div>

            {/* Bottom gradient overlay */}
            <div className="absolute bottom-0 inset-x-0 z-15 bg-gradient-to-t from-black/80 via-black/30 to-transparent h-48 pointer-events-none" />

            {/* Bottom user info */}
            <div className="absolute left-4 bottom-6 right-16 z-20">
                <div className="flex items-center gap-3 mb-2">
                    <div 
                        className="flex items-center gap-2.5 cursor-pointer group"
                        onClick={triggerSignup}
                    >
                        <img src={reel.user.avatar} className="w-9 h-9 rounded-full border-2 border-white/80 shadow-md group-hover:scale-110 transition-transform object-cover" alt="" />
                        <span className="text-white font-bold text-sm drop-shadow-md group-hover:underline">@{reel.user.username}</span>
                    </div>
                    <button 
                        onClick={triggerSignup}
                        className="px-3 py-1 rounded-full text-xs font-bold bg-white text-black hover:bg-gray-200 transition-all"
                    >
                        Follow
                    </button>
                </div>
                <p className="text-white text-sm line-clamp-2 drop-shadow-md mb-2">{reel.caption}</p>
                <div className="flex items-center gap-3">
                    {reel.musicName && (
                        <div className="flex items-center gap-2 bg-black/30 w-fit px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                            <MusicalNoteIcon className="w-3 h-3 text-white animate-spin" style={{ animationDuration: '3s' }} />
                            <marquee className="text-white text-xs w-20">{reel.musicName}</marquee>
                        </div>
                    )}
                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md">
                        <PlayIcon className="w-3 h-3 text-white/60" />
                        <span className="text-white/80 text-[10px] font-bold">{reel.viewsCount} Views</span>
                    </div>
                </div>
            </div>

            {/* Subtle signup banner (appears after 8 seconds) */}
            {showSignupPrompt && !showFullPrompt && (
                <div 
                    className="absolute bottom-0 inset-x-0 z-40 animate-slide-up-gentle cursor-pointer"
                    onClick={() => setShowFullPrompt(true)}
                >
                    <div className="mx-3 mb-3 bg-gradient-to-r from-blue-600/90 to-purple-600/90 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl shadow-blue-500/20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
                                    <ShieldCheckIcon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-white font-bold text-sm">Join CHEETCHAT</p>
                                    <p className="text-white/70 text-xs">Sign up to see more reels & connect</p>
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); navigate('/login'); }}
                                className="px-4 py-2 bg-white text-black rounded-full text-xs font-bold hover:bg-gray-100 transition-colors"
                            >
                                Sign Up
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Full signup overlay */}
            {showFullPrompt && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end justify-center animate-fade-in">
                    <div className="w-full max-w-lg bg-[#121418] rounded-t-3xl p-6 pb-8 border-t border-white/10 shadow-2xl animate-slide-up-sheet">
                        {/* Handle bar */}
                        <div className="w-10 h-1.5 bg-gray-700 rounded-full mx-auto mb-6 cursor-pointer" onClick={() => setShowFullPrompt(false)} />
                        
                        {/* Branding */}
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <ShieldCheckIcon className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-white text-xl font-bold mb-2">Join CHEETCHAT</h2>
                            <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
                                Sign up to discover unlimited reels, like, comment, follow creators, and share your own videos.
                            </p>
                        </div>

                        {/* Features */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                <HeartSolid className="w-5 h-5 text-red-500 mx-auto mb-1.5" />
                                <p className="text-white/70 text-[10px] font-medium">Like & React</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                <ChatBubbleOvalLeftIcon className="w-5 h-5 text-blue-400 mx-auto mb-1.5" />
                                <p className="text-white/70 text-[10px] font-medium">Comment</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                <ShareIcon className="w-5 h-5 text-green-400 mx-auto mb-1.5" />
                                <p className="text-white/70 text-[10px] font-medium">Share & Chat</p>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="space-y-3">
                            <button 
                                onClick={() => navigate('/login')}
                                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                            >
                                Create Account
                            </button>
                            <button 
                                onClick={() => navigate('/login')}
                                className="w-full py-3.5 bg-white/5 text-white rounded-xl font-bold text-sm border border-white/10 hover:bg-white/10 transition-all active:scale-[0.98]"
                            >
                                Already have an account? Log in
                            </button>
                        </div>

                        {/* Legal */}
                        <p className="text-gray-600 text-[10px] text-center mt-4 leading-relaxed">
                            By signing up, you agree to our{' '}
                            <span className="text-gray-400 cursor-pointer" onClick={() => navigate('/terms')}>Terms</span> and{' '}
                            <span className="text-gray-400 cursor-pointer" onClick={() => navigate('/privacy')}>Privacy Policy</span>
                        </p>
                    </div>
                </div>
            )}

            {/* Styles */}
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }

                @keyframes slide-up-gentle {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-up-gentle { animation: slide-up-gentle 0.5s cubic-bezier(0.16, 1, 0.3, 1); }

                @keyframes slide-up-sheet {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up-sheet { animation: slide-up-sheet 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
            `}</style>
        </div>
    );
};

export default PublicReel;
