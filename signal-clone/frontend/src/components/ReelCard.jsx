import React, { useState, useRef, useEffect, useContext } from 'react';
import { HeartIcon, ChatBubbleOvalLeftIcon, ShareIcon, MusicalNoteIcon, EyeIcon, TrashIcon, NoSymbolIcon, ArrowDownTrayIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartOutline, EllipsisVerticalIcon, PencilIcon, PlayIcon, ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import NestedComment from './NestedComment';
import { getSafeMediaUrl, openSafeExternal } from '../utils/safeUrl';
import { AuthContext } from '../context/AuthContext';
import ReelShareSheet from './ReelShareSheet';

const REPOST_REACTIONS = ['🔥', '❤️', '😂', '😮', '👏'];

const ReelCard = ({ reel, currentUser, onShare, onProfileClick, onReact, onDelete, active, autoplay = true, startMuted = false, dataSaver = false }) => {
    const { token } = useContext(AuthContext);
    const reelOwner = reel?.user || {};
    const currentUserId = currentUser?.id;
    const ownerId = reelOwner.id;
    const [liked, setLiked] = useState(Boolean(reel?.isLiked));
    const [isIntersecting, setIsIntersecting] = useState(false);
    const [likesCount, setLikesCount] = useState(reel?.likesCount || 0);
    const [sharesCount, setSharesCount] = useState(reel?.sharesCount || 0);
    const [viewsCount, setViewsCount] = useState(reel?.viewsCount || 0);
    const [repostsCount, setRepostsCount] = useState(reel?.repostsCount || 0);
    const [isReposted, setIsReposted] = useState(Boolean(reel?.isReposted));
    const [repostNote, setRepostNote] = useState(reel?.repostNote || '');
    const [showRepost, setShowRepost] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [savingRepost, setSavingRepost] = useState(false);
    const [isFollowing, setIsFollowing] = useState(Boolean(reelOwner.isFollowing));
    const [caption, setCaption] = useState(reel?.caption || '');
    const [showComments, setShowComments] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showEditCaption, setShowEditCaption] = useState(false);
    const [newCaption, setNewCaption] = useState(reel?.caption || '');
    const [isUpdating, setIsUpdating] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [floatingEmojis, setFloatingEmojis] = useState([]);
    const [videoError, setVideoError] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [playbackMuted, setPlaybackMuted] = useState(startMuted);
    const [mediaNearby, setMediaNearby] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const videoRef = useRef(null);
    const cardRef = useRef(null);
    const audioRef = useRef(null);
    const viewedRef = useRef(false);
    const mediaBaseUrl = typeof window === 'undefined' ? 'https://cheetchat.invalid' : window.location.href;
    const safeVideoUrl = getSafeMediaUrl(reel?.videoUrl, mediaBaseUrl);
    const safeMusicUrl = getSafeMediaUrl(reel?.musicUrl, mediaBaseUrl);
    
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

    const toggleFollow = async (e) => {
        e.stopPropagation();
        if (!ownerId || ownerId === currentUserId) return;
        try {
            const res = await axios.post(`/api/users/${ownerId}/follow`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIsFollowing(res.data.isFollowing);
        } catch (err) { console.error(err); }
    };

    const recordView = async () => {
        if (viewedRef.current) return;
        viewedRef.current = true;
        try {
            const res = await axios.post(`/api/reels/${reel.id}/view`);
            setViewsCount(res.data.viewsCount);
        } catch (err) { console.error(err); }
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this Reel?")) return;
        try {
            await axios.delete(`/api/reels/${reel.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            onDelete(reel.id);
        } catch (err) { alert("Delete failed"); }
    };

    const openAnalytics = async () => {
        try {
            const { data } = await axios.get(`/api/reels/${reel.id}/analytics`, { headers: { Authorization: `Bearer ${token}` } });
            setAnalytics(data); setShowAnalytics(true); setShowMenu(false);
        } catch (err) { alert(err.response?.data?.error || 'Analytics unavailable'); }
    };

    const handleBlock = async () => {
        if (!ownerId || !window.confirm(`Block @${reelOwner.username || 'this user'}?`)) return;
        try {
            await axios.post(`/api/users/${ownerId}/block`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert("User blocked");
        } catch (err) { console.error(err); }
    };

    const handleReport = async () => {
        const reason = window.prompt('Report reason', 'Adult or inappropriate video');
        if (!reason) return;
        try {
            const { data } = await axios.post(`/api/reels/${reel.id}/report`, { reason }, { headers: { Authorization: `Bearer ${token}` } });
            alert(data.message || 'Report submitted'); setShowMenu(false);
        } catch (err) { alert(err.response?.data?.error || 'Could not submit report'); }
    };

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsIntersecting(entry.isIntersecting);
                if (entry.isIntersecting) {
                    recordView();
                }
            },
            { threshold: 0.6 }
        );

        if (cardRef.current) observer.observe(cardRef.current);
        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setMediaNearby(true);
            },
            { threshold: 0.01, rootMargin: '100% 0px' }
        );
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (autoplay && active && isIntersecting) {
            videoRef.current?.play().catch(() => {});
            if (audioRef.current) audioRef.current.play().catch(() => {});
        } else {
            videoRef.current?.pause();
            if (audioRef.current) audioRef.current.pause();
        }
    }, [active, autoplay, isIntersecting, mediaNearby]);

    useEffect(() => setPlaybackMuted(startMuted), [startMuted]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.min(Math.max(reel.musicVolume ?? 0.8, 0), 1);
        }
    }, [reel.musicVolume]);

    const handleUpdateCaption = async () => {
        setIsUpdating(true);
        try {
            const res = await axios.put(`/api/reels/${reel.id}`, { caption: newCaption }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCaption(res.data.caption);
            setShowEditCaption(false);
        } catch (err) { alert("Update failed"); }
        finally { setIsUpdating(false); }
    };

    const toggleLike = async () => {
        try {
            const res = await axios.post(`/api/reels/${reel.id}/like`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLiked(res.data.isLiked);
            setLikesCount(prev => res.data.isLiked ? prev + 1 : prev - 1);
            if (res.data.isLiked) addFloatingEmoji('❤️');
        } catch (err) { console.error(err); }
    };

    const addFloatingEmoji = (emoji) => {
        const id = Date.now() + Math.random();
        setFloatingEmojis(prev => [...prev, { id, emoji, left: Math.random() * 80 + 10 }]);
        setTimeout(() => {
            setFloatingEmojis(prev => prev.filter(e => e.id !== id));
        }, 2000);
    };

    const saveRepost = async () => {
        setSavingRepost(true);
        try {
            const res = await axios.post(`/api/reels/${reel.id}/repost`, { note: repostNote }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIsReposted(res.data.isReposted);
            setRepostsCount(res.data.repostsCount);
            setRepostNote(res.data.repostNote || '');
            setShowRepost(false);
            addFloatingEmoji(repostNote.trim().split(/\s+/)[0] || '🔁');
        } catch (err) {
            alert(err.response?.data?.error || 'Could not repost this Reel');
        } finally { setSavingRepost(false); }
    };

    const removeRepost = async () => {
        setSavingRepost(true);
        try {
            const res = await axios.delete(`/api/reels/${reel.id}/repost`, { headers: { Authorization: `Bearer ${token}` } });
            setIsReposted(false);
            setRepostsCount(res.data.repostsCount);
            setRepostNote('');
            setShowRepost(false);
        } catch (err) {
            alert(err.response?.data?.error || 'Could not remove repost');
        } finally { setSavingRepost(false); }
    };

    const handleDownload = () => {
        if (!safeVideoUrl) return;
        try {
            let downloadUrl = safeVideoUrl;
            if (downloadUrl.includes('cloudinary.com')) {
                // Cloudinary trick to force download
                downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
            }
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `reel-${reel.id}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            openSafeExternal(safeVideoUrl);
        }
    };

    const fetchComments = async () => {
        try {
            const res = await axios.get(`/api/reels/${reel.id}/comments`);
            setComments(res.data);
        } catch (err) { console.error(err); }
    };

    const handleComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        try {
            await axios.post(`/api/reels/${reel.id}/comments`, { content: newComment }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNewComment('');
            fetchComments();
        } catch (err) { console.error(err); }
    };

    const handleReplyToComment = async (commentId, content) => {
        try {
            await axios.post(`/api/reels/comments/${commentId}/replies`, { content }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchComments();
        } catch (err) {
            console.error("Failed to post reply:", err);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!window.confirm("Delete this comment?")) return;
        try {
            await axios.delete(`/api/reels/comments/${commentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchComments();
        } catch (err) {
            console.error("Failed to delete comment:", err);
            alert("Could not delete comment");
        }
    };

    const handleEditComment = async (commentId, content) => {
        try {
            await axios.patch(`/api/reels/comments/${commentId}`, { content }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await fetchComments();
        } catch (err) {
            alert(err.response?.data?.error || "Could not edit comment");
            throw err;
        }
    };

    return (
        <div ref={cardRef} className="relative h-full w-full bg-black snap-start flex items-center justify-center overflow-hidden">
            {videoError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 text-gray-400 gap-2 p-4 text-center select-none">
                    <span className="text-5xl">⚠️</span>
                    <p className="text-sm font-bold">Video not available</p>
                    <p className="text-xs text-gray-500 max-w-[200px] leading-relaxed">The video link is broken or has been removed from the server.</p>
                </div>
            ) : (
                safeVideoUrl ? <video
                    ref={videoRef}
                    src={mediaNearby ? safeVideoUrl : undefined}
                    className="h-full w-full object-contain cursor-pointer"
                    loop
                    playsInline
                    preload={mediaNearby && !dataSaver ? 'auto' : 'metadata'}
                    muted={playbackMuted || !!safeMusicUrl}
                    style={{ filter: filters[reel.filterName] || '' }}
                    onError={() => setVideoError(true)}
                    onCanPlay={() => {
                        if (autoplay && active && isIntersecting) videoRef.current?.play().catch(() => {});
                    }}
                    onClick={() => {
                        if (playbackMuted) {
                            setPlaybackMuted(false);
                            videoRef.current.muted = Boolean(safeMusicUrl);
                            if (audioRef.current) audioRef.current.muted = false;
                            videoRef.current.play().catch(() => {});
                            audioRef.current?.play().catch(() => {});
                            return;
                        }
                        if (videoRef.current.paused) {
                            videoRef.current.play();
                            audioRef.current?.play();
                        } else {
                            videoRef.current.pause();
                            audioRef.current?.pause();
                        }
                    }}
                    referrerPolicy="no-referrer"
                /> : <div className="flex h-full w-full items-center justify-center bg-[#111b21] px-6 text-center text-sm font-semibold text-red-300">Unsafe or unavailable reel media</div>
            )}

            {safeMusicUrl && (
                <audio ref={audioRef} src={mediaNearby ? safeMusicUrl : undefined} loop muted={playbackMuted} preload={mediaNearby && !dataSaver ? 'auto' : 'metadata'} />
            )}

            {/* Floating Emojis */}
            {floatingEmojis.map(e => (
                <div 
                    key={e.id} 
                    className="absolute bottom-20 text-4xl pointer-events-none animate-float-up"
                    style={{ left: `${e.left}%` }}
                >
                    {e.emoji}
                </div>
            ))}

            {/* Menu Toggle */}
            <div className="absolute top-4 right-4 z-20">
                <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-white/70 hover:text-white">
                    <EllipsisVerticalIcon className="w-8 h-8" />
                </button>
                {showMenu && (
                    <div className="absolute right-0 top-12 bg-black/80 backdrop-blur-md rounded-xl p-2 min-w-[150px] border border-white/10 animate-slide-left">
                        {currentUserId && currentUserId === ownerId ? (
                            <>
                                <button onClick={() => { setShowEditCaption(true); setShowMenu(false); }} className="w-full flex items-center gap-3 p-3 text-white hover:bg-white/10 rounded-lg text-sm font-bold border-b border-white/5">
                                    <PencilIcon className="w-5 h-5 text-blue-400" /> Edit Caption
                                </button>
                                {currentUser?.isPremium && <button onClick={openAnalytics} className="w-full flex items-center gap-3 p-3 text-blue-300 hover:bg-white/10 rounded-lg text-sm font-bold border-b border-white/5"><EyeIcon className="w-5 h-5" /> Advanced analytics</button>}
                                <button onClick={handleDelete} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-white/10 rounded-lg text-sm font-bold">
                                    <TrashIcon className="w-5 h-5" /> Delete Reel
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={handleBlock} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-white/10 rounded-lg text-sm font-bold">
                                    <NoSymbolIcon className="w-5 h-5" /> Block User
                                </button>
                                <button onClick={handleReport} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-white/10 rounded-lg text-sm font-bold">
                                    <span className="text-lg">⚑</span> Report Video
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Side Actions */}
            <div className="absolute right-4 bottom-24 flex flex-col items-center gap-6 z-10">
                <div className="flex flex-col items-center">
                    <button onClick={toggleLike} className="p-2">
                        {liked ? <HeartIcon className="w-8 h-8 text-red-500" /> : <HeartOutline className="w-8 h-8 text-white" />}
                    </button>
                    <span className="text-white text-xs font-bold">{likesCount}</span>
                </div>

                <div className="flex flex-col items-center">
                    <button onClick={() => { setShowComments(true); fetchComments(); }} className="p-2">
                        <ChatBubbleOvalLeftIcon className="w-8 h-8 text-white" />
                    </button>
                    <span className="text-white text-xs font-bold">{reel.commentsCount}</span>
                </div>



                <div className="flex flex-col items-center">
                    <button onClick={() => onReact?.(reel)} className="p-2 bg-blue-500/20 rounded-full animate-pulse">
                        <EyeIcon className="w-8 h-8 text-blue-400" />
                    </button>
                    <span className="text-white text-[10px] font-bold mt-1">React</span>
                </div>

                <div className="flex flex-col items-center">
                    <button onClick={() => setShowRepost(true)} className="p-2" aria-label="Repost this Reel">
                        <ArrowPathRoundedSquareIcon className={`h-8 w-8 ${isReposted ? 'text-green-400' : 'text-white'}`} />
                    </button>
                    <span className="text-white text-xs font-bold">{repostsCount}</span>
                </div>

                <div className="flex flex-col items-center">
                    <button onClick={() => setShowShare(true)} className="p-2" aria-label="Share this Reel">
                        <ShareIcon className="w-8 h-8 text-white" />
                    </button>
                    <span className="text-white text-xs font-bold">{sharesCount}</span>
                </div>

                <div className="flex flex-col items-center">
                    <button onClick={handleDownload} className="p-2">
                        <ArrowDownTrayIcon className="w-8 h-8 text-white" />
                    </button>
                    <span className="text-white text-[10px] font-bold mt-1">Save</span>
                </div>

                {currentUserId && currentUserId === ownerId && (
                    <div className="flex flex-col items-center">
                        <button onClick={handleDelete} className="p-2">
                            <TrashIcon className="w-8 h-8 text-red-500" />
                        </button>
                        <span className="text-white text-[10px] font-bold mt-1">Delete</span>
                    </div>
                )}
            </div>

            {/* User Info Overlay */}
            <div className="absolute left-4 bottom-8 right-16 z-10">
                <div className="flex items-center gap-3 mb-2">
                    <div 
                        className="flex items-center gap-3 cursor-pointer group"
                        onClick={(e) => { e.stopPropagation(); if (ownerId) onProfileClick(ownerId); }}
                    >
                        <img src={reelOwner.avatar || '/icons/icon-192.png'} className="w-10 h-10 rounded-full border-2 border-white shadow-lg group-hover:scale-110 transition-transform object-cover" alt="" />
                        <span className="text-white font-bold text-sm drop-shadow-md group-hover:underline">@{reelOwner.username || 'unknown'}</span>
                        {reelOwner.isVerified && <span title="Premium verified" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white">✓</span>}
                    </div>
                    {ownerId && currentUserId !== ownerId && (
                        <button 
                            onClick={toggleFollow}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${isFollowing ? 'bg-transparent border border-white text-white' : 'bg-white text-black hover:bg-gray-200'}`}
                        >
                            {isFollowing ? 'Following' : 'Follow'}
                        </button>
                    )}
                </div>
                <p className="text-white text-sm line-clamp-2 drop-shadow-md mb-2">{caption}</p>
                <div className="flex items-center gap-3">
                    {reel.musicName && (
                        <div className="flex items-center gap-2 bg-black/30 w-fit px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                            <MusicalNoteIcon className="w-3 h-3 text-white animate-spin" style={{ animationDuration: '3s' }} />
                            <marquee className="text-white text-xs w-20">{reel.musicName}</marquee>
                        </div>
                    )}
                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md">
                        <PlayIcon className="w-3 h-3 text-white/60" />
                        <span className="text-white/80 text-[10px] font-bold">{viewsCount} Views</span>
                    </div>
                </div>
            </div>

            {/* Comments Drawer */}
            {showComments && (
                <div className="absolute inset-x-0 bottom-0 top-1/2 bg-[#1c1c1c] rounded-t-3xl z-30 flex flex-col animate-slide-up border-t border-white/10 shadow-2xl">
                    <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto my-3" onClick={() => setShowComments(false)} />
                    <div className="flex justify-between items-center px-4 pb-2 border-b border-white/5">
                        <h3 className="text-white font-bold">Comments</h3>
                        <button onClick={() => setShowComments(false)} className="text-gray-400 p-2">✕</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {comments.length > 0 ? comments.map(c => (
                            <NestedComment
                                key={c.id}
                                comment={c}
                                onReply={handleReplyToComment}
                                onEdit={handleEditComment}
                                onDelete={handleDeleteComment}
                                currentUser={currentUser}
                                onProfileClick={onProfileClick}
                            />
                        )) : (
                            <p className="text-gray-500 text-center py-10 text-sm">No comments yet. Start the conversation!</p>
                        )}
                    </div>
                    <form onSubmit={handleComment} className="p-4 bg-[#252525] border-t border-white/5 flex gap-2">
                        <input
                            type="text"
                            placeholder="Add a comment..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="flex-1 bg-gray-800 text-white px-4 py-2.5 rounded-full outline-none text-sm focus:ring-1 focus:ring-blue-500"
                        />
                        <button type="submit" className="bg-blue-600 text-white px-4 rounded-full font-bold text-sm">Post</button>
                    </form>
                </div>
            )}
            {showAnalytics && analytics && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setShowAnalytics(false)}><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#171717] p-6 text-white" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-xl font-black">Advanced analytics</h3><button onClick={() => setShowAnalytics(false)}>✕</button></div><div className="mt-5 grid grid-cols-2 gap-3">{[['Views', analytics.views], ['Engagement', analytics.engagement], ['Shares', analytics.shares], ['Earnings', `₹${(analytics.earningsPaise / 100).toFixed(2)}`]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/5 p-4"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div></div></div>}

            {/* Edit Caption Modal */}
            {showEditCaption && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6" onClick={() => setShowEditCaption(false)}>
                    <div className="bg-[#1c1c1c] w-full max-w-sm rounded-3xl p-6 space-y-4 border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-lg">Edit Caption</h3>
                        <textarea
                            value={newCaption}
                            onChange={(e) => setNewCaption(e.target.value)}
                            className="w-full bg-gray-900 text-white p-4 rounded-2xl outline-none focus:ring-1 focus:ring-blue-500 text-sm resize-none"
                            rows={4}
                            placeholder="Write a new caption..."
                            maxLength={300}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setShowEditCaption(false)} className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm">Cancel</button>
                            <button 
                                onClick={handleUpdateCaption}
                                disabled={isUpdating}
                                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                            >
                                {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRepost && (
                <div className="absolute inset-0 z-50 flex items-end bg-black/65" onClick={() => setShowRepost(false)}>
                    <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#171717] p-6 text-white" onClick={event => event.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">{isReposted ? 'Update your repost' : 'Repost this Reel'}</h3><p className="text-xs text-white/50">It will appear in your profile</p></div><button onClick={() => setShowRepost(false)}>✕</button></div>
                        <div className="mb-3 flex justify-between rounded-2xl bg-white/5 p-3">
                            {REPOST_REACTIONS.map(emoji => <button key={emoji} onClick={() => setRepostNote(current => { const parts = current.split(' '); const body = REPOST_REACTIONS.includes(parts[0]) ? parts.slice(1).join(' ') : current; return `${emoji} ${body}`.trim(); })} className="text-2xl transition-transform hover:scale-125">{emoji}</button>)}
                        </div>
                        <textarea value={repostNote} onChange={event => setRepostNote(event.target.value)} maxLength={280} rows={3} placeholder="Add your reaction…" className="w-full resize-none rounded-2xl bg-gray-900 p-4 text-sm text-white outline-none focus:ring-1 focus:ring-green-400" />
                        <div className="mt-4 flex gap-2">
                            {isReposted && <button disabled={savingRepost} onClick={removeRepost} className="rounded-xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-400">Remove</button>}
                            <button disabled={savingRepost} onClick={saveRepost} className="flex-1 rounded-xl bg-green-500 py-3 text-sm font-bold text-black disabled:opacity-50">{savingRepost ? 'Saving…' : isReposted ? 'Update repost' : 'Repost'}</button>
                        </div>
                    </div>
                </div>
            )}

            {showShare && <ReelShareSheet reel={reel} token={token} onClose={() => setShowShare(false)} onShareToChat={onShare} onShared={setSharesCount} />}

            <style>{`
                @keyframes float-up {
                    0% { transform: translateY(0) scale(1); opacity: 1; }
                    100% { transform: translateY(-300px) scale(1.5); opacity: 0; }
                }
                .animate-float-up { animation: float-up 2s ease-out forwards; }
                @keyframes slide-left {
                    from { transform: translateX(20px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slide-left { animation: slide-left 0.2s ease-out; }
            `}</style>
        </div>
    );
};

export default ReelCard;
