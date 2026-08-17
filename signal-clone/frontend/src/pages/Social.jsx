import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    ArrowLeftIcon, PhotoIcon, HeartIcon, ChatBubbleOvalLeftIcon,
    PlusIcon, UserPlusIcon, CheckIcon, XMarkIcon,
    TrashIcon, UsersIcon, ArrowPathRoundedSquareIcon, ShareIcon,
    PencilIcon, LinkIcon, CalendarIcon, ArrowUpTrayIcon, UserCircleIcon,
    EllipsisHorizontalIcon, MagnifyingGlassIcon, BookmarkIcon,
    HomeIcon, SparklesIcon, ChartBarIcon, CameraIcon
} from '@heroicons/react/24/outline';
import {
    HeartIcon as HeartSolidIcon,
    ArrowPathRoundedSquareIcon as RetweetSolidIcon,
    BookmarkIcon as BookmarkSolidIcon
} from '@heroicons/react/24/solid';
import FullscreenMediaModal from '../components/FullscreenMediaModal';
import NestedComment from '../components/NestedComment';
import { getSafeWebsiteUrl } from '../utils/safeUrl';
import SocialShareSheet from '../components/SocialShareSheet';
import ProCameraStudio from '../components/ProCameraStudio';
import QRCode from 'qrcode';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const newPaymentRequestId = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector('script[data-cheetchat-razorpay]');
    if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; script.dataset.cheetchatRazorpay = '1';
    script.onload = resolve; script.onerror = () => reject(new Error('Premium checkout failed to load')); document.head.appendChild(script);
});

const VerifiedBadge = ({ premium }) => premium ? <span title="Premium verified" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#1d9bf0] text-[10px] font-black text-white">✓</span> : null;

const CheetChatLogo = ({ className, style, hideTextOnMobile = true }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }} className={className}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-8 h-8 text-[#1d9bf0] flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 18.97a5.969 5.969 0 01-.774-2.814c0-.19.054-.379.161-.541A7.994 7.994 0 014.5 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
        <span className={`${hideTextOnMobile ? 'hidden xl:inline' : 'inline'} font-black tracking-wider text-xl bg-gradient-to-r from-blue-400 to-[#1d9bf0] bg-clip-text text-transparent`} style={{ fontFamily: 'system-ui, sans-serif' }}>
            CHEETCHAT
        </span>
    </div>
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

const FeedVideo = ({ src, multi, muted, autoplay, onOpen }) => {
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const [nearViewport, setNearViewport] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const preloadObserver = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) setNearViewport(true);
        }, { threshold: 0.01, rootMargin: '500px 0px' });
        const playbackObserver = new IntersectionObserver(([entry]) => {
            setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.55);
        }, { threshold: [0, 0.55] });
        if (containerRef.current) {
            preloadObserver.observe(containerRef.current);
            playbackObserver.observe(containerRef.current);
        }
        return () => {
            preloadObserver.disconnect();
            playbackObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (autoplay && visible) video.play().catch(() => {});
        else video.pause();
    }, [autoplay, visible, nearViewport]);

    return (
        <div ref={containerRef} style={{ position: 'relative', cursor: 'pointer' }} onClick={onOpen}>
            <video
                ref={videoRef}
                src={nearViewport ? src : undefined}
                style={{ width: '100%', height: multi ? 255 : 'auto', maxHeight: 500, objectFit: 'contain', background: '#000', display: 'block' }}
                preload={nearViewport ? 'metadata' : 'none'}
                muted={muted}
                loop={autoplay}
                controls
                playsInline
            />
            {!visible && <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(15,20,25,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="white" style={{ width: 28, height: 28, marginLeft: 4 }}><path d="M8 5v14l11-7z" /></svg>
                </div>
            </div>}
        </div>
    );
};

const TRENDING = [
    { tag: '#ChietChat', posts: '12.4K', category: 'Technology' },
    { tag: '#WebRTC', posts: '8.1K', category: 'Technology' },
    { tag: '#ReactJS', posts: '45.2K', category: 'Programming' },
    { tag: '#OpenSource', posts: '22.7K', category: 'Technology' },
    { tag: '#DevLife', posts: '18.9K', category: 'Trending' },
];

const CheetChatLoading = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ width: 32, height: 32, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#1d9bf0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

const CheetChatEmptyState = ({ text }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <CheetChatLogo hideTextOnMobile={false} style={{ marginBottom: 16, transform: 'scale(1.2)' }} />
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

const CheetChatComposer = ({ avatar, caption, setCaption, media, setMedia, preview, fileRef, posting, onSubmit, isPremium, onUpgrade }) => {
    const [articleMode, setArticleMode] = useState(false);
    const [articleTitle, setArticleTitle] = useState('');
    const [monetized, setMonetized] = useState(false);
    const [showProCamera, setShowProCamera] = useState(false);
    const maxChars = articleMode && isPremium ? 10000 : 280;
    const remaining = maxChars - caption.length;
    const progress = Math.min((caption.length / maxChars) * 100, 100);
    const isOverLimit = remaining < 0;
    const canPost = (caption.trim() || media.length > 0) && !isOverLimit;
    const circumference = 2 * Math.PI * 9;
    const dashOffset = circumference - (progress / 100) * circumference;

    return (
        <div style={{ display: 'flex', gap: 12 }}>
            <img src={avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                {articleMode && <input value={articleTitle} onChange={e => setArticleTitle(e.target.value.slice(0, 200))} placeholder="Article title" className="mb-2 w-full border-0 border-b border-white/10 bg-transparent pb-2 text-xl font-black text-white outline-none" />}
                <textarea
                    id="tweet-composer"
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    placeholder="What's happening?!"
                    rows={caption ? Math.max(3, Math.ceil(caption.length / 50)) : 2}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 20, color: '#e7e9ea', lineHeight: 1.6, fontFamily: 'inherit' }}
                />
                {preview.length > 0 && (
                    <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl border border-[#2f3336] ${preview.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {preview.map((src, index) => <div key={src} className="relative min-h-32 bg-black">
                            {media[index]?.type.startsWith('video/') ? <video src={src} controls className="h-full max-h-72 w-full object-contain" /> : <img src={src} alt={`Selected ${index + 1}`} className="h-full max-h-72 w-full object-cover" />}
                            <button type="button" onClick={() => { setMedia(items => items.filter((_, itemIndex) => itemIndex !== index)); if (fileRef.current) fileRef.current.value = ''; }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><XMarkIcon className="h-4 w-4" /></button>
                            {preview.length > 1 && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">{index + 1}/{preview.length}</span>}
                        </div>)}
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #2f3336' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => {
                            const selected = Array.from(e.target.files || []);
                            if (selected.length > 4) { alert('You can select up to four photos in one post.'); e.target.value = ''; return; }
                            if (selected.length > 1 && selected.some(file => !file.type.startsWith('image/'))) { alert('Multiple selection supports photos only. Upload a video separately.'); e.target.value = ''; return; }
                            setMedia(selected);
                        }} />
                        <button onClick={() => fileRef.current && fileRef.current.click()} title="Photo/Video"
                            style={{ padding: 8, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1d9bf0' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(29,155,240,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <PhotoIcon style={{ width: 20, height: 20 }} />
                        </button>
                        <button type="button" onClick={() => setShowProCamera(true)} title="Pro Camera" className="rounded-full p-2 text-[#1d9bf0] hover:bg-blue-500/10">
                            <CameraIcon className="h-5 w-5" />
                        </button>
                        <button type="button" onClick={() => isPremium ? setArticleMode(v => !v) : alert('Articles are available with Premium')} className={`rounded-full px-3 py-2 text-xs font-bold ${articleMode ? 'bg-blue-500/20 text-blue-400' : 'text-[#1d9bf0]'}`}>Article</button>
                        <button type="button" onClick={() => isPremium ? setMonetized(v => !v) : alert('Paid posts are available with Premium')} className={`rounded-full px-3 py-2 text-xs font-bold ${monetized ? 'bg-amber-500/20 text-amber-300' : 'text-[#1d9bf0]'}`}>₹ Earn</button>
                        {!isPremium && <button type="button" onClick={onUpgrade} className="rounded-full bg-violet-500/15 px-3 py-2 text-xs font-black text-violet-300">Premium</button>}
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
                        <button onClick={() => onSubmit({ postKind: articleMode ? 'article' : 'standard', articleTitle, isMonetized: monetized })} disabled={posting || !canPost || (articleMode && !articleTitle.trim())}
                            style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, border: 'none', cursor: canPost ? 'pointer' : 'not-allowed', background: canPost ? '#1d9bf0' : '#0f4f6e', color: canPost ? '#fff' : '#71767b', transition: 'background 0.15s' }}>
                            {posting ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
                {showProCamera && <ProCameraStudio onClose={() => setShowProCamera(false)} onCapture={file => setMedia([file])} />}
            </div>
        </div>
    );
};

const CommunityComposer = ({ avatar, caption, setCaption, pollOptions, setPollOptions, posting, onSubmit }) => {
    const [pollOpen, setPollOpen] = useState(false);
    const updateOption = (index, value) => setPollOptions(items => items.map((item, i) => i === index ? value : item));
    const validOptions = pollOptions.filter(item => item.trim()).length;
    return <div className="border-b border-[#2f3336] bg-gradient-to-b from-[#0b1721] to-black px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1d9bf0]"><UsersIcon className="h-5 w-5" />Create a community post</div>
        <div className="flex gap-3"><img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover" /><div className="min-w-0 flex-1">
            <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0, 1000))} rows={3} placeholder="Share an update with your community…" className="w-full resize-none bg-transparent text-lg text-white outline-none placeholder:text-[#71767b]" />
            {pollOpen && <div className="mt-3 space-y-2 rounded-2xl border border-[#2f3336] bg-[#101820] p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#71767b]">Poll options</p>
                {pollOptions.map((option, index) => <div key={index} className="flex gap-2"><input value={option} onChange={e => updateOption(index, e.target.value.slice(0, 100))} placeholder={`Option ${index + 1}`} className="flex-1 rounded-xl border border-[#333639] bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#1d9bf0]" />{index > 1 && <button onClick={() => setPollOptions(items => items.filter((_, i) => i !== index))} className="text-[#71767b] hover:text-red-400"><XMarkIcon className="h-5 w-5" /></button>}</div>)}
                {pollOptions.length < 4 && <button onClick={() => setPollOptions(items => [...items, ''])} className="text-sm font-semibold text-[#1d9bf0]">+ Add option</button>}
            </div>}
            <div className="mt-3 flex items-center justify-between border-t border-[#2f3336] pt-3"><button onClick={() => { setPollOpen(v => !v); if (pollOpen) setPollOptions(['', '']); }} className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ${pollOpen ? 'bg-[#1d9bf0]/15 text-[#1d9bf0]' : 'text-[#71767b] hover:bg-white/5'}`}><ChartBarIcon className="h-5 w-5" />Poll</button><button onClick={onSubmit} disabled={posting || !caption.trim() || (pollOpen && validOptions < 2)} className="rounded-full bg-[#1d9bf0] px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{posting ? 'Publishing…' : 'Publish'}</button></div>
        </div></div>
    </div>;
};

const TweetCard = ({ post, currentUser, token, onLike, onRetweet, onShare, onShareToChat, onDelete, onFollow, onOpenProfile, onPollVote }) => {
    const autoplayVideos = currentUser?.uiPreferences?.socialAutoplayVideos ?? localStorage.getItem('social_autoplay_videos') === '1';
    const mutedVideos = currentUser?.uiPreferences?.socialMutedVideos ?? localStorage.getItem('social_muted_videos') !== '0';
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showRetweetMenu, setShowRetweetMenu] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [zoomedMedia, setZoomedMedia] = useState(null);
    const [bookmarked, setBookmarked] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const menuRef = useRef(null);
    const rtMenuRef = useRef(null);
    const displayPost = post.isRetweet && post.originalPost ? post.originalPost : post;
    const reportPost = async () => {
        const reason = window.prompt('Report reason', 'Adult or inappropriate photo/video');
        if (!reason) return;
        try {
            const { data } = await axios.post(`/api/social/posts/${displayPost.id}/report`, { reason }, { headers: authHeaders(token) });
            alert(data.message || 'Report submitted');
        } catch (error) { alert(error.response?.data?.error || 'Could not submit report'); }
        setShowMenu(false);
    };

    const fetchComments = async () => {
        try { const res = await axios.get('/api/social/posts/' + post.id + '/comments'); setComments(res.data); } catch { }
    };
    const submitComment = async (e) => {
        e.preventDefault();
        if (!comment.trim()) return;
        setSubmitting(true);
        try {
            await axios.post('/api/social/posts/' + post.id + '/comments', { content: comment }, { headers: authHeaders(token) });
            setComment(''); fetchComments();
        } catch { } finally { setSubmitting(false); }
    };
    const handleReplyToComment = async (commentId, content) => {
        try { await axios.post('/api/social/comments/' + commentId + '/replies', { content }, { headers: authHeaders(token) }); fetchComments(); } catch { }
    };
    const handleDeleteComment = async (commentId) => {
        if (!window.confirm('Delete this comment?')) return;
        try { await axios.delete('/api/social/comments/' + commentId, { headers: authHeaders(token) }); fetchComments(); } catch { }
    };
    const handleEditComment = async (commentId, content) => {
        try {
            await axios.patch('/api/social/comments/' + commentId, { content }, { headers: authHeaders(token) });
            await fetchComments();
        } catch (error) {
            alert(error.response?.data?.error || 'Could not edit comment');
            throw error;
        }
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
    const postMediaItems = displayPost.mediaItems?.length ? displayPost.mediaItems : (postMedia ? [{ url: postMedia, type: postMediaType }] : []);
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
                        <button onClick={() => onOpenProfile(authorId)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e7e9ea', fontWeight: 700, fontSize: 14 }}>{authorName}</button><VerifiedBadge premium={displayPost.user?.isVerified} />
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
                                {authorId !== currentUser?.id && postMediaItems.length > 0 && (
                                    <button onClick={reportPost} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f4212e', fontSize: 14, fontWeight: 700, textAlign: 'left' }}>
                                        <span aria-hidden="true">⚑</span> Report photo/video
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

                {displayPost.articleTitle && <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4"><span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Premium article</span><h2 className="mt-1 text-xl font-black text-white">{displayPost.articleTitle}</h2></div>}
                {displayPost.isMonetized && <span className="mt-2 inline-flex rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-bold text-amber-300">Creator earnings enabled</span>}
                {postCaption && <p data-user-content style={{ marginTop: 4, fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e7e9ea' }}>{postCaption}</p>}
                {authorId === currentUser?.id && currentUser?.isPremium && <button onClick={async e => { e.stopPropagation(); try { const { data } = await axios.get(`/api/social/posts/${post.id}/analytics`, { headers: authHeaders(token) }); alert(`Views: ${data.views}\nEngagement: ${data.engagement}\nEarnings: ₹${(data.earningsPaise / 100).toFixed(2)}`); } catch (err) { alert(err.response?.data?.error || 'Analytics unavailable'); } }} className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-blue-400"><ChartBarIcon className="h-4 w-4" />Advanced analytics</button>}

                {displayPost.poll && <div className="mt-3 space-y-2 rounded-2xl border border-[#2f3336] bg-[#0b1117] p-3">
                    {displayPost.poll.options.map((option, index) => { const count = displayPost.poll.counts[index] || 0; const pct = displayPost.poll.totalVotes ? Math.round(count * 100 / displayPost.poll.totalVotes) : 0; const selected = displayPost.poll.selectedOption === index; return <button key={index} onClick={() => onPollVote?.(index)} className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${selected ? 'border-[#1d9bf0] text-white' : 'border-[#333639] text-[#e7e9ea]'}`}><span className="absolute inset-y-0 left-0 bg-[#1d9bf0]/20 transition-all" style={{ width: `${pct}%` }} /><span className="relative flex justify-between gap-3"><span>{option}</span><span className="text-[#8b98a5]">{pct}%</span></span></button>; })}
                    <p className="px-1 text-xs text-[#71767b]">{displayPost.poll.totalVotes} vote{displayPost.poll.totalVotes === 1 ? '' : 's'} · vote can be changed</p>
                </div>}

                {postMediaItems.length > 0 && (
                    <div className={`mt-3 grid max-h-[520px] gap-0.5 overflow-hidden rounded-2xl border border-[#2f3336] ${postMediaItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {postMediaItems.map((item, index) => item.type === 'video' ? (
                            <FeedVideo key={`${item.url}-${index}`} src={item.url} multi={postMediaItems.length > 1} muted={mutedVideos} autoplay={autoplayVideos} onOpen={() => setZoomedMedia({ src: item.url, type: 'video' })} />
                        ) : (
                            <img key={`${item.url}-${index}`} src={item.url} alt={`Post media ${index + 1}`} style={{ width: '100%', height: postMediaItems.length > 1 ? 255 : 'auto', maxHeight: 500, objectFit: 'cover', cursor: 'pointer', display: 'block' }} onClick={() => setZoomedMedia({ src: item.url, type: 'image' })} />
                        ))}
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
                    <TweetAction icon={<ShareIcon style={{ width: 20, height: 20 }} />} count={post.shareCount} onClick={() => setShowShare(true)} hoverColor="#1d9bf0" hoverBg="rgba(29,155,240,0.1)" />
                </div>

                {commentsOpen && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #2f3336', paddingTop: 12 }}>
                        {comments.length === 0 && <p style={{ fontSize: 14, textAlign: 'center', padding: '12px 0', color: '#71767b' }}>No replies yet.</p>}
                        {comments.map(item => (
                            <NestedComment key={item.id} comment={item} onReply={handleReplyToComment} onEdit={handleEditComment} onDelete={handleDeleteComment} currentUser={currentUser} onProfileClick={onOpenProfile} />
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
            {showShare && <SocialShareSheet post={post} token={token} onClose={() => setShowShare(false)} onShareToChat={onShareToChat} onShared={onShare} />}
        </article>
    );
};

const WhoToFollow = ({ token, onOpenProfile, onFollow }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [busyIds, setBusyIds] = useState({});
    useEffect(() => {
        if (!token) return;
        axios.get('/api/users/suggestions?limit=5', { headers: authHeaders(token) })
            .then(res => setSuggestions(res.data))
            .catch(() => {});
    }, [token]);
    if (!suggestions.length) return null;
    return (
        <div style={{ borderRadius: 16, overflow: 'hidden', background: '#16181c' }}>
            <h2 style={{ padding: '12px 16px', fontWeight: 800, fontSize: 20 }}>Who to follow</h2>
            <div style={{ maxHeight: 300, overflowY: 'auto', overscrollBehavior: 'contain' }}>{suggestions.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid #2f3336' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <button onClick={() => onOpenProfile(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>
                        <img src={u.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    </button>
                    <button onClick={() => onOpenProfile(u.id)} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#e7e9ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</p>
                        <p style={{ fontSize: 14, color: '#71767b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{u.platformId || (u.username || '').toLowerCase().replace(/\s+/g, '_')}</p>
                        <p style={{ fontSize: 11, color: '#536471' }}>{u.suggestionReason}</p>
                    </button>
                    <button disabled={busyIds[u.id]} onClick={async () => {
                        setBusyIds(x => ({ ...x, [u.id]: true }));
                        const result = await onFollow(u.id);
                        if (result?.isFollowing) setSuggestions(list => list.filter(x => x.id !== u.id));
                        setBusyIds(x => ({ ...x, [u.id]: false }));
                    }}
                        style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: '#e7e9ea', color: '#0f1419', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                        {busyIds[u.id] ? '…' : 'Follow'}
                    </button>
                </div>
            ))}</div>
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
        {loading ? <CheetChatLoading /> : channels.length ? channels.map(ch => (
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
        )) : <CheetChatEmptyState text="No spaces yet. Create one!" />}
    </div>
);

const ChannelView = ({ channel, posts, user, token, preview, media, caption, posting, fileRef, setCaption, setMedia, submitPost, likePost, retweetPost, sharePost, onShareToChat, deletePost, toggleFollow, requestSubscribe, reviewRequest, openProfile, currentUser, onUpgrade }) => (
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
                <CheetChatComposer avatar={user && user.avatar} caption={caption} setCaption={setCaption} media={media} setMedia={setMedia} preview={preview} fileRef={fileRef} posting={posting} onSubmit={submitPost} isPremium={user?.isPremium} onUpgrade={onUpgrade} />
            </div>
        )}
        {posts.length ? posts.map(post => (
            <TweetCard key={post.id} post={post} currentUser={currentUser || user} token={token}
                onLike={() => likePost(post.id)} onRetweet={() => retweetPost(post.id)}
                onShare={count => sharePost(post.id, count)} onShareToChat={onShareToChat} onDelete={() => deletePost(post.id)}
                onFollow={() => toggleFollow(post.user.id)} onOpenProfile={openProfile} />
        )) : <CheetChatEmptyState text={channel.canPost ? 'No posts yet.' : 'Join this space to see content.'} />}
    </div>
);

const UserProfileView = ({ userId, currentUser, token, updateUser, onBack, onOpenProfile, onShareToChat, onDirectMessage }) => {
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ username: '', bio: '', websiteUrl: '' });
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [zoomedAvatar, setZoomedAvatar] = useState(false);
    const [profileTab, setProfileTab] = useState('posts');
    const [avatarHover, setAvatarHover] = useState(false);
    const avatarInputRef = useRef(null);
    const coverInputRef = useRef(null);
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
    const uploadCover = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        setUploadingCover(true);
        const fd = new FormData(); fd.append('cover', file);
        try {
            const { data } = await axios.post('/api/user/cover', fd, { headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' } });
            setProfileData(prev => ({ ...prev, user: { ...prev.user, coverUrl: data.user.coverUrl } }));
            updateUser?.(data.user);
        } catch (error) { alert(error.response?.data?.error || 'Cover photo upload failed'); }
        finally { setUploadingCover(false); }
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
    const handleShare = (postId, shareCount) => setProfileData(prev => ({
        ...prev, posts: prev.posts.map(post => post.id === postId ? { ...post, shareCount } : post),
    }));
    const handleDelete = async (postId) => {
        if (!window.confirm('Delete this post?')) return;
        try { await axios.delete('/api/social/posts/' + postId, { headers: authHeaders(token) }); setProfileData(prev => ({ ...prev, posts: prev.posts.filter(p => p.id !== postId) })); } catch { alert('Delete failed'); }
    };

    if (loading) return <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#e7e9ea' }}><CheetChatLoading /></div>;

    const u = profileData && profileData.user;
    const safeProfileWebsite = getSafeWebsiteUrl(u?.websiteUrl);
    const filteredProfilePosts = (profileData?.posts || []).filter(post => {
        const displayPost = post.isRetweet && post.originalPost ? post.originalPost : post;
        if (profileTab === 'media') {
            return !!displayPost.mediaUrl;
        }
        if (profileTab === 'likes') {
            return !!post.isLiked;
        }
        return true;
    });

    return (
        <div className="h-[100dvh] w-full flex flex-col bg-black text-[#e7e9ea] font-sans overflow-hidden">
            <header className="flex items-center gap-4 px-4 py-2 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #2f3336' }}>
                <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition border-none bg-transparent cursor-pointer text-[#e7e9ea]">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="font-extrabold text-xl leading-tight">{u?.username}</h1>
                    <p className="text-sm" style={{ color: '#71767b' }}>{filteredProfilePosts.length} posts</p>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                <div className="h-32 sm:h-44 relative flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1d9bf0 0%, #0747a6 50%, #764ba2 100%)' }}>
                    {u?.coverUrl && <img src={u.coverUrl} alt="Profile background" className="absolute inset-0 h-full w-full object-cover" />}
                    <div className="absolute inset-0 opacity-20" style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)' }} />
                    {isOwnProfile && <><button onClick={() => coverInputRef.current?.click()} className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-2 text-xs font-bold text-white">{uploadingCover ? 'Uploading…' : 'Change background'}</button><input ref={coverInputRef} type="file" accept="image/*" hidden onChange={uploadCover} /></>}
                </div>

                <div className="px-4 pb-4">
                    <div className="flex items-start justify-between -mt-12 sm:-mt-16 mb-3">
                        <div className="relative" onMouseEnter={() => setAvatarHover(true)} onMouseLeave={() => setAvatarHover(false)}>
                            <button onClick={() => setZoomedAvatar(true)} className="block w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 bg-black" style={{ borderColor: '#000' }} aria-label="View profile photo">
                                <img src={u?.avatar} alt={u?.username} className="w-full h-full object-cover" />
                            </button>
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
                            <div style={{ marginTop: 56, display: 'flex', gap: 8 }}><button onClick={() => onDirectMessage?.(u)} className="rounded-full border border-[#536471] px-4 py-1.5 text-sm font-bold text-white">Message</button><button onClick={handleFollowToggle} style={{ padding: '6px 16px', borderRadius: 9999, fontWeight: 700, fontSize: 14, background: u && u.isFollowing ? 'transparent' : '#e7e9ea', color: u && u.isFollowing ? '#e7e9ea' : '#0f1419', border: u && u.isFollowing ? '1px solid #536471' : 'none', cursor: 'pointer' }}>
                                {u && u.isFollowing ? 'Following' : 'Follow'}
                            </button></div>
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
                            <p style={{ fontSize: 14, color: '#71767b', marginBottom: 8 }}>Unique ID: @{u?.platformId || `user_${u?.id}`}</p>
                            {u && u.bio && <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>{u.bio}</p>}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 12 }}>
                                {safeProfileWebsite && (
                                    <a href={safeProfileWebsite} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: '#1d9bf0', textDecoration: 'none' }}>
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

                {filteredProfilePosts.length ? filteredProfilePosts.map(post => (
                    <TweetCard key={post.id} post={post} currentUser={currentUser} token={token}
                        onLike={() => handleLike(post.id)} onRetweet={() => handleRetweet(post.id)}
                        onShare={count => handleShare(post.id, count)} onShareToChat={onShareToChat} onDelete={() => handleDelete(post.id)}
                        onFollow={() => {}} onOpenProfile={onOpenProfile} />
                )) : <CheetChatEmptyState text={isOwnProfile ? "You haven't posted yet." : "No posts yet."} />}
            </div>
            {zoomedAvatar && <FullscreenMediaModal src={u?.avatar} type="image" onClose={() => setZoomedAvatar(false)} />}
        </div>
    );
};

const Social = ({ onBack, deepLink, onDeepLinkConsumed, onShareToChat, onDirectMessage }) => {
    const { user, token, updateUser } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState(() => user?.uiPreferences?.socialDefaultFeed || localStorage.getItem('social_default_feed') || 'for-you');
    const [posts, setPosts] = useState([]);
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [channelPosts, setChannelPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState([]);
    const [pollOptions, setPollOptions] = useState(['', '']);
    const [preview, setPreview] = useState([]);
    const [premiumPrompt, setPremiumPrompt] = useState(false);
    const [premiumPrice, setPremiumPrice] = useState(199);
    const [premiumBuying, setPremiumBuying] = useState(false);
    const [upiQr, setUpiQr] = useState('');
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
            const feed = t === 'following' ? 'following' : t === 'community' ? 'community' : 'all';
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
        if (!media.length) { setPreview([]); return; }
        const urls = media.map(file => URL.createObjectURL(file));
        setPreview(urls);
        return () => urls.forEach(url => URL.revokeObjectURL(url));
    }, [media]);

    useEffect(() => {
        if (!premiumPrompt) return;
        const uri = `upi://pay?pa=yadavamitesh569%40oksbi&pn=CHEETCHAT%20Premium&am=${premiumPrice}&cu=INR&tn=Three%20Month%20Premium`;
        QRCode.toDataURL(uri, { width: 320, margin: 2 }).then(setUpiQr).catch(() => setUpiQr(''));
    }, [premiumPrompt, premiumPrice]);

    const submitPost = async (channelId, postKind = 'standard', premiumOptions = {}) => {
        if (typeof postKind === 'object') { premiumOptions = postKind; postKind = premiumOptions.postKind || 'standard'; }
        if (!caption.trim() && media.length === 0) return;
        setPosting(true);
        const fd = new FormData();
        fd.append('caption', caption);
        fd.append('postKind', postKind);
        if (premiumOptions.articleTitle) fd.append('articleTitle', premiumOptions.articleTitle);
        if (premiumOptions.isMonetized) fd.append('isMonetized', 'true');
        if (postKind === 'community' && pollOptions.filter(item => item.trim()).length >= 2) fd.append('pollOptions', JSON.stringify(pollOptions.filter(item => item.trim())));
        if (channelId) fd.append('channelId', channelId);
        media.forEach(file => fd.append('media', file));
        try {
            const res = await axios.post('/api/social/posts', fd, { headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' } });
            channelId ? setChannelPosts(p => [res.data, ...p]) : setPosts(p => [res.data, ...p]);
            setCaption(''); setMedia([]); setPollOptions(['', '']); if (fileRef.current) fileRef.current.value = '';
        } catch (err) {
            if (err.response?.data?.code === 'DAILY_POST_LIMIT_REACHED') {
                axios.get('/api/payments/config', { headers: authHeaders(token) }).then(({ data }) => setPremiumPrice(data.premiumPrice || 199)).catch(() => {});
                setPremiumPrompt(true);
            } else alert(err.response?.data?.error || 'Could not post');
        } finally { setPosting(false); }
    };

    const buyPremium = async () => {
        setPremiumBuying(true);
        try {
            const headers = authHeaders(token);
            const config = await axios.get('/api/payments/config', { headers });
            if (!config.data.enabled) throw new Error('Premium checkout is not configured yet.');
            const order = await axios.post('/api/premium/order', { clientRequestId: newPaymentRequestId() }, { headers });
            await loadRazorpayCheckout();
            const { payment, checkout } = order.data;
            const instance = new window.Razorpay({
                key: checkout.keyId, amount: Math.round(payment.amount * 100), currency: payment.currency,
                name: 'CHEETCHAT Premium', description: 'Unlimited Social posts', order_id: payment.providerOrderId,
                handler: async result => {
                    const verified = await axios.post(`/api/payments/orders/${payment.id}/verify`, result, { headers });
                    if (verified.data.user) updateUser(verified.data.user);
                    setPremiumPrompt(false); alert('Premium is active. You can now publish unlimited posts.');
                },
                modal: { ondismiss: () => setPremiumBuying(false) }, theme: { color: '#8b5cf6' },
            });
            instance.on('payment.failed', response => alert(response.error?.description || 'Payment failed'));
            instance.open();
        } catch (error) { alert(error.response?.data?.error || error.message || 'Premium checkout could not be opened.'); }
        finally { setPremiumBuying(false); }
    };

    const showPremiumUpgrade = () => {
        axios.get('/api/payments/config', { headers: authHeaders(token) }).then(({ data }) => setPremiumPrice(data.premiumPrice || 199)).catch(() => {});
        setPremiumPrompt(true);
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
            return res.data;
        } catch { return null; }
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
    const sharePost = (postId, isChannelPost, shareCount) => {
        const patch = p => p.id === postId ? { ...p, shareCount } : p;
        isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch));
    };
    const votePoll = async (postId, optionIndex, isChannelPost = false) => {
        try {
            const { data } = await axios.post(`/api/social/posts/${postId}/poll-vote`, { optionIndex }, { headers: authHeaders(token) });
            const patch = post => post.id === postId ? { ...post, poll: data } : post;
            isChannelPost ? setChannelPosts(items => items.map(patch)) : setPosts(items => items.map(patch));
        } catch (error) { alert(error.response?.data?.error || 'Could not record vote'); }
    };
    const deletePost = async (postId, isChannelPost) => {
        if (!window.confirm('Delete this post?')) return;
        try { await axios.delete('/api/social/posts/' + postId, { headers: authHeaders(token) }); isChannelPost ? setChannelPosts(p => p.filter(x => x.id !== postId)) : setPosts(p => p.filter(x => x.id !== postId)); } catch { alert('Delete failed'); }
    };

    const openProfile = (userId) => setProfileView({ userId });

    if (profileView) return (
        <UserProfileView userId={profileView.userId} currentUser={user} token={token} updateUser={updateUser}
            onBack={() => setProfileView(null)} onOpenProfile={openProfile} onShareToChat={onShareToChat} onDirectMessage={onDirectMessage} />
    );
    const currentPosts = selectedChannel ? channelPosts : posts;
    const TABS = [{ key: 'for-you', label: 'For You' }, { key: 'community', label: 'Community' }, { key: 'following', label: 'Following' }, { key: 'channels', label: 'Spaces' }];

    const displayedPosts = currentPosts.filter(post => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const captionMatch = post.caption?.toLowerCase().includes(q);
        const nameMatch = post.user?.username?.toLowerCase().includes(q);
        return captionMatch || nameMatch;
    });

    const displayedChannels = channels.filter(ch => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return ch.name?.toLowerCase().includes(q) || ch.description?.toLowerCase().includes(q);
    });

    return (
        <div className="h-[100dvh] w-full flex flex-col bg-black text-[#e7e9ea] font-sans antialiased overflow-hidden select-none">
            {/* Mobile Header */}
            <header className="flex md:hidden items-center justify-between px-4 py-3 border-b border-[#2f3336] flex-shrink-0 bg-black">
                <button onClick={() => setProfileView({ userId: user.id })} className="border-none bg-transparent cursor-pointer flex-shrink-0">
                    <img src={user && user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                </button>
                <CheetChatLogo hideTextOnMobile={false} />
                <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition border-none bg-transparent cursor-pointer text-[#e7e9ea]">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
            </header>

            <div className="flex flex-1 overflow-hidden w-full max-w-[1250px] mx-auto">
                {/* LEFT SIDEBAR */}
                <aside className="hidden md:flex flex-col w-[72px] xl:w-[275px] flex-shrink-0 p-2 xl:p-4 border-r border-[#2f3336] h-full justify-between overflow-y-auto scrollbar-hide">
                    <div className="flex flex-col items-center xl:items-start w-full">
                        <div className="px-3 mb-4 mt-2">
                            <CheetChatLogo hideTextOnMobile={true} />
                        </div>
                        {[
                            { icon: <HomeIcon className="w-7 h-7" />, label: 'Home', action: () => { setSelectedChannel(null); setActiveTab('for-you'); } },
                            { icon: <ChartBarIcon className="w-7 h-7" />, label: 'Community', action: () => { setSelectedChannel(null); setActiveTab('community'); } },
                            { icon: <UsersIcon className="w-7 h-7" />, label: 'Spaces', action: () => { setSelectedChannel(null); setActiveTab('channels'); } },
                            { icon: <UserCircleIcon className="w-7 h-7" />, label: 'Profile', action: () => setProfileView({ userId: user.id }) },
                            { icon: <ArrowLeftIcon className="w-7 h-7" />, label: 'Back', action: onBack },
                        ].map(({ icon, label, action }) => (
                            <button key={label} onClick={action}
                                className="flex items-center justify-center xl:justify-start gap-4 p-3 rounded-full w-full bg-transparent border-none cursor-pointer text-[#e7e9ea] hover:bg-white/10 transition-colors mb-2"
                            >
                                {icon}
                                <span className="hidden xl:inline text-lg font-medium">{label}</span>
                            </button>
                        ))}
                        <button
                            onClick={() => { setSelectedChannel(null); setActiveTab('for-you'); }}
                            className="w-12 h-12 xl:w-full xl:h-auto xl:py-3.5 rounded-full font-bold text-base flex items-center justify-center bg-[#1d9bf0] text-white hover:bg-[#1a8cd8] transition-colors mt-4 border-none cursor-pointer shadow-lg"
                        >
                            <span className="hidden xl:inline">Post</span>
                            <span className="xl:hidden"><PlusIcon className="w-6 h-6" /></span>
                        </button>
                    </div>

                    <button onClick={() => setProfileView({ userId: user.id })}
                        className="flex items-center justify-center xl:justify-start gap-3 p-2 rounded-full bg-transparent border-none cursor-pointer w-full hover:bg-white/10 transition-colors"
                    >
                        <img src={user && user.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        <div className="hidden xl:block min-w-0 flex-1 text-left">
                            <p className="font-bold text-sm text-[#e7e9ea] truncate">{user && user.username}</p>
                            <p className="text-xs text-[#71767b] truncate">@{user && (user.username || '').toLowerCase().replace(/\s+/g, '_')}</p>
                        </div>
                        <EllipsisHorizontalIcon className="hidden xl:block w-5 h-5 text-[#71767b] flex-shrink-0" />
                    </button>
                </aside>

                {/* MAIN COLUMN */}
                <main className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-[#2f3336]">
                    {/* Tab bar / header */}
                    <div className="flex-shrink-0">
                        {!selectedChannel ? (
                            <div className="flex border-b border-[#2f3336] bg-black/80 backdrop-blur-md sticky top-0 z-10">
                                {TABS.map(({ key, label }) => (
                                    <button key={key} onClick={() => setActiveTab(key)}
                                        className="flex-1 py-4 text-sm font-bold bg-transparent border-none cursor-pointer transition-colors relative"
                                        style={{ color: activeTab === key ? '#e7e9ea' : '#71767b' }}>
                                        {label}
                                        {activeTab === key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[4px] w-14 rounded-full bg-[#1d9bf0]" />}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2f3336] bg-black/80 backdrop-blur-md sticky top-0 z-10">
                                <button onClick={() => setSelectedChannel(null)} className="p-2 rounded-full bg-transparent border-none cursor-pointer text-[#e7e9ea] hover:bg-white/10 transition-colors">
                                    <ArrowLeftIcon className="w-5 h-5" />
                                </button>
                                <div>
                                    <h1 className="font-extrabold text-xl leading-tight">{selectedChannel.name}</h1>
                                    <p className="text-xs text-[#71767b]">{selectedChannel.subscriberCount} members</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Scrollable feed */}
                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                        {selectedChannel ? (
                            <ChannelView channel={selectedChannel} posts={currentPosts} user={user} token={token} preview={preview} media={media} caption={caption} posting={posting} fileRef={fileRef} setCaption={setCaption} setMedia={setMedia}
                                submitPost={() => submitPost(selectedChannel.id)} likePost={id => likePost(id, true)} retweetPost={id => retweetPost(id, true)} sharePost={(id, count) => sharePost(id, true, count)} onShareToChat={onShareToChat} deletePost={id => deletePost(id, true)}
                                toggleFollow={toggleFollow} requestSubscribe={() => requestSubscribe(selectedChannel.id)} reviewRequest={reviewRequest} openProfile={openProfile} currentUser={user} onUpgrade={showPremiumUpgrade} />
                        ) : activeTab === 'channels' ? (
                            <ChannelsList channels={displayedChannels} loading={loading} onOpen={fetchChannel} onSubscribe={requestSubscribe} onCreateNew={() => setShowChannelForm(true)} />
                        ) : (
                            <div>
                                {activeTab === 'community' ? <CommunityComposer avatar={user && user.avatar} caption={caption} setCaption={setCaption} pollOptions={pollOptions} setPollOptions={setPollOptions} posting={posting} onSubmit={() => submitPost(null, 'community')} /> : <div className="padding-4 px-4 py-3 border-b border-[#2f3336]">
                                    <CheetChatComposer avatar={user && user.avatar} caption={caption} setCaption={setCaption} media={media} setMedia={setMedia} preview={preview} fileRef={fileRef} posting={posting} isPremium={user?.isPremium} onUpgrade={showPremiumUpgrade} onSubmit={options => submitPost(null, options)} />
                                </div>}
                                {loading ? <CheetChatLoading /> : displayedPosts.length ? displayedPosts.map(post => (
                                    <div key={post.id} ref={post.id === highlightedPostId ? highlightedRef : null} style={post.id === highlightedPostId ? { outline: '2px solid #1d9bf0' } : {}}>
                                        <TweetCard post={post} currentUser={user} token={token}
                                            onLike={() => likePost(post.id)} onRetweet={() => retweetPost(post.id)}
                                            onShare={count => sharePost(post.id, false, count)} onShareToChat={onShareToChat} onDelete={() => deletePost(post.id)}
                                            onFollow={() => toggleFollow(post.user.id)} onOpenProfile={openProfile} onPollVote={index => votePoll(post.id, index)} />
                                    </div>
                                )) : <CheetChatEmptyState text={activeTab === 'following' ? 'Follow people to build your feed.' : 'No posts matches search criteria.'} />}
                            </div>
                        )}
                    </div>

                    {/* Mobile bottom nav */}
                    <nav className="flex md:hidden items-center border-t border-[#2f3336] flex-shrink-0 bg-black py-1">
                        {[
                            { icon: <HomeIcon className="w-6 h-6" />, action: () => { setSelectedChannel(null); setActiveTab('for-you'); } },
                            { icon: <ChartBarIcon className="w-6 h-6" />, action: () => { setSelectedChannel(null); setActiveTab('community'); } },
                            { icon: <UsersIcon className="w-6 h-6" />, action: () => { setSelectedChannel(null); setActiveTab('channels'); } },
                            { icon: user && user.avatar ? <img src={user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" /> : <UserCircleIcon className="w-6 h-6" />, action: () => setProfileView({ userId: user.id }) },
                        ].map((btn, i) => (
                            <button key={i} onClick={btn.action} className="flex-1 flex justify-center py-2.5 bg-transparent border-none cursor-pointer text-[#e7e9ea] hover:opacity-85">
                                {btn.icon}
                            </button>
                        ))}
                    </nav>
                </main>

                {/* RIGHT SIDEBAR */}
                <aside className="hidden lg:flex flex-col w-[290px] xl:w-[350px] flex-shrink-0 p-4 h-full overflow-y-auto space-y-4 border-[#2f3336]">
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#202327]">
                        <MagnifyingGlassIcon className="w-5 h-5 text-[#71767b] flex-shrink-0" />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search"
                            className="bg-transparent border-none outline-none text-[15px] text-[#e7e9ea] flex-1" />
                    </div>

                    <div className="rounded-2xl bg-[#16181c] overflow-hidden border border-[#2f3336]/40">
                        <h2 className="px-4 py-3 font-extrabold text-lg text-[#e7e9ea]">Trends for you</h2>
                        <div className="max-h-[330px] overflow-y-auto overscroll-contain">{TRENDING.map((t, i) => (
                            <button key={i} className="w-full px-4 py-3 bg-transparent border-none cursor-pointer text-left border-t border-[#2f3336] hover:bg-white/5 transition-colors"
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <p style={{ fontSize: 12, color: '#71767b' }}>{t.category} · Trending</p>
                                <p style={{ fontWeight: 700, fontSize: 15, color: '#e7e9ea', margin: '2px 0' }}>{t.tag}</p>
                                <p style={{ fontSize: 13, color: '#71767b' }}>{t.posts} posts</p>
                            </button>
                        ))}</div>
                    </div>

                    <WhoToFollow token={token} onOpenProfile={openProfile} onFollow={toggleFollow} />
                </aside>
            </div>

            {/* Mobile FAB */}
            <button onClick={() => { setSelectedChannel(null); setActiveTab('for-you'); }}
                className="md:hidden fixed bottom-16 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl bg-[#1d9bf0] text-white hover:bg-[#1a8cd8] transition-colors border-none cursor-pointer z-40"
            >
                <PlusIcon className="w-6 h-6" />
            </button>

            {/* Space Creation Modal */}
            {premiumPrompt && (
                <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setPremiumPrompt(false)}>
                    <div onClick={event => event.stopPropagation()} className="w-full max-w-md rounded-3xl border border-violet-400/25 bg-gradient-to-br from-[#1b1230] to-[#10131d] p-6 text-center shadow-2xl">
                        <SparklesIcon className="mx-auto h-12 w-12 text-violet-300" />
                        <h2 className="mt-3 text-2xl font-black text-white">Your three free posts are used</h2>
                        <p className="mt-2 text-sm leading-6 text-gray-300">Upgrade for unlimited posts, articles, analytics and creator tools.</p>
                        <div className="mt-5 rounded-2xl bg-white/5 p-4"><p className="text-xs font-bold uppercase tracking-wider text-violet-300">One month + two months free</p><p className="mt-1 text-3xl font-black text-white">₹{premiumPrice}</p><p className="mt-1 text-xs text-gray-400">Three months total access</p></div>
                        {upiQr && <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3"><img src={upiQr} alt="UPI payment QR code" className="h-48 w-48" /></div>}
                        <p className="mt-2 text-xs text-gray-300">Scan using any UPI app or pay to <strong className="text-white">yadavamitesh569@oksbi</strong>.</p>
                        <a href={`upi://pay?pa=yadavamitesh569%40oksbi&pn=CHEETCHAT%20Premium&am=${premiumPrice}&cu=INR&tn=Three%20Month%20Premium`} className="mt-3 block w-full rounded-xl border border-violet-400/40 py-3 text-sm font-black text-violet-200">Open UPI app</a>
                        <button disabled={premiumBuying} onClick={buyPremium} className="mt-3 w-full rounded-xl bg-violet-500 py-3.5 text-sm font-black text-white hover:bg-violet-400 disabled:opacity-60">{premiumBuying ? 'Opening secure checkout…' : 'Pay and activate securely'}</button>
                        <p className="mt-2 text-[11px] leading-4 text-gray-500">Automatic activation uses secure checkout and server signature verification. A direct transfer cannot activate Premium automatically.</p>
                        <button onClick={() => setPremiumPrompt(false)} className="mt-3 text-sm font-semibold text-gray-400">Try another free post tomorrow</button>
                    </div>
                </div>
            )}

            {showChannelForm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
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
