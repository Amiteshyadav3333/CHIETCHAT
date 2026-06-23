import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, MusicalNoteIcon, EyeIcon, TrashIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const StatusViewer = ({ statusGroups, initialGroupIndex = 0, currentUserId, token, onClose, onDelete }) => {
    const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
    const [statusIndex, setStatusIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [paused, setPaused] = useState(false);
    const [showViews, setShowViews] = useState(false);
    const [musicBlocked, setMusicBlocked] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replySending, setReplySending] = useState(false);
    const [replyNotice, setReplyNotice] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [reactionCounts, setReactionCounts] = useState({});
    const [myReaction, setMyReaction] = useState('');

    const timerRef = useRef(null);
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const progressRef = useRef(0);
    const pausedRef = useRef(false);

    const currentGroup = statusGroups[groupIndex];
    const currentStatus = currentGroup?.statuses[statusIndex];
    const isOwn = currentGroup?.user?.id === currentUserId;
    const duration = (currentStatus?.duration || 15) * 1000;

    const goNext = useCallback(() => {
        const group = statusGroups[groupIndex];
        if (statusIndex < group.statuses.length - 1) {
            setStatusIndex(i => i + 1);
            setProgress(0);
        } else if (groupIndex < statusGroups.length - 1) {
            setGroupIndex(g => g + 1);
            setStatusIndex(0);
            setProgress(0);
        } else {
            onClose();
        }
    }, [groupIndex, statusIndex, statusGroups, onClose]);

    const goPrev = useCallback(() => {
        if (statusIndex > 0) {
            setStatusIndex(i => i - 1);
            setProgress(0);
        } else if (groupIndex > 0) {
            setGroupIndex(g => g - 1);
            setStatusIndex(0);
            setProgress(0);
        }
    }, [groupIndex, statusIndex]);

    // Mark as viewed
    useEffect(() => {
        if (!currentStatus) return;
        axios.post(`/api/status/${currentStatus.id}/view`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
    }, [currentStatus?.id]);

    // Progress timer
    useEffect(() => {
        if (!currentStatus) return;
        progressRef.current = 0;
        setProgress(0);
        setReplyText('');
        setReplyNotice('');
        setShowMenu(false);
        setReactionCounts(currentStatus.reactions || {});
        setMyReaction(currentStatus.myReaction || '');
        pausedRef.current = false;
        setPaused(false);

        const interval = 50;
        const step = (interval / duration) * 100;

        timerRef.current = setInterval(() => {
            if (pausedRef.current) return;
            progressRef.current += step;
            setProgress(progressRef.current);
            if (progressRef.current >= 100) {
                clearInterval(timerRef.current);
                goNext();
            }
        }, interval);

        return () => clearInterval(timerRef.current);
    }, [currentStatus?.id, groupIndex]);

    // Video sync
    useEffect(() => {
        setMusicBlocked(false);
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        }
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => setMusicBlocked(true));
        }
    }, [currentStatus?.id]);

    const togglePause = () => {
        const newPaused = !paused;
        setPaused(newPaused);
        pausedRef.current = newPaused;
        if (videoRef.current) newPaused ? videoRef.current.pause() : videoRef.current.play();
        if (audioRef.current) {
            if (newPaused) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().then(() => setMusicBlocked(false)).catch(() => setMusicBlocked(true));
            }
        }
    };

    const reactToStatus = async (emoji) => {
        if (isOwn) return;
        try {
            const res = await axios.post(`/api/status/${currentStatus.id}/react`, { emoji }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setReactionCounts(res.data.reactions || {});
            setMyReaction(res.data.myReaction || '');
            setReplyNotice('Reaction sent');
            setTimeout(() => setReplyNotice(''), 1200);
        } catch {
            setReplyNotice('Could not react');
        }
    };

    const handleDelete = async () => {
        await axios.delete(`/api/status/${currentStatus.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        onDelete(currentStatus.id);
        goNext();
    };

    const setViewerPaused = (value) => {
        setPaused(value);
        pausedRef.current = value;
        if (videoRef.current) value ? videoRef.current.pause() : videoRef.current.play().catch(() => {});
        if (audioRef.current) {
            if (value) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().then(() => setMusicBlocked(false)).catch(() => setMusicBlocked(true));
            }
        }
    };

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        const message = replyText.trim();
        if (!message || replySending || isOwn) return;

        setReplySending(true);
        setReplyNotice('');
        try {
            await axios.post(`/api/status/${currentStatus.id}/reply`, { message }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setReplyText('');
            setReplyNotice('Reply sent');
            setViewerPaused(false);
            setTimeout(() => setReplyNotice(''), 1800);
        } catch (err) {
            setReplyNotice(err.response?.data?.error || 'Could not send reply');
        } finally {
            setReplySending(false);
        }
    };

    if (!currentGroup || !currentStatus) return null;

    return (
        <div className="fixed inset-0 bg-black z-[200] flex items-center justify-center">
            <div className="relative w-full h-full max-w-sm mx-auto flex flex-col">

                {/* Progress Bars */}
                <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
                    {currentGroup.statuses.map((s, i) => (
                        <div key={s.id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white rounded-full transition-none"
                                style={{
                                    width: i < statusIndex ? '100%' : i === statusIndex ? `${progress}%` : '0%'
                                }}
                            />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div className="absolute top-4 left-0 right-0 z-30 flex items-center justify-between px-3 pt-4 pointer-events-auto">
                    <div className="flex items-center gap-2 flex-1">
                        <img src={currentGroup.user.avatar} alt="" className="w-9 h-9 rounded-full border-2 border-white object-cover" />
                        <div>
                            <p className="text-white text-sm font-semibold">{currentGroup.user.username}</p>
                            <p className="text-white/60 text-[10px]">{timeAgo(currentStatus.createdAt)}</p>
                        </div>
                        {currentStatus.musicName && (
                            <div className="ml-3 flex items-center gap-1 bg-black/40 px-2.5 py-0.5 rounded-full border border-white/10 max-w-[140px] md:max-w-[200px] overflow-hidden truncate">
                                <MusicalNoteIcon className="w-3.5 h-3.5 text-green-400 flex-shrink-0 animate-bounce mt-0.5" />
                                <span className="text-green-400 text-[10px] font-bold truncate">{currentStatus.musicName}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 relative">
                        {isOwn && (
                            <>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const nextState = !showMenu;
                                        setShowMenu(nextState);
                                        setViewerPaused(nextState);
                                    }} 
                                    className="text-white p-1 hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <EllipsisVerticalIcon className="w-6 h-6" />
                                </button>
                                {showMenu && (
                                    <div className="absolute right-8 top-8 bg-[#1c1c1c] border border-white/10 shadow-2xl rounded-xl w-36 overflow-hidden z-50 animate-slide-left">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setShowMenu(false); handleDelete(); }}
                                            className="w-full flex items-center gap-2 px-4 py-3 text-red-500 hover:bg-white/5 font-bold text-sm transition-colors"
                                        >
                                            <TrashIcon className="w-4 h-4" /> Delete
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                        <button onClick={onClose} className="text-white p-1 hover:bg-white/10 rounded-full transition-colors">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Media */}
                <div
                    className="flex-1 relative bg-black flex items-center justify-center"
                    onClick={togglePause}
                >
                    {currentStatus.mediaType === 'video' ? (
                        <video
                            ref={videoRef}
                            src={currentStatus.mediaUrl}
                            className="w-full h-full object-contain"
                            muted={!!currentStatus.musicUrl}
                            loop={false}
                            playsInline
                        />
                    ) : (
                        <img
                            src={currentStatus.mediaUrl}
                            alt=""
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    )}

                    {/* Music */}
                    {currentStatus.musicUrl && (
                        <audio ref={audioRef} src={currentStatus.musicUrl} loop onError={() => setMusicBlocked(true)} />
                    )}

                    {/* Pause indicator */}
                    {paused && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/50 rounded-full p-4">
                                <div className="w-8 h-8 border-4 border-white rounded-full flex items-center justify-center">
                                    <div className="flex gap-1">
                                        <div className="w-1 h-4 bg-white rounded" />
                                        <div className="w-1 h-4 bg-white rounded" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Caption */}
                    {currentStatus.caption && (
                        <div className="absolute bottom-24 left-0 right-0 px-4">
                            <p className="text-white text-center text-sm font-medium bg-black/40 rounded-lg px-3 py-2 backdrop-blur-sm">
                                {currentStatus.caption}
                            </p>
                        </div>
                    )}
                    {!isOwn && (
                        <div className="absolute bottom-16 left-0 right-0 flex justify-center gap-2 px-4">
                            {['❤️', '😂', '🔥', '👏', '😮'].map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={(e) => { e.stopPropagation(); reactToStatus(emoji); }}
                                    className={`h-9 w-9 rounded-full bg-black/45 text-lg backdrop-blur hover:bg-white/20 ${myReaction === emoji ? 'ring-2 ring-white' : ''}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                    {Object.keys(reactionCounts).length > 0 && (
                        <div className="absolute right-4 bottom-16 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                            {Object.entries(reactionCounts).map(([emoji, count]) => `${emoji} ${count}`).join('  ')}
                        </div>
                    )}

                    {/* Music name */}
                    {currentStatus.musicName && (
                        <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-black/50 px-2 py-1 rounded-full">
                            <MusicalNoteIcon className="w-3 h-3 text-white animate-spin" style={{ animationDuration: '3s' }} />
                            <span className="text-white text-xs">{currentStatus.musicName}</span>
                        </div>
                    )}
                    {currentStatus.musicUrl && musicBlocked && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                audioRef.current?.play().then(() => setMusicBlocked(false)).catch(() => {});
                            }}
                            className="absolute bottom-14 left-4 bg-purple-600/90 text-white text-xs px-3 py-1.5 rounded-full"
                        >
                            Tap to play music
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
                    {isOwn ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setPaused(true); pausedRef.current = true; setShowViews(true); }}
                            className="flex items-center gap-1 text-white/80 text-sm"
                        >
                            <EyeIcon className="w-4 h-4" />
                            <span>{currentStatus.viewCount} views</span>
                        </button>
                    ) : (
                        <form
                            onSubmit={handleReplySubmit}
                            onClick={e => e.stopPropagation()}
                            className="flex w-full items-center gap-2"
                        >
                            <input
                                type="text"
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                onFocus={() => setViewerPaused(true)}
                                placeholder={`Reply to ${currentGroup.user.username}...`}
                                maxLength={1000}
                                className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2 text-sm text-white placeholder-white/60 outline-none ring-1 ring-white/20 focus:ring-white/50"
                            />
                            <button
                                type="submit"
                                disabled={!replyText.trim() || replySending}
                                className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <PaperAirplaneIcon className="w-4 h-4" />
                            </button>
                        </form>
                    )}
                </div>
                {replyNotice && (
                    <div className="absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                        {replyNotice}
                    </div>
                )}

                {/* Left/Right tap zones */}
                <button className="absolute left-0 top-0 w-1/3 h-full z-20 opacity-0" onClick={(e) => { e.stopPropagation(); goPrev(); }} />
                <button className="absolute right-0 top-0 w-1/3 h-full z-20 opacity-0" onClick={(e) => { e.stopPropagation(); goNext(); }} />

                {/* Nav arrows for desktop */}
                {groupIndex > 0 && (
                    <button onClick={goPrev} className="absolute -left-12 top-1/2 -translate-y-1/2 text-white/60 hover:text-white hidden md:block">
                        <ChevronLeftIcon className="w-8 h-8" />
                    </button>
                )}
                {groupIndex < statusGroups.length - 1 && (
                    <button onClick={goNext} className="absolute -right-12 top-1/2 -translate-y-1/2 text-white/60 hover:text-white hidden md:block">
                        <ChevronRightIcon className="w-8 h-8" />
                    </button>
                )}
            </div>

            {showViews && (
                <div className="absolute inset-0 bg-black/80 z-30 flex items-end justify-center" onClick={() => setShowViews(false)}>
                    <div className="bg-[#1c2126] w-full max-w-sm rounded-t-3xl p-5 max-h-[50%] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                <EyeIcon className="w-5 h-5 text-blue-400" /> {currentStatus.viewCount} Views
                            </h3>
                            <button onClick={() => setShowViews(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        
                        <div className="space-y-4">
                            {currentStatus.viewers && currentStatus.viewers.length > 0 ? (
                                currentStatus.viewers.map((viewer, idx) => (
                                    <div key={idx} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <img src={viewer.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                                            <div>
                                                <p className="text-white text-sm font-semibold">{viewer.username}</p>
                                                <p className="text-white/40 text-[10px]">Just now</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-500 text-center py-4">No views yet</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

export default StatusViewer;
