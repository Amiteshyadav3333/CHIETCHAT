import React, { useState, useRef, useEffect } from 'react';
import { HeartIcon, ChatBubbleOvalLeftIcon, ShareIcon, MusicalNoteIcon, FaceSmileIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import axios from 'axios';

const ReelCard = ({ reel, currentUser, onShare }) => {
    const [liked, setLiked] = useState(reel.isLiked);
    const [likesCount, setLikesCount] = useState(reel.likesCount);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [showReactions, setShowReactions] = useState(false);
    const [floatingEmojis, setFloatingEmojis] = useState([]);
    const videoRef = useRef(null);
    const audioRef = useRef(null);

    const reactions = ['❤️', '😂', '🔥', '😮', '😢', '👏'];

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    videoRef.current?.play().catch(() => {});
                    if (audioRef.current) audioRef.current.play().catch(() => {});
                } else {
                    videoRef.current?.pause();
                    if (audioRef.current) audioRef.current.pause();
                }
            },
            { threshold: 0.6 }
        );

        if (videoRef.current) observer.observe(videoRef.current);
        return () => {
            observer.disconnect();
            if (audioRef.current) audioRef.current.pause();
        };
    }, []);

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

    return (
        <div className="relative h-full w-full bg-black snap-start flex items-center justify-center overflow-hidden">
            <video
                ref={videoRef}
                src={reel.videoUrl}
                className="h-full w-full object-contain cursor-pointer"
                loop
                playsInline
                muted={!!reel.musicUrl}
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

                <button onClick={handleShare} className="p-2">
                    <ShareIcon className="w-8 h-8 text-white" />
                </button>
            </div>

            {/* User Info Overlay */}
            <div className="absolute left-4 bottom-8 right-16 z-10">
                <div className="flex items-center gap-3 mb-2">
                    <img src={reel.user.avatar} className="w-10 h-10 rounded-full border-2 border-white shadow-lg" alt="" />
                    <span className="text-white font-bold text-sm drop-shadow-md">@{reel.user.username}</span>
                    <button className="bg-white text-black px-3 py-1 rounded-full text-xs font-bold hover:bg-gray-200 transition-colors">Follow</button>
                </div>
                <p className="text-white text-sm line-clamp-2 drop-shadow-md">{reel.caption}</p>
                {reel.musicName && (
                    <div className="mt-3 flex items-center gap-2 bg-black/30 w-fit px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                        <MusicalNoteIcon className="w-3 h-3 text-white animate-spin" style={{ animationDuration: '3s' }} />
                        <marquee className="text-white text-xs w-24">{reel.musicName}</marquee>
                    </div>
                )}
            </div>

            {/* Comments Drawer (same as before but styled better) */}
            {showComments && (
                <div className="absolute inset-x-0 bottom-0 top-1/2 bg-[#1c1c1c] rounded-t-3xl z-30 flex flex-col animate-slide-up border-t border-white/10 shadow-2xl">
                    <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto my-3" onClick={() => setShowComments(false)} />
                    <div className="flex justify-between items-center px-4 pb-2 border-b border-white/5">
                        <h3 className="text-white font-bold">Comments</h3>
                        <button onClick={() => setShowComments(false)} className="text-gray-400 p-2">✕</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {comments.length > 0 ? comments.map(c => (
                            <div key={c.id} className="flex gap-3">
                                <img src={c.user.avatar} className="w-8 h-8 rounded-full border border-white/10" alt="" />
                                <div className="flex-1">
                                    <p className="text-gray-400 text-[11px] font-bold">@{c.user.username}</p>
                                    <p className="text-gray-100 text-sm mt-0.5">{c.content}</p>
                                </div>
                            </div>
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
