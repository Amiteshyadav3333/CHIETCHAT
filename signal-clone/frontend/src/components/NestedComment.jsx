import React, { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import LinkifiedText from './LinkifiedText';

const formatScore = score => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(score || 0);

const NestedComment = ({ comment, onReply, onEdit, onDelete, onVote, currentUser, onProfileClick, depth = 0 }) => {
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [showReplies, setShowReplies] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [replyError, setReplyError] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(comment.content);
    const [savingEdit, setSavingEdit] = useState(false);
    const [voteBusy, setVoteBusy] = useState(false);
    const [voteValue, setVoteValue] = useState(Number(comment.userVote) || 0);
    const [score, setScore] = useState(Number(comment.score) || 0);
    const isOwner = currentUser && String(currentUser.id) === String(comment.user.id);

    useEffect(() => {
        setVoteValue(Number(comment.userVote) || 0);
        setScore(Number(comment.score) || 0);
    }, [comment.userVote, comment.score]);

    const handleSubmitReply = async event => {
        event.preventDefault();
        if (!replyText.trim() || submitting) return;
        setSubmitting(true);
        setReplyError('');
        try {
            await onReply(comment.id, replyText.trim());
            setReplyText('');
            setShowReplyBox(false);
            setShowReplies(true);
        } catch (error) {
            setReplyError(error.response?.data?.error || 'Reply could not be posted. Try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVote = async direction => {
        if (!onVote || voteBusy) return;
        const previousVote = voteValue;
        const nextVote = previousVote === direction ? 0 : direction;
        const previousScore = score;
        setVoteValue(nextVote);
        setScore(previousScore - previousVote + nextVote);
        setVoteBusy(true);
        try {
            const result = await onVote(comment.id, nextVote);
            if (result) {
                setVoteValue(Number(result.userVote) || 0);
                setScore(Number(result.score) || 0);
            }
        } catch {
            setVoteValue(previousVote);
            setScore(previousScore);
        } finally {
            setVoteBusy(false);
        }
    };

    const handleEdit = async event => {
        event.preventDefault();
        const content = editText.trim();
        if (!content || content === comment.content) {
            setEditText(comment.content);
            setIsEditing(false);
            return;
        }
        setSavingEdit(true);
        try {
            await onEdit(comment.id, content);
            setIsEditing(false);
        } catch {
            // The parent displays the server error and keeps the editor open.
        } finally {
            setSavingEdit(false);
        }
    };

    const timestamp = comment.createdAt
        ? new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '';

    return (
        <div className={`w-full ${depth ? 'relative' : ''}`}>
            {depth > 0 && <span className="absolute -left-4 top-0 h-5 w-4 rounded-bl-xl border-b border-l border-white/10" aria-hidden="true" />}
            <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="mt-0.5 flex w-8 shrink-0 flex-col items-center rounded-xl bg-white/[0.035] py-1 text-gray-400 sm:w-9" aria-label={`Comment score ${score}`}>
                    <button
                        type="button"
                        onClick={() => handleVote(1)}
                        disabled={voteBusy}
                        aria-label={voteValue === 1 ? 'Remove upvote' : 'Upvote comment'}
                        aria-pressed={voteValue === 1}
                        className={`rounded-lg p-0.5 transition-colors hover:bg-orange-500/15 hover:text-orange-400 disabled:opacity-50 ${voteValue === 1 ? 'text-orange-400' : ''}`}
                    >
                        <ChevronUpIcon className="h-5 w-5 stroke-[2.5]" />
                    </button>
                    <span className={`min-w-[2ch] text-center text-[11px] font-black tabular-nums ${voteValue === 1 ? 'text-orange-400' : voteValue === -1 ? 'text-indigo-300' : 'text-gray-300'}`}>
                        {formatScore(score)}
                    </span>
                    <button
                        type="button"
                        onClick={() => handleVote(-1)}
                        disabled={voteBusy}
                        aria-label={voteValue === -1 ? 'Remove downvote' : 'Downvote comment'}
                        aria-pressed={voteValue === -1}
                        className={`rounded-lg p-0.5 transition-colors hover:bg-indigo-500/15 hover:text-indigo-300 disabled:opacity-50 ${voteValue === -1 ? 'text-indigo-300' : ''}`}
                    >
                        <ChevronDownIcon className="h-5 w-5 stroke-[2.5]" />
                    </button>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="rounded-2xl border border-white/[0.07] bg-[#14171b] px-3.5 py-3 transition-colors hover:border-white/[0.13] sm:px-4">
                        <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <button type="button" onClick={() => onProfileClick(comment.user.id)} className="flex min-w-0 items-center gap-2 text-left">
                                <img src={comment.user.avatar || '/default-avatar.png'} alt="" className="h-6 w-6 shrink-0 rounded-full border border-white/10 object-cover" />
                                <span className="truncate text-xs font-extrabold text-gray-100 hover:underline">@{comment.user.username}</span>
                            </button>
                            {comment.user.isVerified && <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white" title="Verified">✓</span>}
                            {comment.isBoosted && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold text-violet-300">Creator</span>}
                            <span className="text-[10px] text-gray-500">· {timestamp}</span>
                        </div>

                        {isEditing ? (
                            <form onSubmit={handleEdit}>
                                <textarea value={editText} onChange={event => setEditText(event.target.value)} maxLength={1000} autoFocus rows={3}
                                    className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-orange-400/60" />
                                <div className="mt-2 flex justify-end gap-2">
                                    <button type="button" onClick={() => { setEditText(comment.content); setIsEditing(false); }} className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-white/5 hover:text-white">Cancel</button>
                                    <button type="submit" disabled={savingEdit || !editText.trim()} className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50">{savingEdit ? 'Saving…' : 'Save edit'}</button>
                                </div>
                            </form>
                        ) : <div className="break-words text-left text-[13px] leading-6 text-gray-200"><LinkifiedText>{comment.content}</LinkifiedText></div>}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-semibold text-gray-500">
                        <button type="button" onClick={() => { setReplyError(''); setShowReplyBox(value => !value); }} className="transition-colors hover:text-orange-300">Reply</button>
                        {comment.replies?.length > 0 && (
                            <button type="button" onClick={() => setShowReplies(value => !value)} className="text-gray-400 transition-colors hover:text-white">
                                {showReplies ? 'Hide' : 'View'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                            </button>
                        )}
                        {isOwner && onEdit && !isEditing && <button type="button" onClick={() => { setEditText(comment.content); setIsEditing(true); }} className="transition-colors hover:text-blue-300">Edit</button>}
                        {isOwner && onDelete && <button type="button" onClick={() => onDelete(comment.id)} className="transition-colors hover:text-red-300">Delete</button>}
                    </div>

                    {showReplyBox && (
                        <form onSubmit={handleSubmitReply} className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2.5">
                            <div className="flex items-center gap-2">
                                <img src={currentUser?.avatar || '/default-avatar.png'} alt="" className="h-7 w-7 shrink-0 rounded-full border border-white/10 object-cover" />
                                <input value={replyText} onChange={event => setReplyText(event.target.value)} maxLength={1000}
                                    placeholder={`Reply to @${comment.user.username}`} autoFocus
                                    className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-600 focus:border-orange-400/50" />
                                <button type="submit" disabled={submitting || !replyText.trim()} aria-label="Send reply"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40">
                                    <PaperAirplaneIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {replyError && <p className="px-9 pt-2 text-xs text-red-300">{replyError}</p>}
                        </form>
                    )}
                </div>
            </div>

            {showReplies && comment.replies?.length > 0 && (
                <div className="ml-4 mt-3 space-y-3 border-l border-white/10 pl-3 sm:ml-5 sm:pl-4">
                    {comment.replies.map(reply => (
                        <NestedComment key={reply.id} comment={reply} onReply={onReply} onEdit={onEdit} onDelete={onDelete}
                            onVote={onVote} currentUser={currentUser} onProfileClick={onProfileClick} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NestedComment;
