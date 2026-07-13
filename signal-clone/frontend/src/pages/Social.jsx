import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    ArrowLeftIcon, PhotoIcon, HeartIcon, ChatBubbleOvalLeftIcon,
    PaperAirplaneIcon, PlusIcon, UserPlusIcon, CheckIcon, XMarkIcon,
    TrashIcon, UsersIcon, ArrowPathRoundedSquareIcon, ShareIcon,
    PencilIcon, LinkIcon, CalendarIcon, ArrowUpTrayIcon, UserCircleIcon,
    EllipsisHorizontalIcon, MagnifyingGlassIcon, BookmarkIcon,
    BellIcon, HomeIcon, HashtagIcon, SparklesIcon
} from '@heroicons/react/24/outline';
import {
    HeartIcon as HeartSolidIcon,
    ArrowPathRoundedSquareIcon as RetweetSolidIcon,
    BookmarkIcon as BookmarkSolidIcon
} from '@heroicons/react/24/solid';
import FullscreenMediaModal from '../components/FullscreenMediaModal';
import NestedComment from '../components/NestedComment';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const XLogo = ({ className = 'w-8 h-8', style }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={style} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.907-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
);

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffSecs < 60) return diffSecs + 's';
    if (diffMins < 60) return diffMins + 'm';
    if (diffHours < 24) return diffHours + 'h';
    if (diffDays < 7) return diffDays + 'd';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtCount = (n) => {
    if (!n) return 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n;
};

const TRENDING = [
    { tag: '#ChietChat', posts: '12.4K', category: 'Technology' },
    { tag: '#WebRTC', posts: '8.1K', category: 'Technology' },
    { tag: '#ReactJS', posts: '45.2K', category: 'Programming' },
    { tag: '#OpenSource', posts: '22.7K', category: 'Technology' },
    { tag: '#DevLife', posts: '18.9K', category: 'Trending' },
];

const XLoading = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ width: 32, height: 32, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#1d9bf0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

const XEmptyState = ({ text }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <XLogo style={{ width: 48, height: 48, color: '#2f3336', marginBottom: 16 }} />
        <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Nothing here yet</p>
        <p style={{ fontSize: 14, color: '#71767b' }}>{text}</p>
    </div>
);

const TweetAction = ({ icon, count, onClick, active, activeColor, hoverColor, hoverBg }) => (
    <button onClick={e => { e.stopPropagation(); onClick && onClick(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: '#71767b', transition: 'all 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = hoverBg || 'rgba(29,155,240,0.1)'; e.currentTarget.style.color = hoverColor || '#1d9bf0'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = active && activeColor ? activeColor : '#71767b'; }}
    >
        <span style={active && activeColor ? { color: activeColor } : {}}>{icon}</span>
        {count > 0 && <span style={{ fontSize: 13, fontWeight: 500, color: active && activeColor ? activeColor : 'inherit' }}>{fmtCount(count)}</span>}
    </button>
);

const XComposer = ({ avatar, caption, setCaption, media, setMedia, preview, fileRef, posting, onSubmit }) => {
    const maxChars = 280;
    const remaining = maxChars - caption.length;
    const progress = Math.min((caption.length / maxChars) * 100, 100);
    const isOverLimit = remaining < 0;
    const canPost = (caption.trim() || media) && !isOverLimit;
    const circumference = 2 * Math.PI * 9;
    const dashOffset = circumference - (progress / 100) * circumference;

    return (
        <div style={{ display: 'flex', gap: 12 }}>
            <img src={avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <textarea
                    id="tweet-composer"
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    placeholder="What's happening?!"
                    rows={caption ? Math.max(3, Math.ceil(caption.length / 50)) : 2}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 20, color: '#e7e9ea', lineHeight: 1.6, fontFamily: 'inherit' }}
                />
                {preview && (
                    <div style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', border: '1px solid #2f3336', position: 'relative' }}>
                        {media && media.type.startsWith('video/') ? (
                            <video src={preview} controls style={{ width: '100%', maxHeight: 288, objectFit: 'contain', background: '#000' }} />
                        ) : (
                            <img src={preview} alt="" style={{ width: '100%', maxHeight: 288, objectFit: 'contain', background: '#000' }} />
                        )}
                        <button onClick={() => { setMedia(null); if (fileRef.current) fileRef.current.value = ''; }}
                            style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%', background: 'rgba(15,20,25,0.75)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <XMarkIcon style={{ width: 16, height: 16 }} />
                        </button>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #2f3336' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => setMedia(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                        <button onClick={() => fileRef.current && fileRef.current.click()} title="Photo/Video"
                            style={{ padding: 8, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1d9bf0' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(29,155,240,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <PhotoIcon style={{ width: 20, height: 20 }} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {caption.length > 0 && (
                            <svg width="24" height="24" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="12" cy="12" r="9" fill="none" stroke="#2f3336" strokeWidth="2" />
                                <circle cx="12" cy="12" r="9" fill="none"
                                    stroke={isOverLimit ? '#f4212e' : remaining < 20 ? '#ffd400' : '#1d9bf0'}
                                    strokeWidth="2" strokeDasharray={circumference} strokeDashoffset={dashOffset}
                                    strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.2s' }} />
                                {remaining < 20 && <text x="12" y="16" textAnchor="middle" fontSize="8" fill={isOverLimit ? '#f4212e' : '#71767b'} style={{ transform: 'rotate(90deg)', transformOrigin: '12px 12px' }}>{remaining}</text>}
                            </svg>
                        )}
                        <div style={{ width: 1, height: 24, background: '#2f3336' }} />
                        <button onClick={onSubmit} disabled={posting || !canPost}
                            style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, border: 'none', cursor: canPost ? 'pointer' : 'not-allowed', background: canPost ? '#1d9bf0' : '#0f4f6e', color: canPost ? '#fff' : '#71767b', transition: 'background 0.15s' }}>
                            {posting ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TweetCard = ({ post, currentUser, token, onLike, onRetweet, onShare, onDelete, onFollow, onOpenProfile }) => {
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showRetweetMenu, setShowRetweetMenu] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [zoomedMedia, setZoomedMedia] = useState(null);
    const [bookmarked, setBookmarked] = useState(false);
    const [hovered, setHovered] = useState(false);
    const menuRef = useRef(null);
    const rtMenuRef = useRef(null);
    const displayPost = post.isRetweet && post.originalPost ? post.originalPost : post;

    const fetchComments = async () => {
        try { const res = await axios.get('/api/social/posts/' + post.id + '/comments'); setComments(res.data); } catch { }
    };
    const submitComment = async (e) => {
        e.preventDefault();
        if (!comment.trim()) return;
        setSubmitting(true);
        try {
            await axios.post('/api/social/posts/' + post.id + '/comments', { content: comment }, { headers: authHeaders(localStorage.getItem('token')) });
            setComment(''); fetchComments();
        } catch { } finally { setSubmitting(false); }
    };
    const handleReplyToComment = async (commentId, content) => {
        try { await axios.post('/api/social/comments/' + commentId + '/replies', { content }, { headers: authHeaders(localStorage.getItem('token') || token) }); fetchComments(); } catch { }
    };
    const handleDeleteComment = async (commentId) => {
        if (!window.confirm('Delete this comment?')) return;
        try { await axios.delete('/api/social/comments/' + commentId, { headers: authHeaders(localStorage.getItem('token') || token) }); fetchComments(); } catch { }
    };

    useEffect(() => {
        const handle = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
            if (rtMenuRef.current && !rtMenuRef.current.contains(e.target)) setShowRetweetMenu(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    const authorId = displayPost.user && displayPost.user.id ? displayPost.user.id : post.user.id;
    const authorAvatar = (displayPost.user && displayPost.user.avatar) ? displayPost.user.avatar : post.user.avatar;
    const authorName = (displayPost.user && displayPost.user.username) ? displayPost.user.username : post.user.username;
    const authorHandle = '@' + (authorName || '').toLowerCase().replace(/\s+/g, '_');
    const postCaption = displayPost.caption || post.caption;
    const postMedia = displayPost.mediaUrl || post.mediaUrl;
    const postMediaType = displayPost.mediaType || post.mediaType;
    const postDate = displayPost.createdAt || post.createdAt;

    return (
        <article
            style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid #2f3336', cursor: 'pointer', background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.15s' }}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        >
            <button onClick={() => onOpenProfile(authorId)} style={{ flexShrink: 0, marginTop: 2, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <img src={authorAvatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
                {post.isRetweet && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#71767b', marginBottom: 4 }}>
                        <ArrowPathRoundedSquareIcon style={{ width: 14, height: 14 }} />
                        <button onClick={() => onOpenProfile(post.user.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#71767b', fontWeight: 700, fontSize: 12 }}>
                            {post.user.id === (currentUser && currentUser.id) ? 'You' : post.user.username}
                        </button>
                        <span>reposted</span>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                        <button onClick={() => onOpenProfile(authorId)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e7e9ea', fontWeight: 700, fontSize: 14 }}>{authorName}</button>
                        <span style={{ fontSize: 14, color: '#71767b' }}>{authorHandle}</span>
                        <span style={{ color: '#71767b' }}>·</span>
                        <span style={{ fontSize: 14, color: '#71767b', whiteSpace: 'nowrap' }}>{formatDate(postDate)}</span>
                    </div>
                    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                        <button onClick={() => setShowMenu(s => !s)} style={{ padding: 6, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#71767b' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,155,240,0.1)'; e.currentTarget.style.color = '#1d9bf0'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#71767b'; }}>
                            <EllipsisHorizontalIcon style={{ width: 20, height: 20 }} />
                        </button>
                        {showMenu && (
                            <div style={{ position: 'absolute', right: 0, top: 32, background: '#000', border: '1px solid #2f3336', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', zIndex: 50, minWidth: 220, padding: '4px 0', overflow: 'hidden' }}>
                                {authorId !== (currentUser && currentUser.id) && (
                                    <button onClick={() => { onFollow(); setShowMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea', fontSize: 14, fontWeight: 700, textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <UserPlusIcon style={{ width: 20, height: 20 }} />
                                        {post.user.isFollowing ? 'Unfollow' : 'Follow'} @{authorHandle.slice(1)}
                                    </button>
                                )}
                                {post.canDelete && (
                                    <button onClick={() => { onDelete(); setShowMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f4212e', fontSize: 14, fontWeight: 700, textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,33,46,0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <TrashIcon style={{ width: 20, height: 20 }} />Delete post
                                    </button>
                                )}
                                <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(window.location.origin + '/?post=' + post.id); setShowMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea', fontSize: 14, textAlign: 'left' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <LinkIcon style={{ width: 20, height: 20 }} />Copy link
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {postCaption && <p style={{ marginTop: 4, fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e7e9ea' }}>{postCaption}</p>}

                {postMedia && (
                    <div style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', border: '1px solid #2f3336', maxHeight: 500 }}>
                        {postMediaType === 'video' ? (
                            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setZoomedMedia({ src: postMedia, type: 'video' })}>
                                <video src={postMedia} style={{ width: '100%', maxHeight: 500, objectFit: 'contain', background: '#000', display: 'block' }} preload="metadata" muted />
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(15,20,25,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg viewBox="0 0 24 24" fill="white" style={{ width: 28, height: 28, marginLeft: 4 }}><path d="M8 5v14l11-7z" /></svg>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <img src={postMedia} alt="" style={{ width: '100%', maxHeight: 500, objectFit: 'cover', cursor: 'pointer', display: 'block' }} onClick={() => setZoomedMedia({ src: postMedia, type: 'image' })} />
                        )}
                    </div>
                )}

                {/* Action bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginLeft: -8 }}>
                    <TweetAction icon={<ChatBubbleOvalLeftIcon style={{ width: 20, height: 20 }} />} count={comments.length || post.commentsCount} onClick={() => { setCommentsOpen(p => !p); if (!commentsOpen) fetchComments(); }} hoverColor="#1d9bf0" hoverBg="rgba(29,155,240,0.1)" />
                    <div ref={rtMenuRef} style={{ position: 'relative' }}>
                        <TweetAction
                            icon={post.isRetweeted ? <RetweetSolidIcon style={{ width: 20, height: 20, color: '#00ba7c' }} /> : <ArrowPathRoundedSquareIcon style={{ width: 20, height: 20 }} />}
                            count={post.retweetCount} active={post.isRetweeted} activeColor="#00ba7c"
                            onClick={() => setShowRetweetMenu(s => !s)} hoverColor="#00ba7c" hoverBg="rgba(0,186,124,0.1)" />
                        {showRetweetMenu && (
                            <div style={{ position: 'absolute', bottom: 40, left: 0, background: '#000', border: '1px solid #2f3336', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', zIndex: 50, minWidth: 200, padding: '4px 0' }}>
                                <button onClick={() => { onRetweet(); setShowRetweetMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea', fontSize: 14, fontWeight: 700, textAlign: 'left' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <ArrowPathRoundedSquareIcon style={{ width: 20, height: 20 }} />{post.isRetweeted ? 'Undo repost' : 'Repost'}
                                </button>
                                <button onClick={() => setShowRetweetMenu(false)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea', fontSize: 14, textAlign: 'left' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <PencilIcon style={{ width: 20, height: 20 }} />Quote
                                </button>
                            </div>
                        )}
                    </div>
                    <TweetAction
                        icon={post.isLiked ? <HeartSolidIcon style={{ width: 20, height: 20, color: '#f91880' }} /> : <HeartIcon style={{ width: 20, height: 20 }} />}
                        count={post.likesCount} active={post.isLiked} activeColor="#f91880" onClick={onLike} hoverColor="#f91880" hoverBg="rgba(249,24,128,0.1)" />
                    <TweetAction
                        icon={bookmarked ? <BookmarkSolidIcon style={{ width: 20, height: 20, color: '#1d9bf0' }} /> : <BookmarkIcon style={{ width: 20, height: 20 }} />}
                        active={bookmarked} activeColor="#1d9bf0" onClick={() => setBookmarked(b => !b)} hoverColor="#1d9bf0" hoverBg="rgba(29,155,240,0.1)" />
                    <TweetAction icon={<ShareIcon style={{ width: 20, height: 20 }} />} onClick={onShare} hoverColor="#1d9bf0" hoverBg="rgba(29,155,240,0.1)" />
                </div>

                {commentsOpen && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #2f3336', paddingTop: 12 }}>
                        {comments.length === 0 && <p style={{ fontSize: 14, textAlign: 'center', padding: '12px 0', color: '#71767b' }}>No replies yet.</p>}
                        {comments.map(item => (
                            <NestedComment key={item.id} comment={item} onReply={handleReplyToComment} onDelete={handleDeleteComment} currentUser={currentUser} onProfileClick={onOpenProfile} />
                        ))}
                        <form onSubmit={submitComment} style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                            <img src={currentUser && currentUser.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Post your reply"
                                style={{ flex: 1, borderRadius: 9999, padding: '8px 16px', fontSize: 14, outline: 'none', background: '#202327', border: '1px solid #333639', color: '#e7e9ea' }} />
                            <button type="submit" disabled={submitting || !comment.trim()}
                                style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: '#1d9bf0', color: '#fff', border: 'none', cursor: comment.trim() ? 'pointer' : 'not-allowed', opacity: comment.trim() ? 1 : 0.5 }}>
                                Reply
                            </button>
                        </form>
                    </div>
                )}
            </div>
            {zoomedMedia && <FullscreenMediaModal src={zoomedMedia.src} type={zoomedMedia.type} onClose={() => setZoomedMedia(null)} />}
        </article>
    );
};

const WhoToFollow = ({ token, currentUser, onOpenProfile, onFollow }) => {
    const [suggestions, setSuggestions] = useState([]);
    useEffect(() => {
        if (!token) return;
        axios.get('/api/social/posts?feed=all', { headers: authHeaders(token) }).then(res => {
            const seen = new Set(); const users = [];
            for (const post of res.data) {
                const u = post.user;
                if (u && u.id !== (currentUser && currentUser.id) && !seen.has(u.id) && !u.isFollowing) {
                    seen.add(u.id); users.push(u);
                    if (users.length >= 3) break;
                }
            }
            setSuggestions(users);
        }).catch(() => {});
    }, [token]);
    if (!suggestions.length) return null;
    return (
        <div style={{ borderRadius: 16, overflow: 'hidden', background: '#16181c' }}>
            <h2 style={{ padding: '12px 16px', fontWeight: 800, fontSize: 20 }}>Who to follow</h2>
            {suggestions.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid #2f3336' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <button onClick={() => onOpenProfile(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>
                        <img src={u.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    </button>
                    <button onClick={() => onOpenProfile(u.id)} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#e7e9ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</p>
                        <p style={{ fontSize: 14, color: '#71767b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{(u.username || '').toLowerCase().replace(/\s+/g, '_')}</p>
                    </button>
                    <button onClick={() => onFollow(u.id)}
                        style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: '#e7e9ea', color: '#0f1419', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                        Follow
                    </button>
                </div>
            ))}
        </div>
    );
};

const ChannelsList = ({ channels, loading, onOpen, onSubscribe, onCreateNew }) => (
    <div style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #2f3336' }}>
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>Spaces</h2>
            <button onClick={onCreateNew}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: '#1d9bf0', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1a8cd8'}
                onMouseLeave={e => e.currentTarget.style.background = '#1d9bf0'}>
                <PlusIcon style={{ width: 16, height: 16 }} />New Space
            </button>
        </div>
        {loading ? <XLoading /> : channels.length ? channels.map(ch => (
            <div key={ch.id} style={{ borderBottom: '1px solid #2f3336' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <button onClick={() => onOpen(ch.id)} style={{ width: '100%', display: 'flex', gap: 16, padding: '16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: '#202327', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ch.coverUrl ? <img src={ch.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <SparklesIcon style={{ width: 28, height: 28, color: '#1d9bf0' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, color: '#e7e9ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</p>
                        <p style={{ fontSize: 14, color: '#71767b', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ch.description || 'A community space'}</p>
                        <p style={{ fontSize: 12, color: '#71767b', marginTop: 6 }}>{ch.subscriberCount} members</p>
                    </div>
                </button>
                <div style={{ padding: '0 16px 16px' }}>
                    {ch.role === 'owner' ? <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: '#1d9bf0', color: '#fff' }}>Owner</span>
                        : ch.role === 'approved' ? <span style={{ fontSize: 12, fontWeight: 700, color: '#00ba7c', display: 'flex', alignItems: 'center', gap: 4 }}><CheckIcon style={{ width: 14, height: 14 }} />Member</span>
                        : ch.role === 'pending' ? <span style={{ fontSize: 12, fontWeight: 700, color: '#ffd400' }}>Request pending…</span>
                        : <button onClick={() => onSubscribe(ch.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: 'transparent', border: '1px solid #1d9bf0', color: '#1d9bf0', cursor: 'pointer' }}>
                            <UserPlusIcon style={{ width: 16, height: 16 }} />Join
                        </button>}
                </div>
            </div>
        )) : <XEmptyState text="No spaces yet. Create one!" />}
    </div>
);

const ChannelView = ({ channel, posts, user, preview, media, caption, posting, fileRef, setCaption, setMedia, submitPost, likePost, retweetPost, sharePost, deletePost, toggleFollow, requestSubscribe, reviewRequest, openProfile, currentUser }) => (
    <div style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ borderBottom: '1px solid #2f3336' }}>
            <div style={{ height: 112, background: 'linear-gradient(135deg, #1d9bf0 0%, #764ba2 100%)', position: 'relative' }}>
                {channel.coverUrl && <img src={channel.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ padding: '16px' }}>
                <h2 style={{ fontSize: 24, fontWeight: 800 }}>{channel.name}</h2>
                <p style={{ fontSize: 14, color: '#71767b', marginTop: 4 }}>{channel.description}</p>
                <p style={{ fontSize: 12, color: '#71767b', marginTop: 4 }}>
                    Created by{' '}
                    <button onClick={() => openProfile(channel.owner.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1d9bf0', fontSize: 12 }}>@{(channel.owner.username || '').toLowerCase()}</button>
                    {' · '}{channel.subscriberCount} members
                </p>
                {(channel.role === 'none' || channel.role === 'rejected') && (
                    <button onClick={requestSubscribe} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: '#1d9bf0', color: '#fff', border: 'none', cursor: 'pointer' }}>Request to join</button>
                )}
                {channel.role === 'pending' && <p style={{ marginTop: 12, color: '#ffd400', fontWeight: 700, fontSize: 14 }}>Request pending approval…</p>}
            </div>
        </div>
        {channel.role === 'owner' && channel.pendingRequests && channel.pendingRequests.length > 0 && (
            <div style={{ padding: '16px', borderBottom: '1px solid #2f3336' }}>
                <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Join Requests ({channel.pendingRequests.length})</h3>
                {channel.pendingRequests.map(req => (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <img src={req.user.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                        <span style={{ flex: 1, fontWeight: 500 }}>{req.user.username}</span>
                        <button onClick={() => reviewRequest(req.id, 'approve')} style={{ padding: 8, borderRadius: '50%', background: 'rgba(0,186,124,0.15)', border: 'none', cursor: 'pointer', color: '#00ba7c' }}><CheckIcon style={{ width: 20, height: 20 }} /></button>
                        <button onClick={() => reviewRequest(req.id, 'reject')} style={{ padding: 8, borderRadius: '50%', background: 'rgba(244,33,46,0.15)', border: 'none', cursor: 'pointer', color: '#f4212e' }}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
                    </div>
                ))}
            </div>
        )}
        {channel.canPost && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f3336' }}>
                <XComposer avatar={user && user.avatar} caption={caption} setCaption={setCaption} media={media} setMedia={setMedia} preview={preview} fileRef={fileRef} posting={posting} onSubmit={submitPost} />
            </div>
        )}
        {posts.length ? posts.map(post => (
            <TweetCard key={post.id} post={post} currentUser={currentUser || user} token={localStorage.getItem('token')}
                onLike={() => likePost(post.id)} onRetweet={() => retweetPost(post.id)}
                onShare={() => sharePost(post.id)} onDelete={() => deletePost(post.id)}
                onFollow={() => toggleFollow(post.user.id)} onOpenProfile={openProfile} />
        )) : <XEmptyState text={channel.canPost ? 'No posts yet.' : 'Join this space to see content.'} />}
    </div>
);

const UserProfileView = ({ userId, currentUser, token, updateUser, onBack, onOpenProfile, onLike, onRetweet, onShare, onDelete, onFollow }) => {
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ username: '', bio: '', websiteUrl: '' });
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [profileTab, setProfileTab] = useState('posts');
    const [avatarHover, setAvatarHover] = useState(false);
    const avatarInputRef = useRef(null);
    const isOwnProfile = userId === (currentUser && currentUser.id);

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/social/users/' + userId, { headers: authHeaders(token) });
            setProfileData(res.data);
            setEditForm({ username: res.data.user.username || '', bio: res.data.user.bio || '', websiteUrl: res.data.user.websiteUrl || '' });
        } catch { } finally { setLoading(false); }
    }, [userId, token]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const saveProfile = async () => {
        setSaving(true);
        try {
            const res = await axios.post('/api/users/profile', editForm, { headers: authHeaders(token) });
            setProfileData(prev => ({ ...prev, user: { ...prev.user, ...res.data } }));
            if (updateUser) updateUser(res.data);
            setEditMode(false);
        } catch { alert('Could not save profile'); } finally { setSaving(false); }
    };

    const uploadAvatar = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        setUploadingAvatar(true);
        const fd = new FormData(); fd.append('avatar', file);
        try {
            const res = await axios.post('/api/user/avatar', fd, { headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' } });
            setProfileData(prev => ({ ...prev, user: { ...prev.user, avatar: res.data.user.avatar } }));
            if (updateUser) updateUser(res.data.user);
        } catch { alert('Avatar upload failed'); } finally { setUploadingAvatar(false); }
    };

    const handleFollowToggle = async () => {
        if (!profileData) return;
        try {
            const res = await axios.post('/api/users/' + userId + '/follow', {}, { headers: authHeaders(token) });
            setProfileData(prev => ({ ...prev, user: { ...prev.user, isFollowing: res.data.isFollowing, followersCount: prev.user.followersCount + (res.data.isFollowing ? 1 : -1) } }));
        } catch { }
    };

    const handleLike = async (postId) => {
        try { const res = await axios.post('/api/social/posts/' + postId + '/like', {}, { headers: authHeaders(token) }); setProfileData(prev => ({ ...prev, posts: prev.posts.map(p => p.id === postId ? { ...p, isLiked: res.data.isLiked, likesCount: res.data.likesCount } : p) })); } catch { }
    };
    const handleRetweet = async (postId) => {
        try { const res = await axios.post('/api/social/posts/' + postId + '/retweet', {}, { headers: authHeaders(token) }); setProfileData(prev => ({ ...prev, posts: prev.posts.map(p => p.id === postId ? { ...p, isRetweeted: res.data.isRetweeted, retweetCount: res.data.retweetCount } : p) })); } catch { }
    };
    const handleShare = async (postId) => {
        const url = window.location.origin + '/?post=' + postId;
        try { await axios.post('/api/social/posts/' + postId + '/share', {}, { headers: authHeaders(token) }); } catch { }
        if (navigator.share) { try { await navigator.share({ url }); } catch { } } else { navigator.clipboard && navigator.clipboard.writeText(url); }
    };
    const handleDelete = async (postId) => {
        if (!window.confirm('Delete this post?')) return;
        try { await axios.delete('/api/social/posts/' + postId, { headers: authHeaders(token) }); setProfileData(prev => ({ ...prev, posts: prev.posts.filter(p => p.id !== postId) })); } catch { alert('Delete failed'); }
    };

    if (loading) return <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#e7e9ea' }}><XLoading /></div>;

    const u = profileData && profileData.user;

    return (
        <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#000', color: '#e7e9ea', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', overflow: 'hidden' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', flexShrink: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
                <button onClick={onBack} style={{ padding: 8, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <ArrowLeftIcon style={{ width: 20, height: 20 }} />
                </button>
                <div>
                    <h1 style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{u && u.username}</h1>
                    <p style={{ fontSize: 13, color: '#71767b' }}>{(profileData && profileData.posts && profileData.posts.length) || 0} posts</p>
                </div>
            </header>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ height: 144, background: 'linear-gradient(135deg, #1d9bf0 0%, #0747a6 50%, #764ba2 100%)', position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, opacity: 0.2, background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)' }} />
                </div>
                <div style={{ padding: '0 16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: -48, marginBottom: 12 }}>
                        <div style={{ position: 'relative' }} onMouseEnter={() => setAvatarHover(true)} onMouseLeave={() => setAvatarHover(false)}>
                            <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', border: '4px solid #000', flexShrink: 0 }}>
                                <img src={u && u.avatar} alt={u && u.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            {isOwnProfile && (
                                <>
                                    <button onClick={() => avatarInputRef.current && avatarInputRef.current.click()} disabled={uploadingAvatar}
                                        style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: avatarHover ? 1 : 0, transition: 'opacity 0.15s' }}>
                                        {uploadingAvatar ? <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <ArrowUpTrayIcon style={{ width: 28, height: 28, color: '#fff' }} />}
                                    </button>
                                    <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
                                </>
                            )}
                        </div>
                        {isOwnProfile ? (
                            editMode ? (
                                <div style={{ display: 'flex', gap: 8, marginTop: 56 }}>
                                    <button onClick={() => setEditMode(false)} style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, border: '1px solid #2f3336', background: 'transparent', color: '#e7e9ea', cursor: 'pointer' }}>Cancel</button>
                                    <button onClick={saveProfile} disabled={saving} style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: '#e7e9ea', color: '#0f1419', border: 'none', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
                                </div>
                            ) : (
                                <button onClick={() => setEditMode(true)} style={{ marginTop: 56, padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, border: '1px solid #536471', background: 'transparent', color: '#e7e9ea', cursor: 'pointer' }}>Edit profile</button>
                            )
                        ) : (
                            <button onClick={handleFollowToggle} style={{ marginTop: 56, padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: u && u.isFollowing ? 'transparent' : '#e7e9ea', color: u && u.isFollowing ? '#e7e9ea' : '#0f1419', border: u && u.isFollowing ? '1px solid #536471' : 'none', cursor: 'pointer' }}>
                                {u && u.isFollowing ? 'Following' : 'Follow'}
                            </button>
                        )}
                    </div>

                    {editMode ? (
                        <div style={{ marginBottom: 12 }}>
                            <input value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))} placeholder="Display name"
                                style={{ width: '100%', borderRadius: 8, padding: '12px 16px', fontSize: 20, fontWeight: 700, outline: 'none', background: '#202327', border: '1px solid #333639', color: '#e7e9ea', marginBottom: 8, boxSizing: 'border-box' }} />
                            <textarea value={editForm.bio} onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))} placeholder="Bio" rows={3} maxLength={160}
                                style={{ width: '100%', borderRadius: 8, padding: '12px 16px', fontSize: 14, outline: 'none', background: '#202327', border: '1px solid #333639', color: '#e7e9ea', resize: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <LinkIcon style={{ width: 16, height: 16, color: '#71767b', flexShrink: 0 }} />
                                <input value={editForm.websiteUrl} onChange={e => setEditForm(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="Website"
                                    style={{ flex: 1, borderRadius: 8, padding: '8px 16px', fontSize: 14, outline: 'none', background: '#202327', border: '1px solid #333639', color: '#e7e9ea' }} />
                            </div>
                        </div>
                    ) : (
                        <>
                            <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{u && u.username}</h2>
                            <p style={{ fontSize: 14, color: '#71767b', marginBottom: 8 }}>@{u && (u.username || '').toLowerCase().replace(/\s+/g, '_')}</p>
                            {u && u.bio && <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>{u.bio}</p>}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 12 }}>
                                {u && u.websiteUrl && (
                                    <a href={u.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: '#1d9bf0', textDecoration: 'none' }}>
                                        <LinkIcon style={{ width: 16, height: 16 }} />{u.websiteUrl.replace(/^https?:\/\//, '')}
                                    </a>
                                )}
                                {u && u.joinedAt && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: '#71767b' }}>
                                        <CalendarIcon style={{ width: 16, height: 16 }} />Joined {new Date(u.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                        <span style={{ fontSize: 14 }}><strong style={{ fontWeight: 700, color: '#e7e9ea' }}>{u && u.followingCount || 0}</strong> <span style={{ color: '#71767b' }}>Following</span></span>
                        <span style={{ fontSize: 14 }}><strong style={{ fontWeight: 700, color: '#e7e9ea' }}>{u && u.followersCount || 0}</strong> <span style={{ color: '#71767b' }}>Followers</span></span>
                    </div>

                    <div style={{ display: 'flex', margin: '0 -16px', borderBottom: '1px solid #2f3336' }}>
                        {['posts', 'replies', 'media', 'likes'].map(tab => (
                            <button key={tab} onClick={() => setProfileTab(tab)}
                                style={{ flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600, textTransform: 'capitalize', background: 'transparent', border: 'none', cursor: 'pointer', color: profileTab === tab ? '#e7e9ea' : '#71767b', position: 'relative' }}>
                                {tab}
                                {profileTab === tab && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', height: 4, width: 40, borderRadius: 9999, background: '#1d9bf0' }} />}
                            </button>
                        ))}
                    </div>
                </div>

                {profileData && profileData.posts && profileData.posts.length ? profileData.posts.map(post => (
                    <TweetCard key={post.id} post={post} currentUser={currentUser} token={token}
                        onLike={() => handleLike(post.id)} onRetweet={() => handleRetweet(post.id)}
                        onShare={() => handleShare(post.id)} onDelete={() => handleDelete(post.id)}
                        onFollow={() => {}} onOpenProfile={onOpenProfile} />
                )) : <XEmptyState text={isOwnProfile ? "You haven't posted yet." : "No posts yet."} />}
            </div>
        </div>
    );
};

const Social = ({ onBack, deepLink, onDeepLinkConsumed }) => {
    const { user, token, updateUser } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState('for-you');
    const [posts, setPosts] = useState([]);
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [channelPosts, setChannelPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState(null);
    const [preview, setPreview] = useState(null);
    const [posting, setPosting] = useState(false);
    const [showChannelForm, setShowChannelForm] = useState(false);
    const [channelForm, setChannelForm] = useState({ name: '', description: '', cover: null });
    const [profileView, setProfileView] = useState(null);
    const [highlightedPostId, setHighlightedPostId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const fileRef = useRef(null);
    const coverRef = useRef(null);
    const highlightedRef = useRef(null);
    const deepLinkHandled = useRef(false);

    const fetchPosts = useCallback(async (tab) => {
        setLoading(true);
        const t = tab || activeTab;
        try {
            const feed = t === 'following' ? 'following' : 'all';
            const res = await axios.get('/api/social/posts?feed=' + feed, { headers: authHeaders(token) });
            setPosts(res.data);
        } catch { } finally { setLoading(false); }
    }, [token, activeTab]);

    const fetchChannels = useCallback(async () => {
        setLoading(true);
        try { const res = await axios.get('/api/social/channels', { headers: authHeaders(token) }); setChannels(res.data); } catch { } finally { setLoading(false); }
    }, [token]);

    const fetchChannel = async (channelId) => {
        setLoading(true);
        try { const res = await axios.get('/api/social/channels/' + channelId, { headers: authHeaders(token) }); setSelectedChannel(res.data.channel); setChannelPosts(res.data.posts); } catch { } finally { setLoading(false); }
    };

    useEffect(() => {
        if (!token) return;
        if (activeTab === 'channels') fetchChannels(); else fetchPosts(activeTab);
    }, [activeTab, token]);

    useEffect(() => {
        if (!deepLink || deepLinkHandled.current) return;
        deepLinkHandled.current = true;
        if (deepLink.type === 'profile') { setProfileView({ userId: deepLink.id }); onDeepLinkConsumed && onDeepLinkConsumed(); }
        else if (deepLink.type === 'channel') { setActiveTab('channels'); fetchChannel(deepLink.id); onDeepLinkConsumed && onDeepLinkConsumed(); }
        else if (deepLink.type === 'post') {
            setActiveTab('for-you'); setSelectedChannel(null);
            fetchPosts('for-you').then(() => { setHighlightedPostId(deepLink.id); onDeepLinkConsumed && onDeepLinkConsumed(); setTimeout(() => setHighlightedPostId(null), 4000); });
        }
    }, [deepLink]);

    useEffect(() => {
        if (!media) { setPreview(null); return; }
        const url = URL.createObjectURL(media);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [media]);

    const submitPost = async (channelId) => {
        if (!caption.trim() && !media) return;
        setPosting(true);
        const fd = new FormData();
        fd.append('caption', caption);
        if (channelId) fd.append('channelId', channelId);
        if (media) fd.append('media', media);
        try {
            const res = await axios.post('/api/social/posts', fd, { headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' } });
            channelId ? setChannelPosts(p => [res.data, ...p]) : setPosts(p => [res.data, ...p]);
            setCaption(''); setMedia(null); if (fileRef.current) fileRef.current.value = '';
        } catch (err) { alert((err.response && err.response.data && err.response.data.error) || 'Could not post'); } finally { setPosting(false); }
    };

    const createChannel = async (e) => {
        e.preventDefault();
        const fd = new FormData(); fd.append('name', channelForm.name); fd.append('description', channelForm.description);
        if (channelForm.cover) fd.append('cover', channelForm.cover);
        try {
            const res = await axios.post('/api/social/channels', fd, { headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' } });
            setChannels(p => [res.data, ...p]); setSelectedChannel(res.data); setChannelPosts([]);
            setChannelForm({ name: '', description: '', cover: null }); setShowChannelForm(false);
        } catch (err) { alert((err.response && err.response.data && err.response.data.error) || 'Could not create'); }
    };

    const toggleFollow = async (targetUserId) => {
        if (targetUserId === user.id) return;
        try {
            const res = await axios.post('/api/users/' + targetUserId + '/follow', {}, { headers: authHeaders(token) });
            const patch = p => p.user.id === targetUserId ? { ...p, user: { ...p.user, isFollowing: res.data.isFollowing } } : p;
            setPosts(p => p.map(patch)); setChannelPosts(p => p.map(patch));
        } catch { }
    };
    const requestSubscribe = async (channelId) => {
        try { const res = await axios.post('/api/social/channels/' + channelId + '/subscribe', {}, { headers: authHeaders(token) }); setChannels(p => p.map(ch => ch.id === channelId ? { ...ch, role: res.data.role } : ch)); if (selectedChannel && selectedChannel.id === channelId) setSelectedChannel(p => ({ ...p, role: res.data.role })); } catch { }
    };
    const reviewRequest = async (membershipId, action) => {
        try { const res = await axios.post('/api/social/channels/' + selectedChannel.id + '/members/' + membershipId, { action }, { headers: authHeaders(token) }); setSelectedChannel(res.data); setChannels(p => p.map(ch => ch.id === res.data.id ? res.data : ch)); } catch { }
    };
    const likePost = async (postId, isChannelPost) => {
        try { const res = await axios.post('/api/social/posts/' + postId + '/like', {}, { headers: authHeaders(token) }); const patch = p => p.id === postId ? { ...p, isLiked: res.data.isLiked, likesCount: res.data.likesCount } : p; isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch)); } catch { }
    };
    const retweetPost = async (postId, isChannelPost) => {
        try { const res = await axios.post('/api/social/posts/' + postId + '/retweet', {}, { headers: authHeaders(token) }); const patch = p => p.id === postId ? { ...p, isRetweeted: res.data.isRetweeted, retweetCount: res.data.retweetCount } : p; isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch)); if (!isChannelPost) fetchPosts(activeTab); } catch { }
    };
    const sharePost = async (postId, isChannelPost) => {
        const postUrl = window.location.origin + '/?post=' + postId;
        try { await axios.post('/api/social/posts/' + postId + '/share', {}, { headers: authHeaders(token) }); } catch { }
        const patch = p => p.id === postId ? { ...p, shareCount: (p.shareCount || 0) + 1 } : p;
        isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch));
        if (navigator.share) { try { await navigator.share({ url: postUrl }); } catch { } } else { navigator.clipboard && navigator.clipboard.writeText(postUrl); }
    };
    const deletePost = async (postId, isChannelPost) => {
        if (!window.confirm('Delete this post?')) return;
        try { await axios.delete('/api/social/posts/' + postId, { headers: authHeaders(token) }); isChannelPost ? setChannelPosts(p => p.filter(x => x.id !== postId)) : setPosts(p => p.filter(x => x.id !== postId)); } catch { alert('Delete failed'); }
    };

    const openProfile = (userId) => setProfileView({ userId });

    if (profileView) return (
        <UserProfileView userId={profileView.userId} currentUser={user} token={token} updateUser={updateUser}
            onBack={() => setProfileView(null)} onOpenProfile={openProfile}
            onLike={likePost} onRetweet={retweetPost} onShare={sharePost} onDelete={deletePost} onFollow={toggleFollow} />
    );

    const TABS = [{ key: 'for-you', label: 'For You' }, { key: 'following', label: 'Following' }, { key: 'channels', label: 'Spaces' }];
    const currentPosts = selectedChannel ? channelPosts : posts;

    const SX = {
        root: { height: '100dvh', width: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: '#e7e9ea', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif' },
        body: { display: 'flex', flex: 1, overflow: 'hidden' },
        leftSidebar: { display: 'flex', flexDirection: 'column', width: 240, flexShrink: 0, padding: '16px 12px', borderRight: '1px solid #2f3336', height: '100%', overflowY: 'auto' },
        main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #2f3336' },
        rightSidebar: { width: 320, flexShrink: 0, padding: 16, height: '100%', overflowY: 'auto' },
    };

    return (
        <div style={SX.root}>
            {/* Mobile header */}
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #2f3336', flexShrink: 0 }} className="sm-hide">
                <button onClick={() => setProfileView({ userId: user.id })} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <img src={user && user.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                </button>
                <XLogo style={{ width: 32, height: 32, color: '#fff' }} />
                <button onClick={() => {}} style={{ padding: 8, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea' }}>
                    <MagnifyingGlassIcon style={{ width: 20, height: 20 }} />
                </button>
            </header>

            <div style={SX.body}>
                {/* LEFT SIDEBAR */}
                <aside style={SX.leftSidebar}>
                    <div style={{ padding: '4px 12px', marginBottom: 8 }}>
                        <XLogo style={{ width: 36, height: 36, color: '#fff' }} />
                    </div>
                    {[
                        { icon: <HomeIcon style={{ width: 28, height: 28 }} />, label: 'Home', action: () => { setSelectedChannel(null); setActiveTab('for-you'); } },
                        { icon: <HashtagIcon style={{ width: 28, height: 28 }} />, label: 'Explore', action: () => {} },
                        { icon: <BellIcon style={{ width: 28, height: 28 }} />, label: 'Notifications', action: () => {} },
                        { icon: <UsersIcon style={{ width: 28, height: 28 }} />, label: 'Spaces', action: () => { setSelectedChannel(null); setActiveTab('channels'); } },
                        { icon: <UserCircleIcon style={{ width: 28, height: 28 }} />, label: 'Profile', action: () => setProfileView({ userId: user.id }) },
                        { icon: <ArrowLeftIcon style={{ width: 28, height: 28 }} />, label: 'Back', action: onBack },
                    ].map(({ icon, label, action }) => (
                        <button key={label} onClick={action}
                            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px', borderRadius: 9999, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea', fontSize: 20, fontWeight: 400, marginBottom: 4 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {icon}<span style={{ fontSize: 18 }}>{label}</span>
                        </button>
                    ))}
                    <button
                        style={{ width: '100%', padding: '14px', borderRadius: 9999, fontWeight: 700, fontSize: 17, background: '#1d9bf0', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1a8cd8'}
                        onMouseLeave={e => e.currentTarget.style.background = '#1d9bf0'}
                        onClick={() => { setSelectedChannel(null); setActiveTab('for-you'); }}>
                        Post
                    </button>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setProfileView({ userId: user.id })}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <img src={user && user.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                            <p style={{ fontWeight: 700, fontSize: 14, color: '#e7e9ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user && user.username}</p>
                            <p style={{ fontSize: 14, color: '#71767b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{user && (user.username || '').toLowerCase().replace(/\s+/g, '_')}</p>
                        </div>
                        <EllipsisHorizontalIcon style={{ width: 20, height: 20, color: '#71767b', flexShrink: 0 }} />
                    </button>
                </aside>

                {/* MAIN */}
                <main style={SX.main}>
                    {/* Tab bar / header */}
                    <div style={{ flexShrink: 0 }}>
                        {!selectedChannel ? (
                            <div style={{ display: 'flex', borderBottom: '1px solid #2f3336' }}>
                                {TABS.map(({ key, label }) => (
                                    <button key={key} onClick={() => setActiveTab(key)}
                                        style={{ flex: 1, padding: '16px 0', fontSize: 15, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: activeTab === key ? '#e7e9ea' : '#71767b', position: 'relative' }}>
                                        {label}
                                        {activeTab === key && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', height: 4, width: 56, borderRadius: 9999, background: '#1d9bf0' }} />}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #2f3336' }}>
                                <button onClick={() => setSelectedChannel(null)} style={{ padding: 8, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <ArrowLeftIcon style={{ width: 20, height: 20 }} />
                                </button>
                                <div>
                                    <h1 style={{ fontWeight: 800, fontSize: 20 }}>{selectedChannel.name}</h1>
                                    <p style={{ fontSize: 13, color: '#71767b' }}>{selectedChannel.subscriberCount} members</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {selectedChannel ? (
                            <ChannelView channel={selectedChannel} posts={currentPosts} user={user} preview={preview} media={media} caption={caption} posting={posting} fileRef={fileRef} setCaption={setCaption} setMedia={setMedia}
                                submitPost={() => submitPost(selectedChannel.id)} likePost={id => likePost(id, true)} retweetPost={id => retweetPost(id, true)} sharePost={id => sharePost(id, true)} deletePost={id => deletePost(id, true)}
                                toggleFollow={toggleFollow} requestSubscribe={() => requestSubscribe(selectedChannel.id)} reviewRequest={reviewRequest} openProfile={openProfile} currentUser={user} />
                        ) : activeTab === 'channels' ? (
                            <ChannelsList channels={channels} loading={loading} onOpen={fetchChannel} onSubscribe={requestSubscribe} onCreateNew={() => setShowChannelForm(true)} />
                        ) : (
                            <div>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f3336' }}>
                                    <XComposer avatar={user && user.avatar} caption={caption} setCaption={setCaption} media={media} setMedia={setMedia} preview={preview} fileRef={fileRef} posting={posting} onSubmit={() => submitPost(null)} />
                                </div>
                                {loading ? <XLoading /> : currentPosts.length ? currentPosts.map(post => (
                                    <div key={post.id} ref={post.id === highlightedPostId ? highlightedRef : null} style={post.id === highlightedPostId ? { outline: '2px solid #1d9bf0' } : {}}>
                                        <TweetCard post={post} currentUser={user} token={token}
                                            onLike={() => likePost(post.id)} onRetweet={() => retweetPost(post.id)}
                                            onShare={() => sharePost(post.id)} onDelete={() => deletePost(post.id)}
                                            onFollow={() => toggleFollow(post.user.id)} onOpenProfile={openProfile} />
                                    </div>
                                )) : <XEmptyState text={activeTab === 'following' ? 'Follow people to build your feed.' : 'No posts yet. Be the first!'} />}
                            </div>
                        )}
                    </div>

                    {/* Mobile bottom nav */}
                    <nav style={{ display: 'flex', borderTop: '1px solid #2f3336', flexShrink: 0, background: '#000' }}>
                        {[
                            { icon: <HomeIcon style={{ width: 24, height: 24 }} />, action: () => { setSelectedChannel(null); setActiveTab('for-you'); } },
                            { icon: <MagnifyingGlassIcon style={{ width: 24, height: 24 }} />, action: () => {} },
                            { icon: <UsersIcon style={{ width: 24, height: 24 }} />, action: () => { setSelectedChannel(null); setActiveTab('channels'); } },
                            { icon: user && user.avatar ? <img src={user.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} /> : <UserCircleIcon style={{ width: 24, height: 24 }} />, action: () => setProfileView({ userId: user.id }) },
                        ].map((btn, i) => (
                            <button key={i} onClick={btn.action} style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea' }}>
                                {btn.icon}
                            </button>
                        ))}
                    </nav>
                </main>

                {/* RIGHT SIDEBAR */}
                <aside style={SX.rightSidebar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 9999, background: '#202327', marginBottom: 16 }}>
                        <MagnifyingGlassIcon style={{ width: 20, height: 20, color: '#71767b', flexShrink: 0 }} />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search"
                            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: '#e7e9ea', flex: 1 }} />
                    </div>

                    <div style={{ borderRadius: 16, background: '#16181c', marginBottom: 16, overflow: 'hidden' }}>
                        <h2 style={{ padding: '12px 16px', fontWeight: 800, fontSize: 20 }}>Trends for you</h2>
                        {TRENDING.map((t, i) => (
                            <button key={i} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid #2f3336' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <p style={{ fontSize: 12, color: '#71767b' }}>{t.category} · Trending</p>
                                <p style={{ fontWeight: 700, fontSize: 15, color: '#e7e9ea', margin: '2px 0' }}>{t.tag}</p>
                                <p style={{ fontSize: 13, color: '#71767b' }}>{t.posts} posts</p>
                            </button>
                        ))}
                    </div>

                    <WhoToFollow token={token} currentUser={user} onOpenProfile={openProfile} onFollow={toggleFollow} />
                </aside>
            </div>

            {/* Floating compose (mobile) */}
            <button onClick={() => { setSelectedChannel(null); setActiveTab('for-you'); }}
                style={{ position: 'fixed', bottom: 80, right: 16, width: 56, height: 56, borderRadius: '50%', background: '#1d9bf0', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(29,155,240,0.5)', zIndex: 40 }}>
                <PlusIcon style={{ width: 28, height: 28 }} />
            </button>

            {/* Channel modal */}
            {showChannelForm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                    <form onSubmit={createChannel} style={{ width: '100%', maxWidth: 480, background: '#000', border: '1px solid #2f3336', borderRadius: 16, padding: 24, boxShadow: '0 16px 64px rgba(0,0,0,0.8)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h2 style={{ fontWeight: 800, fontSize: 20 }}>Create a Space</h2>
                            <button type="button" onClick={() => setShowChannelForm(false)} style={{ padding: 8, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e7e9ea' }}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
                        </div>
                        <input value={channelForm.name} onChange={e => setChannelForm(p => ({ ...p, name: e.target.value }))} placeholder="Space name" required
                            style={{ width: '100%', borderRadius: 8, padding: '12px 16px', fontSize: 16, outline: 'none', background: '#202327', border: '1px solid #333639', color: '#e7e9ea', marginBottom: 12, boxSizing: 'border-box' }} />
                        <textarea value={channelForm.description} onChange={e => setChannelForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" rows={3}
                            style={{ width: '100%', borderRadius: 8, padding: '12px 16px', fontSize: 14, outline: 'none', background: '#202327', border: '1px solid #333639', color: '#e7e9ea', resize: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
                        <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setChannelForm(p => ({ ...p, cover: e.target.files && e.target.files[0] ? e.target.files[0] : null }))} />
                        <button type="button" onClick={() => coverRef.current && coverRef.current.click()}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 8, background: 'transparent', border: '1px solid #2f3336', cursor: 'pointer', color: '#e7e9ea', fontSize: 14, marginBottom: 12 }}>
                            <PhotoIcon style={{ width: 20, height: 20 }} />{channelForm.cover ? channelForm.cover.name : 'Add cover photo'}
                        </button>
                        <button style={{ width: '100%', padding: '12px', borderRadius: 9999, fontWeight: 700, fontSize: 16, background: '#1d9bf0', color: '#fff', border: 'none', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#1a8cd8'}
                            onMouseLeave={e => e.currentTarget.style.background = '#1d9bf0'}>
                            Create Space
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Social;
