import React, { useState } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

const NestedComment = ({ comment, onReply, onDelete, currentUser, onProfileClick, depth = 0 }) => {
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [showReplies, setShowReplies] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmitReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;
        setSubmitting(true);
        try {
            await onReply(comment.id, replyText);
            setReplyText('');
            setShowReplyBox(false);
            setShowReplies(true);
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 text-sm w-full">
            <div className="flex gap-2.5 items-start">
                <button type="button" onClick={() => onProfileClick(comment.user.id)} className="flex-shrink-0 mt-0.5">
                    <img src={comment.user.avatar} alt="" className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-signal-accent/50 transition border border-white/10" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="bg-white/5 rounded-2xl px-3.5 py-2 relative group/comment">
                        <button type="button" onClick={() => onProfileClick(comment.user.id)} className="font-bold text-xs hover:underline text-gray-200">
                            @{comment.user.username}
                        </button>
                        <p className="text-gray-100 text-sm mt-0.5 leading-relaxed break-words text-left pr-6">{comment.content}</p>
                        
                        {/* Delete comment button */}
                        {currentUser && currentUser.id === comment.user.id && onDelete && (
                            <button
                                type="button"
                                onClick={() => onDelete(comment.id)}
                                className="absolute right-3 top-3.5 text-gray-500 hover:text-red-400 opacity-0 group-hover/comment:opacity-100 transition-opacity"
                                title="Delete comment"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-3 mt-1.5 px-1">
                        <span className="text-[10px] text-gray-500">
                            {comment.createdAt ? new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <button type="button" onClick={() => setShowReplyBox(p => !p)} className="text-xs text-gray-400 hover:text-white transition font-medium">
                            Reply
                        </button>
                        {comment.replies && comment.replies.length > 0 && (
                            <button type="button" onClick={() => setShowReplies(p => !p)} className="text-xs text-blue-400 hover:underline font-semibold">
                                {showReplies ? 'Hide replies' : `Show replies (${comment.replies.length})`}
                            </button>
                        )}
                    </div>

                    {/* Reply Input Box */}
                    {showReplyBox && (
                        <form onSubmit={handleSubmitReply} className="mt-2.5 flex gap-2">
                            <img src={currentUser?.avatar} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-1 border border-white/10" />
                            <div className="flex-1 flex gap-2">
                                <input
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    placeholder={`Reply to @${comment.user.username}...`}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-signal-accent text-white"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={submitting || !replyText.trim()}
                                    className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white transition flex items-center justify-center"
                                >
                                    <PaperAirplaneIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            {/* Render child replies recursively */}
            {showReplies && comment.replies && comment.replies.length > 0 && (
                <div className="mt-1 pl-4 border-l border-white/10 ml-4 space-y-3.5 w-full">
                    {comment.replies.map(reply => (
                        <NestedComment
                            key={reply.id}
                            comment={reply}
                            onReply={onReply}
                            onDelete={onDelete}
                            currentUser={currentUser}
                            onProfileClick={onProfileClick}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NestedComment;
