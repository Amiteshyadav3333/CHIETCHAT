import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import ReelCard from '../components/ReelCard';
import { AuthContext } from '../context/AuthContext';
import { ArrowLeftIcon, PlusIcon, UserPlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import ReelUploader from '../components/ReelUploader';
import ReelProfile from '../components/ReelProfile';
import ReelReactor from '../components/ReelReactor';
import { loadReelCache, saveReelCache } from '../utils/reelCache';

const Reels = ({ active, onBack, onShareToChat }) => {
    const { user, token } = useContext(AuthContext);
    const [reels, setReels] = useState(() => {
        return loadReelCache(user?.id);
    });
    const [loading, setLoading] = useState(() => {
        return !loadReelCache(user?.id).length;
    });
    const [filter, setFilter] = useState(() => user?.uiPreferences?.reelsDefaultFeed || localStorage.getItem('reels_default_feed') || 'foryou'); // 'foryou' | 'following'
    const [playbackPrefs, setPlaybackPrefs] = useState(() => ({
        autoplay: user?.uiPreferences?.reelsAutoplay ?? localStorage.getItem('reels_autoplay') !== '0',
        muted: user?.uiPreferences?.reelsMuted ?? localStorage.getItem('reels_muted') === '1',
        dataSaver: user?.uiPreferences?.reelsDataSaver ?? localStorage.getItem('reels_data_saver') === '1',
    }));
    const [showUploader, setShowUploader] = useState(false);
    const [selectedProfileUserId, setSelectedProfileUserId] = useState(null);
    const [selectedProfileReel, setSelectedProfileReel] = useState(null);
    const [reactingToReel, setReactingToReel] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [followingIds, setFollowingIds] = useState({});
    const hasFetched = useRef(false);

    useEffect(() => {
        const updatePreferences = (event) => setPlaybackPrefs(current => ({
            autoplay: event.detail?.reelsAutoplay ?? current.autoplay,
            muted: event.detail?.reelsMuted ?? current.muted,
            dataSaver: event.detail?.reelsDataSaver ?? current.dataSaver,
        }));
        window.addEventListener('cheetchat-preferences-updated', updatePreferences);
        return () => window.removeEventListener('cheetchat-preferences-updated', updatePreferences);
    }, []);

    const fetchReels = async (f = filter, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await axios.get(`/api/reels?filter=${f}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const nextReels = Array.isArray(res.data) ? res.data.filter(item => item?.id) : [];
            setReels(nextReels);
            // Cache for instant load next time
            if (f === 'foryou') {
                try { saveReelCache(user?.id, nextReels); } catch {}
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

    useEffect(() => {
        if (!token) return;
        axios.get('/api/users/suggestions?limit=8', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setSuggestions(Array.isArray(res.data) ? res.data.filter(item => item?.id) : []))
            .catch(() => setSuggestions([]));
    }, [token]);

    const followSuggestedUser = async (suggestedUser) => {
        setFollowingIds(state => ({ ...state, [suggestedUser.id]: true }));
        try {
            const res = await axios.post(`/api/users/${suggestedUser.id}/follow`, {}, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.isFollowing) {
                setTimeout(() => setSuggestions(list => list.filter(item => item.id !== suggestedUser.id)), 500);
            }
        } catch { }
        finally { setFollowingIds(state => ({ ...state, [suggestedUser.id]: false })); }
    };

    // When filter changes, always fetch fresh
    useEffect(() => {
        if (hasFetched.current) {
            fetchReels(filter, reels.length > 0);
        }
    }, [filter]);

    const visibleReels = Array.isArray(reels) ? reels.filter(item => item?.id) : [];

    if (loading && visibleReels.length === 0) {
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

    if (selectedProfileReel) {
        return (
            <div className="relative h-full w-full bg-black">
                <ReelCard
                    reel={selectedProfileReel}
                    currentUser={user}
                    onShare={onShareToChat}
                    onProfileClick={(uid) => {
                        setSelectedProfileReel(null);
                        setSelectedProfileUserId(uid);
                    }}
                    onReact={(reel) => setReactingToReel(reel)}
                    onDelete={() => setSelectedProfileReel(null)}
                    active={active}
                />
                <button
                    type="button"
                    onClick={() => setSelectedProfileReel(null)}
                    aria-label="Back to reel profile"
                    className="absolute left-4 top-4 z-40 rounded-full bg-black/60 p-2 text-white backdrop-blur-md"
                >
                    <ArrowLeftIcon className="h-6 w-6" />
                </button>
                {reactingToReel && (
                    <ReelReactor
                        originalReel={reactingToReel}
                        onClose={() => setReactingToReel(null)}
                        onSuccess={() => {
                            setReactingToReel(null);
                            setSelectedProfileReel(null);
                            fetchReels(filter, true);
                        }}
                    />
                )}
            </div>
        );
    }

    if (selectedProfileUserId) {
        return (
            <ReelProfile 
                userId={selectedProfileUserId} 
                onBack={() => setSelectedProfileUserId(null)}
                onSelectReel={setSelectedProfileReel}
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

            {suggestions.length > 0 && (
                <div className="absolute right-3 top-20 z-40">
                    {!showSuggestions ? (
                        <button onClick={() => setShowSuggestions(true)} className="flex items-center gap-2 rounded-full border border-white/20 bg-black/65 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md">
                            <UserPlusIcon className="h-4 w-4" /> Discover people
                        </button>
                    ) : (
                        <div className="w-[290px] max-w-[calc(100vw-24px)] rounded-2xl border border-white/15 bg-[#111]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
                            <div className="mb-2 flex items-center justify-between"><div><p className="text-sm font-bold">Suggested for you</p><p className="text-[10px] text-white/45">People you may like</p></div><button onClick={() => setShowSuggestions(false)}><XMarkIcon className="h-5 w-5" /></button></div>
                            <div className="max-h-[360px] space-y-1 overflow-y-auto">
                                {suggestions.map(account => (
                                    <div key={account.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
                                        <button onClick={() => setSelectedProfileUserId(account.id)}><img src={account.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-white/20" /></button>
                                        <button onClick={() => setSelectedProfileUserId(account.id)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-semibold">{account.username}</p><p className="truncate text-[10px] text-white/45">{account.suggestionReason}</p></button>
                                        <button disabled={followingIds[account.id]} onClick={() => followSuggestedUser(account)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-black disabled:opacity-60">{followingIds[account.id] ? 'Following' : 'Follow'}</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Scroll Container */}
            <div className={`flex-1 overflow-y-auto snap-y snap-mandatory hide-scrollbar ${showUploader ? 'hidden' : ''}`}>
                {visibleReels.length > 0 ? (
                    visibleReels.map(reel => (
                        <ReelCard 
                            key={reel.id} 
                            reel={reel} 
                            currentUser={user} 
                            onShare={onShareToChat}
                            onProfileClick={(uid) => setSelectedProfileUserId(uid)}
                            onReact={(r) => setReactingToReel(r)}
                            onDelete={(id) => setReels(prev => prev.filter(r => r.id !== id))}
                            active={active}
                            autoplay={playbackPrefs.autoplay}
                            startMuted={playbackPrefs.muted}
                            dataSaver={playbackPrefs.dataSaver}
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
