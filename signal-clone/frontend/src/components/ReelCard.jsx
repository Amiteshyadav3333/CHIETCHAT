import React, { useState, useRef, useEffect } from 'react';
import { HeartIcon, ChatBubbleOvalLeftIcon, ShareIcon, UserCircleIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import axios from 'axios';

const ReelCard = ({ reel, currentUser, onShare }) => {
    const [liked, setLiked] = useState(reel.isLiked);
    const [likesCount, setLikesCount] = useState(reel.likesCount);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const videoRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    videoRef.current?.play().catch(() => {});
                } else {
                    videoRef.current?.pause();
                }
            },
            { threshold: 0.6 }
        );

        if (videoRef.current) observer.observe(videoRef.current);
        return () => observer.disconnect();
    }, []);

    const toggleLike = async () => {
        try {
            const res = await axios.post(`/api/reels/${reel.id}/like`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setLiked(res.data.isLiked);
            setLikesCount(prev => res.data.isLiked ? prev + 1 : prev - 1);
        } catch (err) { console.error(err); }
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
        <div className="relative h-full w-full bg-black snap-start flex items-center justify-center">
            <video
                ref={videoRef}
                src={reel.videoUrl}
                className="h-full w-full object-contain cursor-pointer"
                loop
                playsInline
                onClick={() => {
                    if (videoRef.current.paused) videoRef.current.play();
                    else videoRef.current.pause();
                }}
            />

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

                <button onClick={() => onShare(reel)} className="p-2">
                    <ShareIcon className="w-8 h-8 text-white" />
                </button>
            </div>

            {/* User Info Overlay */}
            <div className="absolute left-4 bottom-8 right-16 z-10">
                <div className="flex items-center gap-3 mb-2">
                    <img src={reel.user.avatar} className="w-10 h-10 rounded-full border-2 border-white" alt="" />
                    <span className="text-white font-bold text-sm">@{reel.user.username}</span>
                    <button className="bg-transparent border border-white text-white px-3 py-1 rounded-lg text-xs font-bold">Follow</button>
                </div>
                <p className="text-white text-sm line-clamp-2">{reel.caption}</p>
                <div className="mt-2 flex items-center gap-2">
                    <span className="text-white/80 text-xs animate-pulse">🎵 Original Audio - {reel.user.username}</span>
                </div>
            </div>

            {/* Comments Drawer */}
            {showComments && (
                <div className="absolute inset-x-0 bottom-0 top-1/2 bg-[#1c1c1c] rounded-t-3xl z-20 flex flex-col animate-slide-up">
                    <div className="flex justify-between items-center p-4 border-b border-gray-800">
                        <h3 className="text-white font-bold">Comments</h3>
                        <button onClick={() => setShowComments(false)} className="text-gray-400">✕</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {comments.map(c => (
                            <div key={c.id} className="flex gap-3">
                                <img src={c.user.avatar} className="w-8 h-8 rounded-full" alt="" />
                                <div>
                                    <p className="text-white text-xs font-bold">@{c.user.username}</p>
                                    <p className="text-gray-300 text-sm">{c.content}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleComment} className="p-4 border-t border-gray-800 flex gap-2">
                        <input
                            type="text"
                            placeholder="Add a comment..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-full outline-none text-sm"
                        />
                        <button type="submit" className="text-blue-500 font-bold px-2">Post</button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default ReelCard;
