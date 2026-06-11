import React, { useState, useRef, useEffect } from 'react';
import { HeartIcon, ChatBubbleOvalLeftIcon, ShareIcon, MusicalNoteIcon, FaceSmileIcon, EyeIcon, TrashIcon, NoSymbolIcon, ArrowDownTrayIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartOutline, EllipsisVerticalIcon, PencilIcon, PlayIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import NestedComment from './NestedComment';

const ReelCard = ({ reel, currentUser, onShare, onProfileClick, onReact, onDelete, active }) => {
    const [liked, setLiked] = useState(reel.isLiked);
    const [isIntersecting, setIsIntersecting] = useState(false);
    const [likesCount, setLikesCount] = useState(reel.likesCount);
    const [sharesCount, setSharesCount] = useState(reel.sharesCount || 0);
    const [viewsCount, setViewsCount] = useState(reel.viewsCount || 0);
    const [isFollowing, setIsFollowing] = useState(reel.user.isFollowing);
    const [caption, setCaption] = useState(reel.caption);
    const [showComments, setShowComments] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showEditCaption, setShowEditCaption] = useState(false);
    const [newCaption, setNewCaption] = useState(reel.caption);
    const [isUpdating, setIsUpdating] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [showReactions, setShowReactions] = useState(false);
    const [floatingEmojis, setFloatingEmojis] = useState([]);
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const viewedRef = useRef(false);
    
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

    const reactions = ['❤️', '😂', '🔥', '😮', '😢', '👏'];

    const toggleFollow = async (e) => {
        e.stopPropagation();
        if (reel.user.id === currentUser.id) return;
        try {
            const res = await axios.post(`/api/users/${reel.user.id}/follow`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
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
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            onDelete(reel.id);
        } catch (err) { alert("Delete failed"); }
    };

    const handleBlock = async () => {
        if (!window.confirm(`Block @${reel.user.username}?`)) return;
        try {
            await axios.post(`/api/users/${reel.user.id}/block`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            alert("User blocked");
        } catch (err) { console.error(err); }
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

        if (videoRef.current) observer.observe(videoRef.current);
        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (active && isIntersecting) {
            videoRef.current?.play().catch(() => {});
            if (audioRef.current) audioRef.current.play().catch(() => {});
        } else {
            videoRef.current?.pause();
            if (audioRef.current) audioRef.current.pause();
        }
    }, [active, isIntersecting]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.min(Math.max(reel.musicVolume ?? 0.8, 0), 1);
        }
    }, [reel.musicVolume]);

    const handleUpdateCaption = async () => {
        setIsUpdating(true);
        try {
            const res = await axios.put(`/api/reels/${reel.id}`, { caption: newCaption }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setCaption(res.data.caption);
            setShowEditCaption(false);
        } catch (err) { alert("Update failed"); }
        finally { setIsUpdating(false); }
    };

    const toggleLike = async () => {
        try {
            const res = await axios.post(`/api/reels/${reel.id}/like`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
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

    const handleShare = async () => {
        try {
            const res = await axios.post(`/api/reels/${reel.id}/share`);
            setSharesCount(res.data.sharesCount);
        } catch (err) { console.error(err); }

        const shareData = {
            title: 'Check out this Reel!',
            text: reel.caption,
            url: window.location.origin + '/reels/' + reel.id
        };
        if (navigator.share) {
            navigator.share(shareData).catch(() => {});
        } else {
            onShare(reel);
        }
    };

    const handleDownload = () => {
        try {
            let downloadUrl = reel.videoUrl;
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
            window.open(reel.videoUrl, '_blank');
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
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setNewComment('');
            fetchComments();
        } catch (err) { console.error(err); }
    };

    const handleReplyToComment = async (commentId, content) => {
        try {
            await axios.post(`/api/reels/comments/${commentId}/replies`, { content }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            fetchComments();
        } catch (err) {
            console.error("Failed to post reply:", err);
        }
    };

    return (
        <div className="relative h-full w-full bg-black snap-start flex items-center justify-center overflow-hidden">
            <video
                ref={videoRef}
                src={reel.videoUrl}
                className="h-full w-full object-contain cursor-pointer"
                loop
                playsInline
                preload="auto"
                muted={!!reel.musicUrl}
                style={{ filter: filters[reel.filterName] || '' }}
                onClick={() => {
                    if (videoRef.current.paused) {
                        videoRef.current.play();
                        audioRef.current?.play();
                    } else {
                        videoRef.current.pause();
                        audioRef.current?.pause();
                    }
                }}
            />

            {reel.musicUrl && (
                <audio ref={audioRef} src={reel.musicUrl} loop />
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
                        {currentUser.id === reel.user.id ? (
                            <>
                                <button onClick={() => { setShowEditCaption(true); setShowMenu(false); }} className="w-full flex items-center gap-3 p-3 text-white hover:bg-white/10 rounded-lg text-sm font-bold border-b border-white/5">
                                    <PencilIcon className="w-5 h-5 text-blue-400" /> Edit Caption
                                </button>
                                <button onClick={handleDelete} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-white/10 rounded-lg text-sm font-bold">
                                    <TrashIcon className="w-5 h-5" /> Delete Reel
                                </button>
                            </>
                        ) : (
                            <button onClick={handleBlock} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-white/10 rounded-lg text-sm font-bold">
                                <NoSymbolIcon className="w-5 h-5" /> Block User
                            </button>
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

                <div className="flex flex-col items-center relative">
                    <button onClick={() => setShowReactions(!showReactions)} className="p-2">
                        <FaceSmileIcon className="w-8 h-8 text-white" />
                    </button>
                    {showReactions && (
                        <div className="absolute right-12 bottom-0 flex gap-2 bg-black/60 backdrop-blur-md p-2 rounded-full animate-slide-left">
                            {reactions.map(r => (
                                <button key={r} onClick={() => { addFloatingEmoji(r); setShowReactions(false); }} className="text-2xl hover:scale-125 transition-transform">{r}</button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center">
                    <button onClick={() => onReact(reel)} className="p-2 bg-blue-500/20 rounded-full animate-pulse">
                        <EyeIcon className="w-8 h-8 text-blue-400" />
                    </button>
                    <span className="text-white text-[10px] font-bold mt-1">React</span>
                </div>

                <div className="flex flex-col items-center">
                    <button onClick={handleShare} className="p-2">
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

                {currentUser.id === reel.user.id && (
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
                        onClick={(e) => { e.stopPropagation(); onProfileClick(reel.user.id); }}
                    >
                        <img src={reel.user.avatar} className="w-10 h-10 rounded-full border-2 border-white shadow-lg group-hover:scale-110 transition-transform object-cover" alt="" />
                        <span className="text-white font-bold text-sm drop-shadow-md group-hover:underline">@{reel.user.username}</span>
                    </div>
                    {currentUser.id !== reel.user.id && (
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
