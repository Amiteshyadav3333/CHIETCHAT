import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    ArrowLeftIcon, PhotoIcon, HeartIcon, ChatBubbleOvalLeftIcon,
    PaperAirplaneIcon, PlusIcon, UserPlusIcon, CheckIcon, XMarkIcon,
    TrashIcon, UsersIcon, ArrowPathRoundedSquareIcon, ShareIcon,
    PencilIcon, LinkIcon, CalendarIcon, ArrowUpTrayIcon, UserCircleIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon, ArrowPathRoundedSquareIcon as RetweetSolidIcon } from '@heroicons/react/24/solid';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

// ─── MAIN SOCIAL COMPONENT ────────────────────────────────────────────────────
const Social = ({ onBack, deepLink, onDeepLinkConsumed }) => {
    const { user, token, updateUser } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState('feed');
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
    const [profileView, setProfileView] = useState(null); // { userId }
    const [highlightedPostId, setHighlightedPostId] = useState(null); // post to scroll+highlight
    const fileRef = useRef(null);
    const coverRef = useRef(null);
    const highlightedRef = useRef(null);
    const deepLinkHandled = useRef(false);

    const fetchPosts = useCallback(async (tab = activeTab) => {
        setLoading(true);
        try {
            const feed = tab === 'following' ? 'following' : 'all';
            const res = await axios.get(`/api/social/posts?feed=${feed}`, { headers: authHeaders(token) });
            setPosts(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [token, activeTab]);

    const fetchChannels = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/social/channels', { headers: authHeaders(token) });
            setChannels(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    const fetchChannel = async (channelId) => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/social/channels/${channelId}`, { headers: authHeaders(token) });
            setSelectedChannel(res.data.channel);
            setChannelPosts(res.data.posts);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!token) return;
        if (activeTab === 'channels') fetchChannels();
        else fetchPosts(activeTab);
    }, [activeTab, token]);

    // ── Handle deep link from notification click ──────────────────────────────
    useEffect(() => {
        if (!deepLink || deepLinkHandled.current) return;
        deepLinkHandled.current = true;

        if (deepLink.type === 'profile') {
            setProfileView({ userId: deepLink.id });
            if (onDeepLinkConsumed) onDeepLinkConsumed();
        } else if (deepLink.type === 'channel') {
            setActiveTab('channels');
            fetchChannel(deepLink.id);
            if (onDeepLinkConsumed) onDeepLinkConsumed();
        } else if (deepLink.type === 'post') {
            // Load feed and then highlight the post
            setActiveTab('feed');
            setSelectedChannel(null);
            fetchPosts('feed').then(() => {
                setHighlightedPostId(deepLink.id);
                if (onDeepLinkConsumed) onDeepLinkConsumed();
                // Auto-clear highlight after 4s
                setTimeout(() => setHighlightedPostId(null), 4000);
            });
        }
    }, [deepLink]);

    // ── Scroll highlighted post into view once posts load ────────────────────
    useEffect(() => {
        if (highlightedPostId && highlightedRef.current) {
            highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightedPostId, posts]);

    useEffect(() => {
        if (!media) { setPreview(null); return; }
        const url = URL.createObjectURL(media);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [media]);

    const resetComposer = () => { setCaption(''); setMedia(null); if (fileRef.current) fileRef.current.value = ''; };

    const submitPost = async (channelId = null) => {
        if (!caption.trim() && !media) return;
        setPosting(true);
        const formData = new FormData();
        formData.append('caption', caption);
        if (channelId) formData.append('channelId', channelId);
        if (media) formData.append('media', media);
        try {
            const res = await axios.post('/api/social/posts', formData, {
                headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' }
            });
            channelId ? setChannelPosts(p => [res.data, ...p]) : setPosts(p => [res.data, ...p]);
            resetComposer();
        } catch (err) {
            alert(err.response?.data?.error || 'Could not create post');
        } finally {
            setPosting(false);
        }
    };

    const createChannel = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('name', channelForm.name);
        formData.append('description', channelForm.description);
        if (channelForm.cover) formData.append('cover', channelForm.cover);
        try {
            const res = await axios.post('/api/social/channels', formData, {
                headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' }
            });
            setChannels(p => [res.data, ...p]);
            setSelectedChannel(res.data);
            setChannelPosts([]);
            setChannelForm({ name: '', description: '', cover: null });
            setShowChannelForm(false);
        } catch (err) {
            alert(err.response?.data?.error || 'Could not create channel');
        }
    };

    const toggleFollow = async (targetUserId) => {
        if (targetUserId === user.id) return;
        try {
            const res = await axios.post(`/api/users/${targetUserId}/follow`, {}, { headers: authHeaders(token) });
            const patch = (p) => p.user.id === targetUserId ? { ...p, user: { ...p.user, isFollowing: res.data.isFollowing } } : p;
            setPosts(p => p.map(patch));
            setChannelPosts(p => p.map(patch));
        } catch (err) { console.error(err); }
    };

    const requestSubscribe = async (channelId) => {
        try {
            const res = await axios.post(`/api/social/channels/${channelId}/subscribe`, {}, { headers: authHeaders(token) });
            setChannels(p => p.map(ch => ch.id === channelId ? { ...ch, role: res.data.role } : ch));
            if (selectedChannel?.id === channelId) setSelectedChannel(p => ({ ...p, role: res.data.role }));
        } catch (err) { console.error(err); }
    };

    const reviewRequest = async (membershipId, action) => {
        try {
            const res = await axios.post(
                `/api/social/channels/${selectedChannel.id}/members/${membershipId}`,
                { action }, { headers: authHeaders(token) }
            );
            setSelectedChannel(res.data);
            setChannels(p => p.map(ch => ch.id === res.data.id ? res.data : ch));
        } catch (err) { console.error(err); }
    };

    const likePost = async (postId, isChannelPost = false) => {
        try {
            const res = await axios.post(`/api/social/posts/${postId}/like`, {}, { headers: authHeaders(token) });
            const patch = p => p.id === postId ? { ...p, isLiked: res.data.isLiked, likesCount: res.data.likesCount } : p;
            isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch));
        } catch (err) { console.error(err); }
    };

    const retweetPost = async (postId, isChannelPost = false) => {
        try {
            const res = await axios.post(`/api/social/posts/${postId}/retweet`, {}, { headers: authHeaders(token) });
            const patch = p => p.id === postId ? { ...p, isRetweeted: res.data.isRetweeted, retweetCount: res.data.retweetCount } : p;
            isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch));
            if (!isChannelPost) fetchPosts(activeTab); // reload to show new retweet in feed
        } catch (err) { console.error(err); }
    };

    const sharePost = async (postId, isChannelPost = false) => {
        const postUrl = `${window.location.origin}/?post=${postId}`;
        try {
            await axios.post(`/api/social/posts/${postId}/share`, {}, { headers: authHeaders(token) });
            const patch = p => p.id === postId ? { ...p, shareCount: (p.shareCount || 0) + 1 } : p;
            isChannelPost ? setChannelPosts(p => p.map(patch)) : setPosts(p => p.map(patch));
        } catch { /* ignore share count error */ }
        if (navigator.share) {
            try { await navigator.share({ title: 'ChietChat Post', url: postUrl }); } catch { /* cancelled */ }
        } else {
            navigator.clipboard?.writeText(postUrl);
            alert('Post link copied!');
        }
    };

    const deletePost = async (postId, isChannelPost = false) => {
        if (!window.confirm('Delete this post?')) return;
        try {
            await axios.delete(`/api/social/posts/${postId}`, { headers: authHeaders(token) });
            isChannelPost ? setChannelPosts(p => p.filter(x => x.id !== postId)) : setPosts(p => p.filter(x => x.id !== postId));
        } catch { alert('Delete failed'); }
    };

    const openProfile = (userId) => setProfileView({ userId });
    const closeProfile = () => setProfileView(null);

    const currentPosts = selectedChannel ? channelPosts : posts;

    // Profile overlay takes over the screen
    if (profileView) {
        return (
            <UserProfileView
                userId={profileView.userId}
                currentUser={user}
                token={token}
                updateUser={updateUser}
                onBack={closeProfile}
                onOpenProfile={openProfile}
                onLike={likePost}
                onRetweet={retweetPost}
                onShare={sharePost}
                onDelete={deletePost}
                onFollow={toggleFollow}
            />
        );
    }

    return (
        <div className="h-[100dvh] w-full bg-[#0b0f14] text-white flex flex-col">
            {/* Header */}
            <header className="h-16 px-3 sm:px-5 border-b border-white/10 bg-[#101820] flex items-center gap-3 flex-shrink-0">
                <button onClick={selectedChannel ? () => setSelectedChannel(null) : onBack} className="p-2 rounded-full hover:bg-white/10 transition" title="Back">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="font-bold text-lg truncate">{selectedChannel ? selectedChannel.name : 'Social'}</h1>
                    <p className="text-xs text-gray-400 truncate">
                        {selectedChannel ? `${selectedChannel.subscriberCount} subscribers` : 'Posts, retweets, followers & channels'}
                    </p>
                </div>
                {/* My profile button */}
                {!selectedChannel && (
                    <button onClick={() => openProfile(user.id)} className="p-2 rounded-full hover:bg-white/10 transition" title="My Profile">
                        <UserCircleIcon className="w-6 h-6 text-signal-accent" />
                    </button>
                )}
                {!selectedChannel && (
                    <button onClick={() => setShowChannelForm(true)} className="p-2 rounded-full bg-signal-accent hover:bg-signal-accentHover transition" title="Create channel">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                )}
            </header>

            {/* Tab Nav */}
            {!selectedChannel && (
                <nav className="grid grid-cols-3 border-b border-white/10 bg-[#101820] flex-shrink-0">
                    {[['feed', 'For You'], ['following', 'Following'], ['channels', 'Channels']].map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`py-3 text-sm font-semibold transition ${activeTab === key ? 'text-white border-b-2 border-signal-accent' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
            )}

            <main className="flex-1 overflow-y-auto">
                {selectedChannel ? (
                    <ChannelView
                        channel={selectedChannel}
                        posts={currentPosts}
                        user={user}
                        preview={preview}
                        media={media}
                        caption={caption}
                        posting={posting}
                        fileRef={fileRef}
                        setCaption={setCaption}
                        setMedia={setMedia}
                        submitPost={() => submitPost(selectedChannel.id)}
                        likePost={(id) => likePost(id, true)}
                        retweetPost={(id) => retweetPost(id, true)}
                        sharePost={(id) => sharePost(id, true)}
                        deletePost={(id) => deletePost(id, true)}
                        toggleFollow={toggleFollow}
                        requestSubscribe={() => requestSubscribe(selectedChannel.id)}
                        reviewRequest={reviewRequest}
                        openProfile={openProfile}
                        currentUser={user}
                    />
                ) : activeTab === 'channels' ? (
                    <ChannelsList channels={channels} loading={loading} onOpen={fetchChannel} onSubscribe={requestSubscribe} />
                ) : (
                    <div className="max-w-2xl mx-auto w-full p-3 sm:p-5 space-y-4">
                        <Composer
                            avatar={user?.avatar}
                            caption={caption}
                            setCaption={setCaption}
                            media={media}
                            setMedia={setMedia}
                            preview={preview}
                            fileRef={fileRef}
                            posting={posting}
                            onSubmit={() => submitPost(null)}
                        />
                        {loading ? <Loading /> : currentPosts.length ? currentPosts.map(post => {
                            const isHighlighted = post.id === highlightedPostId;
                            return (
                                <div
                                    key={post.id}
                                    ref={isHighlighted ? highlightedRef : null}
                                    className={isHighlighted
                                        ? 'rounded-2xl ring-2 ring-signal-accent ring-offset-2 ring-offset-[#0b0f14] animate-pulse-once'
                                        : ''}
                                >
                                    <PostCard
                                        post={post}
                                        currentUser={user}
                                        token={token}
                                        onLike={() => likePost(post.id)}
                                        onRetweet={() => retweetPost(post.id)}
                                        onShare={() => sharePost(post.id)}
                                        onDelete={() => deletePost(post.id)}
                                        onFollow={() => toggleFollow(post.user.id)}
                                        onOpenProfile={openProfile}
                                    />
                                </div>
                            );
                        }) : (
                            <EmptyState text={activeTab === 'following' ? 'Follow users to build your feed.' : 'No posts yet. Be the first!'} />
                        )}
                    </div>
                )}
            </main>

            {/* Channel Creation Modal */}
            {showChannelForm && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <form onSubmit={createChannel} className="w-full max-w-md bg-[#111820] border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold">Create Channel</h2>
                            <button type="button" onClick={() => setShowChannelForm(false)} className="p-2 rounded-full hover:bg-white/10"><XMarkIcon className="w-5 h-5" /></button>
                        </div>
                        <input
                            value={channelForm.name}
                            onChange={e => setChannelForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Channel name"
                            className="w-full bg-signal-input rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-signal-accent"
                            required
                        />
                        <textarea
                            value={channelForm.description}
                            onChange={e => setChannelForm(p => ({ ...p, description: e.target.value }))}
                            placeholder="Description"
                            rows="3"
                            className="w-full bg-signal-input rounded-xl px-4 py-3 outline-none resize-none focus:ring-1 focus:ring-signal-accent"
                        />
                        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={e => setChannelForm(p => ({ ...p, cover: e.target.files?.[0] || null }))} />
                        <button type="button" onClick={() => coverRef.current?.click()} className="w-full flex items-center justify-center gap-2 bg-white/10 rounded-xl py-3 hover:bg-white/15 transition">
                            <PhotoIcon className="w-5 h-5" />
                            {channelForm.cover ? channelForm.cover.name : 'Choose cover image'}
                        </button>
                        <button className="w-full bg-signal-accent hover:bg-signal-accentHover rounded-xl py-3 font-bold transition">Create</button>
                    </form>
                </div>
            )}
        </div>
    );
};

// ─── COMPOSER ──────────────────────────────────────────────────────────────────
const Composer = ({ avatar, caption, setCaption, media, setMedia, preview, fileRef, posting, onSubmit }) => (
    <div className="bg-[#111820] border border-white/10 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex gap-3">
            <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-signal-accent/30" />
            <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="What's happening?"
                rows="3"
                className="flex-1 bg-transparent resize-none outline-none text-sm sm:text-base placeholder:text-gray-500"
            />
        </div>
        {preview && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black relative">
                {media?.type.startsWith('video/') ? (
                    <video src={preview} controls className="w-full max-h-96 object-contain" />
                ) : (
                    <img src={preview} alt="" className="w-full max-h-96 object-contain" />
                )}
                <button onClick={() => { setMedia(null); if (fileRef.current) fileRef.current.value = ''; }} className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80">
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => setMedia(e.target.files?.[0] || null)} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-white/10 text-signal-accent transition">
                <PhotoIcon className="w-5 h-5" />
                <span className="text-sm hidden sm:inline">{media ? 'Change' : 'Photo/Video'}</span>
            </button>
            <button
                onClick={onSubmit}
                disabled={posting || (!caption.trim() && !media)}
                className="flex items-center gap-2 bg-signal-accent disabled:bg-gray-700 disabled:text-gray-500 hover:bg-signal-accentHover rounded-full px-5 py-2 font-bold text-sm transition"
            >
                {posting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><PaperAirplaneIcon className="w-4 h-4" />Post</>}
            </button>
        </div>
    </div>
);

// ─── POST CARD ─────────────────────────────────────────────────────────────────
const PostCard = ({ post, currentUser, token, onLike, onRetweet, onShare, onDelete, onFollow, onOpenProfile }) => {
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showRetweetConfirm, setShowRetweetConfirm] = useState(false);

    const fetchComments = async () => {
        try {
            const res = await axios.get(`/api/social/posts/${post.id}/comments`);
            setComments(res.data);
        } catch { /* silent */ }
    };

    const submitComment = async (e) => {
        e.preventDefault();
        if (!comment.trim()) return;
        setSubmitting(true);
        try {
            await axios.post(`/api/social/posts/${post.id}/comments`, { content: comment }, {
                headers: authHeaders(localStorage.getItem('token'))
            });
            setComment('');
            fetchComments();
        } catch { /* silent */ } finally {
            setSubmitting(false);
        }
    };

    const handleRetweetClick = () => {
        if (post.isRetweeted) {
            onRetweet(); // undo
        } else {
            setShowRetweetConfirm(true);
        }
    };

    const displayPost = post.isRetweet && post.originalPost ? post.originalPost : post;

    return (
        <article className="bg-[#111820] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-colors">
            {/* Retweet label */}
            {post.isRetweet && (
                <div className="px-4 pt-3 pb-1 flex items-center gap-2 text-xs text-gray-400">
                    <ArrowPathRoundedSquareIcon className="w-4 h-4 text-green-400" />
                    <button onClick={() => onOpenProfile(post.user.id)} className="hover:underline font-medium">
                        {post.user.id === currentUser?.id ? 'You' : post.user.username}
                    </button>
                    <span>retweeted</span>
                </div>
            )}

            {/* Author row */}
            <div className="p-4 flex items-center gap-3">
                <button onClick={() => onOpenProfile(displayPost.user?.id || post.user.id)} className="flex-shrink-0">
                    <img
                        src={displayPost.user?.avatar || post.user.avatar}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover ring-2 ring-transparent hover:ring-signal-accent/50 transition"
                    />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => onOpenProfile(displayPost.user?.id || post.user.id)} className="font-bold hover:underline truncate">
                            {displayPost.user?.username || post.user.username}
                        </button>
                        {post.channel && <span className="text-xs text-signal-accent truncate">in {post.channel.name}</span>}
                    </div>
                    <p className="text-xs text-gray-500">{new Date(displayPost.createdAt || post.createdAt).toLocaleString()}</p>
                </div>
                {/* Follow button */}
                {(displayPost.user?.id || post.user.id) !== currentUser?.id && !post.isRetweet && (
                    <button
                        onClick={onFollow}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full transition ${post.user.isFollowing ? 'bg-white/10 hover:bg-red-500/15 hover:text-red-400 text-gray-300' : 'bg-signal-accent hover:bg-signal-accentHover text-white'}`}
                    >
                        {post.user.isFollowing ? 'Following' : '+ Follow'}
                    </button>
                )}
                {post.canDelete && (
                    <button onClick={onDelete} className="p-2 rounded-full hover:bg-red-500/10 text-red-400 transition" title="Delete">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Caption */}
            {(displayPost.caption || post.caption) && (
                <p className="px-4 pb-3 text-sm whitespace-pre-wrap text-gray-100 leading-relaxed">
                    {displayPost.caption || post.caption}
                </p>
            )}

            {/* Media */}
            {(displayPost.mediaUrl || post.mediaUrl) && (
                <div className="bg-black">
                    {(displayPost.mediaType || post.mediaType) === 'video' ? (
                        <video src={displayPost.mediaUrl || post.mediaUrl} controls className="w-full max-h-[70vh] object-contain" />
                    ) : (
                        <img src={displayPost.mediaUrl || post.mediaUrl} alt="" className="w-full max-h-[70vh] object-contain" />
                    )}
                </div>
            )}

            {/* Action Bar */}
            <div className="px-4 py-3 flex items-center gap-1 sm:gap-3 border-t border-white/10">
                {/* Like */}
                <ActionBtn
                    icon={post.isLiked ? <HeartSolidIcon className="w-5 h-5 text-red-500" /> : <HeartIcon className="w-5 h-5" />}
                    count={post.likesCount}
                    onClick={onLike}
                    active={post.isLiked}
                    activeColor="text-red-400"
                    label="Like"
                />
                {/* Comment */}
                <ActionBtn
                    icon={<ChatBubbleOvalLeftIcon className="w-5 h-5" />}
                    count={comments.length || post.commentsCount}
                    onClick={() => { setCommentsOpen(p => !p); if (!commentsOpen) fetchComments(); }}
                    label="Comment"
                />
                {/* Retweet */}
                <ActionBtn
                    icon={post.isRetweeted
                        ? <RetweetSolidIcon className="w-5 h-5 text-green-400" />
                        : <ArrowPathRoundedSquareIcon className="w-5 h-5" />}
                    count={post.retweetCount}
                    onClick={handleRetweetClick}
                    active={post.isRetweeted}
                    activeColor="text-green-400"
                    label="Retweet"
                />
                {/* Share */}
                <ActionBtn
                    icon={<ShareIcon className="w-5 h-5" />}
                    count={post.shareCount || 0}
                    onClick={onShare}
                    label="Share"
                />
            </div>

            {/* Retweet confirm popup */}
            {showRetweetConfirm && (
                <div className="mx-4 mb-3 bg-[#1a2535] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-300">Retweet this post to your followers?</p>
                    <div className="flex gap-2">
                        <button onClick={() => { onRetweet(); setShowRetweetConfirm(false); }} className="px-3 py-1.5 bg-green-500 hover:bg-green-400 rounded-full text-sm font-bold transition">
                            Retweet
                        </button>
                        <button onClick={() => setShowRetweetConfirm(false)} className="px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-full text-sm transition">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Comments Section */}
            {commentsOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {comments.length === 0 && <p className="text-sm text-gray-500 text-center py-2">No comments yet. Be first!</p>}
                    {comments.map(item => (
                        <CommentItem
                            key={item.id}
                            comment={item}
                            token={token}
                            currentUser={currentUser}
                            onOpenProfile={onOpenProfile}
                        />
                    ))}
                    <form onSubmit={submitComment} className="flex gap-2 pt-1">
                        <img src={currentUser?.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        <div className="flex-1 flex gap-2">
                            <input
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Write a comment..."
                                className="flex-1 bg-signal-input rounded-full px-4 py-2 outline-none text-sm focus:ring-1 focus:ring-signal-accent"
                            />
                            <button
                                type="submit"
                                disabled={submitting || !comment.trim()}
                                className="p-2 rounded-full bg-signal-accent disabled:bg-gray-700 hover:bg-signal-accentHover transition"
                            >
                                <PaperAirplaneIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </article>
    );
};

// ─── ACTION BUTTON ──────────────────────────────────────────────────────────
const ActionBtn = ({ icon, count, onClick, active, activeColor, label }) => (
    <button
        onClick={onClick}
        title={label}
        className={`flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-full hover:bg-white/10 transition ${active ? activeColor : 'text-gray-400 hover:text-white'}`}
    >
        {icon}
        {count > 0 && <span className="text-xs font-medium">{count}</span>}
    </button>
);

// ─── COMMENT ITEM (with reply) ─────────────────────────────────────────────
const CommentItem = ({ comment, token, currentUser, onOpenProfile }) => {
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [localReplies, setLocalReplies] = useState(comment.replies || []);
    const [submitting, setSubmitting] = useState(false);
    const [showReplies, setShowReplies] = useState(false);

    const submitReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;
        setSubmitting(true);
        try {
            const res = await axios.post(`/api/social/comments/${comment.id}/replies`, { content: replyText }, {
                headers: authHeaders(token || localStorage.getItem('token'))
            });
            setLocalReplies(p => [...p, res.data]);
            setReplyText('');
            setShowReplyBox(false);
            setShowReplies(true);
        } catch { /* silent */ } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex gap-2 text-sm">
            <button onClick={() => onOpenProfile(comment.user.id)} className="flex-shrink-0">
                <img src={comment.user.avatar} alt="" className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-signal-accent/50 transition" />
            </button>
            <div className="flex-1 min-w-0">
                <div className="bg-white/5 rounded-2xl px-3 py-2">
                    <button onClick={() => onOpenProfile(comment.user.id)} className="font-bold text-xs hover:underline">{comment.user.username}</button>
                    <p className="text-gray-200 text-sm mt-0.5 leading-relaxed">{comment.content}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 px-1">
                    <span className="text-xs text-gray-500">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button onClick={() => setShowReplyBox(p => !p)} className="text-xs text-gray-400 hover:text-white transition font-medium">Reply</button>
                    {localReplies.length > 0 && (
                        <button onClick={() => setShowReplies(p => !p)} className="text-xs text-signal-accent hover:underline font-medium">
                            {showReplies ? 'Hide' : `${localReplies.length} repl${localReplies.length > 1 ? 'ies' : 'y'}`}
                        </button>
                    )}
                </div>

                {/* Replies */}
                {showReplies && localReplies.length > 0 && (
                    <div className="mt-2 space-y-2 pl-3 border-l-2 border-white/10">
                        {localReplies.map(reply => (
                            <div key={reply.id} className="flex gap-2">
                                <button onClick={() => onOpenProfile(reply.user.id)}>
                                    <img src={reply.user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                                </button>
                                <div className="bg-white/5 rounded-2xl px-3 py-2 flex-1">
                                    <button onClick={() => onOpenProfile(reply.user.id)} className="font-bold text-xs hover:underline">{reply.user.username}</button>
                                    <p className="text-gray-300 text-xs mt-0.5">{reply.content}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Reply box */}
                {showReplyBox && (
                    <form onSubmit={submitReply} className="mt-2 flex gap-2">
                        <img src={currentUser?.avatar} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-1" />
                        <div className="flex-1 flex gap-2">
                            <input
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                placeholder={`Reply to ${comment.user.username}...`}
                                className="flex-1 bg-signal-input rounded-full px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-signal-accent"
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={submitting || !replyText.trim()}
                                className="p-1.5 rounded-full bg-signal-accent disabled:bg-gray-700 hover:bg-signal-accentHover transition"
                            >
                                <PaperAirplaneIcon className="w-3 h-3" />
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ─── USER PROFILE VIEW ─────────────────────────────────────────────────────────
const UserProfileView = ({ userId, currentUser, token, updateUser, onBack, onOpenProfile, onLike, onRetweet, onShare, onDelete, onFollow }) => {
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ username: '', bio: '', websiteUrl: '' });
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const avatarInputRef = useRef(null);
    const isOwnProfile = userId === currentUser?.id;

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/social/users/${userId}`, { headers: authHeaders(token) });
            setProfileData(res.data);
            setEditForm({
                username: res.data.user.username || '',
                bio: res.data.user.bio || '',
                websiteUrl: res.data.user.websiteUrl || ''
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [userId, token]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const saveProfile = async () => {
        setSaving(true);
        try {
            const res = await axios.post('/api/users/profile', editForm, { headers: authHeaders(token) });
            setProfileData(prev => ({ ...prev, user: { ...prev.user, ...res.data } }));
            if (updateUser) updateUser(res.data);
            setEditMode(false);
        } catch { alert('Could not save profile'); } finally {
            setSaving(false);
        }
    };

    const uploadAvatar = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingAvatar(true);
        const fd = new FormData();
        fd.append('avatar', file);
        try {
            const res = await axios.post('/api/user/avatar', fd, {
                headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' }
            });
            const updatedUser = res.data.user;
            setProfileData(prev => ({ ...prev, user: { ...prev.user, avatar: updatedUser.avatar } }));
            if (updateUser) updateUser(updatedUser);
        } catch { alert('Avatar upload failed'); } finally {
            setUploadingAvatar(false);
        }
    };

    const handleFollowToggle = async () => {
        if (!profileData) return;
        try {
            const res = await axios.post(`/api/users/${userId}/follow`, {}, { headers: authHeaders(token) });
            setProfileData(prev => ({
                ...prev,
                user: {
                    ...prev.user,
                    isFollowing: res.data.isFollowing,
                    followersCount: prev.user.followersCount + (res.data.isFollowing ? 1 : -1)
                }
            }));
        } catch { console.error('Follow failed'); }
    };

    const handleLike = async (postId) => {
        try {
            const res = await axios.post(`/api/social/posts/${postId}/like`, {}, { headers: authHeaders(token) });
            setProfileData(prev => ({
                ...prev,
                posts: prev.posts.map(p => p.id === postId ? { ...p, isLiked: res.data.isLiked, likesCount: res.data.likesCount } : p)
            }));
        } catch { /* silent */ }
    };

    const handleRetweet = async (postId) => {
        try {
            const res = await axios.post(`/api/social/posts/${postId}/retweet`, {}, { headers: authHeaders(token) });
            setProfileData(prev => ({
                ...prev,
                posts: prev.posts.map(p => p.id === postId ? { ...p, isRetweeted: res.data.isRetweeted, retweetCount: res.data.retweetCount } : p)
            }));
        } catch { /* silent */ }
    };

    const handleShare = async (postId) => {
        const postUrl = `${window.location.origin}/?post=${postId}`;
        try { await axios.post(`/api/social/posts/${postId}/share`, {}, { headers: authHeaders(token) }); } catch { /* ignore */ }
        if (navigator.share) {
            try { await navigator.share({ url: postUrl }); } catch { /* cancelled */ }
        } else {
            navigator.clipboard?.writeText(postUrl);
            alert('Post link copied!');
        }
    };

    const handleDelete = async (postId) => {
        if (!window.confirm('Delete this post?')) return;
        try {
            await axios.delete(`/api/social/posts/${postId}`, { headers: authHeaders(token) });
            setProfileData(prev => ({ ...prev, posts: prev.posts.filter(p => p.id !== postId) }));
        } catch { alert('Delete failed'); }
    };

    if (loading) return (
        <div className="h-[100dvh] w-full bg-[#0b0f14] text-white flex flex-col items-center justify-center">
            <Loading />
        </div>
    );

    const u = profileData?.user;

    return (
        <div className="h-[100dvh] w-full bg-[#0b0f14] text-white flex flex-col">
            {/* Header */}
            <header className="h-16 px-3 sm:px-5 border-b border-white/10 bg-[#101820] flex items-center gap-3 flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="font-bold text-lg truncate">{u?.username}</h1>
                    <p className="text-xs text-gray-400">{profileData?.user?.postsCount || 0} posts</p>
                </div>
                {isOwnProfile && !editMode && (
                    <button onClick={() => setEditMode(true)} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 hover:bg-white/10 text-sm font-semibold transition">
                        <PencilIcon className="w-4 h-4" />
                        Edit Profile
                    </button>
                )}
                {editMode && (
                    <div className="flex gap-2">
                        <button onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded-full border border-white/20 hover:bg-white/10 text-sm transition">Cancel</button>
                        <button onClick={saveProfile} disabled={saving} className="px-4 py-1.5 rounded-full bg-signal-accent hover:bg-signal-accentHover text-sm font-bold transition">
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto">
                    {/* Profile Banner / BG gradient */}
                    <div className="h-32 bg-gradient-to-br from-signal-accent/40 via-blue-600/20 to-purple-600/20 relative" />

                    {/* Avatar + core info */}
                    <div className="px-4 pb-4 relative">
                        {/* Avatar */}
                        <div className="relative -mt-14 mb-3 w-fit">
                            <img
                                src={u?.avatar}
                                alt={u?.username}
                                className="w-24 h-24 rounded-full object-cover border-4 border-[#0b0f14] ring-2 ring-signal-accent/40"
                            />
                            {isOwnProfile && (
                                <>
                                    <button
                                        onClick={() => avatarInputRef.current?.click()}
                                        disabled={uploadingAvatar}
                                        className="absolute bottom-1 right-1 p-1.5 rounded-full bg-signal-accent hover:bg-signal-accentHover shadow-lg transition"
                                        title="Change photo"
                                    >
                                        {uploadingAvatar ? (
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <ArrowUpTrayIcon className="w-3 h-3" />
                                        )}
                                    </button>
                                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
                                </>
                            )}
                        </div>

                        {/* Username / follow btn */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                {editMode ? (
                                    <input
                                        value={editForm.username}
                                        onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))}
                                        className="w-full text-xl font-bold bg-signal-input rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-signal-accent mb-2"
                                        placeholder="Username"
                                    />
                                ) : (
                                    <h2 className="text-xl font-bold">{u?.username}</h2>
                                )}
                                <p className="text-sm text-gray-400">@{u?.username?.toLowerCase().replace(/\s+/g, '_')}</p>
                            </div>
                            {!isOwnProfile && (
                                <button
                                    onClick={handleFollowToggle}
                                    className={`flex-shrink-0 px-5 py-2 rounded-full font-bold text-sm transition ${u?.isFollowing
                                        ? 'border border-white/20 hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/10'
                                        : 'bg-signal-accent hover:bg-signal-accentHover'}`}
                                >
                                    {u?.isFollowing ? 'Following' : 'Follow'}
                                </button>
                            )}
                        </div>

                        {/* Bio */}
                        <div className="mt-3">
                            {editMode ? (
                                <textarea
                                    value={editForm.bio}
                                    onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))}
                                    placeholder="Write your bio..."
                                    rows={3}
                                    maxLength={200}
                                    className="w-full bg-signal-input rounded-xl px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-signal-accent"
                                />
                            ) : (
                                u?.bio && <p className="text-sm text-gray-200 leading-relaxed">{u.bio}</p>
                            )}
                        </div>

                        {/* Website & joined */}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            {editMode ? (
                                <div className="flex items-center gap-2 w-full">
                                    <LinkIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <input
                                        value={editForm.websiteUrl}
                                        onChange={e => setEditForm(p => ({ ...p, websiteUrl: e.target.value }))}
                                        placeholder="https://yourwebsite.com"
                                        className="flex-1 bg-signal-input rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-signal-accent"
                                    />
                                </div>
                            ) : (
                                u?.websiteUrl && (
                                    <a href={u.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-signal-accent hover:underline">
                                        <LinkIcon className="w-4 h-4" />
                                        {u.websiteUrl.replace(/^https?:\/\//, '')}
                                    </a>
                                )
                            )}
                            {u?.joinedAt && (
                                <span className="flex items-center gap-1 text-sm text-gray-400">
                                    <CalendarIcon className="w-4 h-4" />
                                    Joined {new Date(u.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </span>
                            )}
                        </div>

                        {/* Stats */}
                        <div className="mt-3 flex gap-5">
                            <span className="text-sm">
                                <strong className="text-white font-bold">{u?.followingCount || 0}</strong>
                                <span className="text-gray-400 ml-1">Following</span>
                            </span>
                            <span className="text-sm">
                                <strong className="text-white font-bold">{u?.followersCount || 0}</strong>
                                <span className="text-gray-400 ml-1">Followers</span>
                            </span>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-white/10" />

                    {/* Posts */}
                    <div className="p-3 sm:p-4 space-y-4">
                        <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide px-1">Posts & Retweets</h3>
                        {profileData?.posts?.length ? profileData.posts.map(post => (
                            <PostCard
                                key={post.id}
                                post={post}
                                currentUser={currentUser}
                                token={token}
                                onLike={() => handleLike(post.id)}
                                onRetweet={() => handleRetweet(post.id)}
                                onShare={() => handleShare(post.id)}
                                onDelete={() => handleDelete(post.id)}
                                onFollow={() => {/* handled internally */}}
                                onOpenProfile={onOpenProfile}
                            />
                        )) : (
                            <EmptyState text={isOwnProfile ? "You haven't posted anything yet." : "No posts yet."} />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// ─── CHANNEL COMPONENTS ────────────────────────────────────────────────────────
const ChannelsList = ({ channels, loading, onOpen, onSubscribe }) => (
    <div className="max-w-3xl mx-auto w-full p-3 sm:p-5 space-y-3">
        {loading ? <Loading /> : channels.length ? channels.map(channel => (
            <div key={channel.id} className="bg-[#111820] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-colors">
                <button onClick={() => onOpen(channel.id)} className="w-full text-left">
                    <div className="h-28 bg-signal-input">
                        {channel.coverUrl
                            ? <img src={channel.coverUrl} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><UsersIcon className="w-10 h-10 text-gray-500" /></div>}
                    </div>
                    <div className="p-4">
                        <h3 className="font-bold text-lg">{channel.name}</h3>
                        <p className="text-sm text-gray-400 line-clamp-2">{channel.description || 'No description yet'}</p>
                        <p className="text-xs text-gray-500 mt-2">{channel.subscriberCount} subscribers</p>
                    </div>
                </button>
                <div className="px-4 pb-4">
                    {channel.role === 'owner' ? (
                        <span className="text-xs text-signal-accent font-bold">Owner</span>
                    ) : channel.role === 'approved' ? (
                        <span className="text-xs text-green-400 font-bold flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" />Subscribed</span>
                    ) : channel.role === 'pending' ? (
                        <span className="text-xs text-yellow-400 font-bold">Request pending…</span>
                    ) : (
                        <button onClick={() => onSubscribe(channel.id)} className="flex items-center gap-2 bg-signal-accent hover:bg-signal-accentHover rounded-full px-4 py-2 text-sm font-bold transition">
                            <UserPlusIcon className="w-4 h-4" />Subscribe
                        </button>
                    )}
                </div>
            </div>
        )) : <EmptyState text="No channels yet. Create one!" />}
    </div>
);

const ChannelView = ({ channel, posts, user, preview, media, caption, posting, fileRef, setCaption, setMedia, submitPost, likePost, retweetPost, sharePost, deletePost, toggleFollow, requestSubscribe, reviewRequest, openProfile, currentUser }) => (
    <div className="max-w-3xl mx-auto w-full p-3 sm:p-5 space-y-4">
        <section className="bg-[#111820] border border-white/10 rounded-2xl overflow-hidden">
            <div className="h-36 bg-signal-input">
                {channel.coverUrl
                    ? <img src={channel.coverUrl} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><UsersIcon className="w-12 h-12 text-gray-500" /></div>}
            </div>
            <div className="p-4">
                <h2 className="text-2xl font-bold">{channel.name}</h2>
                <p className="text-sm text-gray-400 mt-1">{channel.description || 'No description'}</p>
                <p className="text-xs text-gray-500 mt-2">Created by <button onClick={() => openProfile(channel.owner.id)} className="hover:underline text-signal-accent">{channel.owner.username}</button></p>
                {channel.role === 'none' || channel.role === 'rejected' ? (
                    <button onClick={requestSubscribe} className="mt-4 bg-signal-accent hover:bg-signal-accentHover rounded-full px-5 py-2 font-bold text-sm transition">Request to Subscribe</button>
                ) : channel.role === 'pending' ? (
                    <p className="mt-4 text-yellow-400 text-sm font-bold">Waiting for owner approval…</p>
                ) : null}
            </div>
        </section>

        {channel.role === 'owner' && channel.pendingRequests?.length > 0 && (
            <section className="bg-[#111820] border border-white/10 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold">Subscriber Requests ({channel.pendingRequests.length})</h3>
                {channel.pendingRequests.map(req => (
                    <div key={req.id} className="flex items-center gap-3">
                        <img src={req.user.avatar} alt="" className="w-10 h-10 rounded-full" />
                        <span className="flex-1 font-medium">{req.user.username}</span>
                        <button onClick={() => reviewRequest(req.id, 'approve')} className="p-2 rounded-full bg-green-500/15 text-green-400 hover:bg-green-500/25 transition"><CheckIcon className="w-5 h-5" /></button>
                        <button onClick={() => reviewRequest(req.id, 'reject')} className="p-2 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 transition"><XMarkIcon className="w-5 h-5" /></button>
                    </div>
                ))}
            </section>
        )}

        {channel.canPost && (
            <Composer avatar={user?.avatar} caption={caption} setCaption={setCaption} media={media} setMedia={setMedia} preview={preview} fileRef={fileRef} posting={posting} onSubmit={submitPost} />
        )}

        {posts.length ? posts.map(post => (
            <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser || user}
                token={localStorage.getItem('token')}
                onLike={() => likePost(post.id)}
                onRetweet={() => retweetPost(post.id)}
                onShare={() => sharePost(post.id)}
                onDelete={() => deletePost(post.id)}
                onFollow={() => toggleFollow(post.user.id)}
                onOpenProfile={openProfile}
            />
        )) : <EmptyState text={channel.canPost ? 'No posts yet.' : 'Subscribe and get approved to post here.'} />}
    </div>
);

// ─── UTILITY COMPONENTS ────────────────────────────────────────────────────────
const Loading = () => (
    <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
);

const EmptyState = ({ text }) => (
    <div className="text-center text-gray-400 py-16 px-6 bg-[#111820] border border-white/10 rounded-2xl">
        <div className="text-4xl mb-3">🌐</div>
        <p className="text-sm">{text}</p>
    </div>
);

export default Social;
