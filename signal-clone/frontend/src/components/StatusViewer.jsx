import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, MusicalNoteIcon, EyeIcon, TrashIcon } from '@heroicons/react/24/solid';
import axios from 'axios';

const StatusViewer = ({ statusGroups, initialGroupIndex = 0, currentUserId, token, onClose, onDelete }) => {
    const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
    const [statusIndex, setStatusIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [paused, setPaused] = useState(false);
    const [showViews, setShowViews] = useState(false);
    const [musicBlocked, setMusicBlocked] = useState(false);

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

    const handleDelete = async () => {
        await axios.delete(`/api/status/${currentStatus.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        onDelete(currentStatus.id);
        goNext();
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
                <div className="absolute top-4 left-0 right-0 z-10 flex items-center justify-between px-3 pt-4">
                    <div className="flex items-center gap-2">
                        <img src={currentGroup.user.avatar} alt="" className="w-9 h-9 rounded-full border-2 border-white object-cover" />
                        <div>
                            <p className="text-white text-sm font-semibold">{currentGroup.user.username}</p>
                            <p className="text-white/60 text-xs">{timeAgo(currentStatus.createdAt)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isOwn && (
                            <button onClick={handleDelete} className="text-white/70 hover:text-red-400 p-1">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={onClose} className="text-white p-1">
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
                        <div className="absolute bottom-16 left-0 right-0 px-4">
                            <p className="text-white text-center text-sm font-medium bg-black/40 rounded-lg px-3 py-2 backdrop-blur-sm">
                                {currentStatus.caption}
                            </p>
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
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
                    {isOwn ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setPaused(true); pausedRef.current = true; setShowViews(true); }}
                            className="flex items-center gap-1 text-white/80 text-sm"
                        >
                            <EyeIcon className="w-4 h-4" />
                            <span>{currentStatus.viewCount} views</span>
                        </button>
                    ) : <div />}
                </div>

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

            {/* Views Modal */}
            {showViews && (
                <div className="absolute inset-0 bg-black/80 z-30 flex items-end justify-center" onClick={() => setShowViews(false)}>
                    <div className="bg-gray-900 w-full max-w-sm rounded-t-2xl p-4 max-h-64 overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                            <EyeIcon className="w-4 h-4" /> {currentStatus.viewCount} Views
                        </h3>
                        <p className="text-gray-400 text-sm">View details available in full version.</p>
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
