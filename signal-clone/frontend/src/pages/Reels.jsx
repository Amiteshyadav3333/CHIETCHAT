import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import ReelCard from '../components/ReelCard';
import { AuthContext } from '../context/AuthContext';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import ReelUploader from '../components/ReelUploader';
import ReelProfile from '../components/ReelProfile';
import ReelReactor from '../components/ReelReactor';

const REELS_CACHE_KEY = 'reels_cache';

const Reels = ({ active, onBack, onShareToChat }) => {
    const [reels, setReels] = useState(() => {
        // Load from cache instantly — no loading delay
        try {
            const cached = sessionStorage.getItem(REELS_CACHE_KEY);
            return cached ? JSON.parse(cached) : [];
        } catch { return []; }
    });
    const [loading, setLoading] = useState(() => {
        // Only show loading spinner if no cached data exists
        try {
            return !sessionStorage.getItem(REELS_CACHE_KEY);
        } catch { return true; }
    });
    const [filter, setFilter] = useState('foryou'); // 'foryou' | 'following'
    const [showUploader, setShowUploader] = useState(false);
    const [selectedProfileUserId, setSelectedProfileUserId] = useState(null);
    const [reactingToReel, setReactingToReel] = useState(null);
    const { user, token } = useContext(AuthContext);
    const hasFetched = useRef(false);

    const fetchReels = async (f = filter, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await axios.get(`/api/reels?filter=${f}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setReels(res.data);
            // Cache for instant load next time
            if (f === 'foryou') {
                try { sessionStorage.setItem(REELS_CACHE_KEY, JSON.stringify(res.data)); } catch {}
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (!hasFetched.current) {
            hasFetched.current = true;
            // If we have cached data, do a silent background refresh
            if (reels.length > 0) {
                fetchReels(filter, true); // silent — no spinner
            } else {
                fetchReels(filter, false); // first time — show spinner
            }
        }
    }, [token]);

    // When filter changes, always fetch fresh
    useEffect(() => {
        if (hasFetched.current) {
            fetchReels(filter, reels.length > 0);
        }
    }, [filter]);

    if (loading && reels.length === 0) {
        return (
            <div className="h-full w-full bg-black flex flex-col items-center justify-center text-white relative overflow-hidden">
                {/* Skeleton shimmer instead of boring spinner */}
                <div className="absolute inset-0 flex flex-col">
                    <div className="flex-1 bg-gray-900 animate-pulse relative">
                        {/* Fake video area */}
                        <div className="absolute inset-0 bg-gradient-to-b from-gray-800/50 via-transparent to-gray-900/80" />
                        {/* Fake side actions */}
                        <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6">
                            <div className="w-9 h-9 rounded-full bg-gray-700 animate-pulse" />
                            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
                            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
                            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
                        </div>
                        {/* Fake user info */}
                        <div className="absolute left-4 bottom-8 right-16">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse" />
                                <div className="w-24 h-4 rounded bg-gray-700 animate-pulse" />
                                <div className="w-16 h-6 rounded-full bg-gray-700 animate-pulse" />
                            </div>
                            <div className="w-48 h-3 rounded bg-gray-700 animate-pulse mb-2" />
                            <div className="w-32 h-3 rounded bg-gray-700 animate-pulse" />
                        </div>
                    </div>
                </div>
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-10 h-10 border-3 border-white/10 border-t-white rounded-full animate-spin mb-3"></div>
                    <p className="text-white/40 text-xs font-medium">Loading Reels...</p>
                </div>
            </div>
        );
    }

    if (selectedProfileUserId) {
        return (
            <ReelProfile 
                userId={selectedProfileUserId} 
                onBack={() => setSelectedProfileUserId(null)}
                onSelectReel={() => {
                    // Logic to show specific reel (can be improved later)
                    setSelectedProfileUserId(null);
                }}
            />
        );
    }

    return (
        <div className="h-full w-full bg-black relative overflow-hidden flex flex-col">
            {/* Top Navigation */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
                <button onClick={onBack} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="flex gap-6">
                    <button 
                        onClick={() => setFilter('foryou')}
                        className={`font-bold text-lg transition-all ${filter === 'foryou' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}
                    >
                        For You
                    </button>
                    <button 
                        onClick={() => setFilter('following')}
                        className={`font-bold text-lg transition-all ${filter === 'following' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}
                    >
                        Following
                    </button>
                </div>
                <button onClick={() => setShowUploader(true)} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                    <PlusIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Scroll Container */}
            <div className={`flex-1 overflow-y-auto snap-y snap-mandatory hide-scrollbar ${showUploader ? 'hidden' : ''}`}>
                {reels.length > 0 ? (
                    reels.map(reel => (
                        <ReelCard 
                            key={reel.id} 
                            reel={reel} 
                            currentUser={user} 
                            onShare={onShareToChat}
                            onProfileClick={(uid) => setSelectedProfileUserId(uid)}
                            onReact={(r) => setReactingToReel(r)}
                            onDelete={(id) => setReels(prev => prev.filter(r => r.id !== id))}
                            active={active}
                        />
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-white px-8 text-center gap-4">
                        <p className="text-xl font-bold">No reels yet</p>
                        <p className="text-gray-400 text-sm">Be the first one to post a video!</p>
                        <button 
                            onClick={() => setShowUploader(true)}
                            className="bg-white text-black px-6 py-2 rounded-full font-bold"
                        >
                            Create Reel
                        </button>
                    </div>
                )}
            </div>

            {showUploader && (
                <ReelUploader 
                    onClose={() => setShowUploader(false)} 
                    onSuccess={() => { setShowUploader(false); fetchReels(); }}
                />
            )}

            {reactingToReel && (
                <ReelReactor 
                    originalReel={reactingToReel}
                    onClose={() => setReactingToReel(null)}
                    onSuccess={() => { setReactingToReel(null); fetchReels(); }}
                />
            )}

            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes slide-up {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up { animation: slide-up 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default Reels;
