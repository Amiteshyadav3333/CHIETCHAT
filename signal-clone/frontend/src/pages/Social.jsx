import React, { useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    ArrowLeftIcon, PhotoIcon, HeartIcon, ChatBubbleOvalLeftIcon,
    PaperAirplaneIcon, PlusIcon, UserPlusIcon, CheckIcon, XMarkIcon,
    TrashIcon, UsersIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const Social = ({ onBack }) => {
    const { user, token } = useContext(AuthContext);
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
    const fileRef = useRef(null);
    const coverRef = useRef(null);

    const fetchPosts = async (tab = activeTab) => {
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
    };

    const fetchChannels = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/social/channels', { headers: authHeaders(token) });
            setChannels(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

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

    useEffect(() => {
        if (!media) {
            setPreview(null);
            return;
        }
        const nextPreview = URL.createObjectURL(media);
        setPreview(nextPreview);
        return () => URL.revokeObjectURL(nextPreview);
    }, [media]);

    const resetComposer = () => {
        setCaption('');
        setMedia(null);
        if (fileRef.current) fileRef.current.value = '';
    };

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
            if (channelId) {
                setChannelPosts(prev => [res.data, ...prev]);
            } else {
                setPosts(prev => [res.data, ...prev]);
            }
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
            setChannels(prev => [res.data, ...prev]);
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
            const patch = (post) => post.user.id === targetUserId
                ? { ...post, user: { ...post.user, isFollowing: res.data.isFollowing } }
                : post;
            setPosts(prev => prev.map(patch));
            setChannelPosts(prev => prev.map(patch));
        } catch (err) {
            console.error(err);
        }
    };

    const requestSubscribe = async (channelId) => {
        try {
            const res = await axios.post(`/api/social/channels/${channelId}/subscribe`, {}, { headers: authHeaders(token) });
            setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, role: res.data.role } : ch));
            if (selectedChannel?.id === channelId) setSelectedChannel(prev => ({ ...prev, role: res.data.role }));
        } catch (err) {
            console.error(err);
        }
    };

    const reviewRequest = async (membershipId, action) => {
        try {
            const res = await axios.post(
                `/api/social/channels/${selectedChannel.id}/members/${membershipId}`,
                { action },
                { headers: authHeaders(token) }
            );
            setSelectedChannel(res.data);
            setChannels(prev => prev.map(ch => ch.id === res.data.id ? res.data : ch));
        } catch (err) {
            console.error(err);
        }
    };

    const likePost = async (postId, channelPost = false) => {
        try {
            const res = await axios.post(`/api/social/posts/${postId}/like`, {}, { headers: authHeaders(token) });
            const patch = post => post.id === postId ? { ...post, isLiked: res.data.isLiked, likesCount: res.data.likesCount } : post;
            channelPost ? setChannelPosts(prev => prev.map(patch)) : setPosts(prev => prev.map(patch));
        } catch (err) {
            console.error(err);
        }
    };

    const deletePost = async (postId, channelPost = false) => {
        if (!window.confirm('Delete this post?')) return;
        try {
            await axios.delete(`/api/social/posts/${postId}`, { headers: authHeaders(token) });
            channelPost ? setChannelPosts(prev => prev.filter(p => p.id !== postId)) : setPosts(prev => prev.filter(p => p.id !== postId));
        } catch (err) {
            alert('Delete failed');
        }
    };

    const currentPosts = selectedChannel ? channelPosts : posts;

    return (
        <div className="h-[100dvh] w-full bg-[#0b0f14] text-white flex flex-col">
            <header className="h-16 px-3 sm:px-5 border-b border-white/10 bg-[#101820] flex items-center gap-3">
                <button onClick={selectedChannel ? () => setSelectedChannel(null) : onBack} className="p-2 rounded-full hover:bg-white/10" title="Back">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="font-bold text-lg truncate">{selectedChannel ? selectedChannel.name : 'Social'}</h1>
                    <p className="text-xs text-gray-400 truncate">
                        {selectedChannel ? `${selectedChannel.subscriberCount} subscribers` : 'Posts, followers, and approval based channels'}
                    </p>
                </div>
                {!selectedChannel && (
                    <button onClick={() => setShowChannelForm(true)} className="p-2 rounded-full bg-signal-accent hover:bg-signal-accentHover" title="Create channel">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                )}
            </header>

            {!selectedChannel && (
                <nav className="grid grid-cols-3 border-b border-white/10 bg-[#101820]">
                    {[
                        ['feed', 'Feed'],
                        ['following', 'Following'],
                        ['channels', 'Channels']
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`py-3 text-sm font-semibold ${activeTab === key ? 'text-white border-b-2 border-signal-accent' : 'text-gray-400'}`}
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
                        likePost={(postId) => likePost(postId, true)}
                        deletePost={(postId) => deletePost(postId, true)}
                        toggleFollow={toggleFollow}
                        requestSubscribe={() => requestSubscribe(selectedChannel.id)}
                        reviewRequest={reviewRequest}
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
                        {loading ? <Loading /> : currentPosts.length ? currentPosts.map(post => (
                            <PostCard
                                key={post.id}
                                post={post}
                                currentUser={user}
                                onLike={() => likePost(post.id)}
                                onDelete={() => deletePost(post.id)}
                                onFollow={() => toggleFollow(post.user.id)}
                            />
                        )) : <EmptyState text={activeTab === 'following' ? 'Follow users to build your feed.' : 'No posts yet. Upload the first photo or video.'} />}
                    </div>
                )}
            </main>

            {showChannelForm && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                    <form onSubmit={createChannel} className="w-full max-w-md bg-[#111820] border border-white/10 rounded-2xl p-5 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold">Create Channel</h2>
                            <button type="button" onClick={() => setShowChannelForm(false)} className="p-2 rounded-full hover:bg-white/10">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <input
                            value={channelForm.name}
                            onChange={(e) => setChannelForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Channel name"
                            className="w-full bg-signal-input rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-signal-accent"
                            required
                        />
                        <textarea
                            value={channelForm.description}
                            onChange={(e) => setChannelForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Description"
                            rows="3"
                            className="w-full bg-signal-input rounded-xl px-4 py-3 outline-none resize-none focus:ring-1 focus:ring-signal-accent"
                        />
                        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => setChannelForm(prev => ({ ...prev, cover: e.target.files?.[0] || null }))} />
                        <button type="button" onClick={() => coverRef.current?.click()} className="w-full flex items-center justify-center gap-2 bg-white/10 rounded-xl py-3 hover:bg-white/15">
                            <PhotoIcon className="w-5 h-5" />
                            {channelForm.cover ? channelForm.cover.name : 'Choose cover image'}
                        </button>
                        <button className="w-full bg-signal-accent hover:bg-signal-accentHover rounded-xl py-3 font-bold">Create</button>
                    </form>
                </div>
            )}
        </div>
    );
};

const Composer = ({ avatar, caption, setCaption, media, setMedia, preview, fileRef, posting, onSubmit }) => (
    <div className="bg-[#111820] border border-white/10 rounded-2xl p-3 sm:p-4">
        <div className="flex gap-3">
            <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
            <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Share a post..."
                rows="3"
                className="flex-1 bg-transparent resize-none outline-none text-sm sm:text-base placeholder:text-gray-500"
            />
        </div>
        {preview && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black">
                {media?.type.startsWith('video/') ? (
                    <video src={preview} controls className="w-full max-h-96 object-contain" />
                ) : (
                    <img src={preview} alt="" className="w-full max-h-96 object-contain" />
                )}
            </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => setMedia(e.target.files?.[0] || null)} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-white/10 text-gray-300">
                <PhotoIcon className="w-5 h-5" />
                <span className="text-sm">{media ? 'Change media' : 'Photo/Video'}</span>
            </button>
            <button onClick={onSubmit} disabled={posting || (!caption.trim() && !media)} className="flex items-center gap-2 bg-signal-accent disabled:bg-gray-700 disabled:text-gray-400 hover:bg-signal-accentHover rounded-full px-4 py-2 font-semibold">
                <PaperAirplaneIcon className="w-4 h-4" />
                Post
            </button>
        </div>
    </div>
);

const PostCard = ({ post, currentUser, onLike, onDelete, onFollow }) => {
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [comment, setComment] = useState('');

    const fetchComments = async () => {
        const res = await axios.get(`/api/social/posts/${post.id}/comments`);
        setComments(res.data);
    };

    const submitComment = async (e) => {
        e.preventDefault();
        if (!comment.trim()) return;
        await axios.post(`/api/social/posts/${post.id}/comments`, { content: comment }, {
            headers: authHeaders(localStorage.getItem('token'))
        });
        setComment('');
        fetchComments();
    };

    return (
        <article className="bg-[#111820] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 flex items-center gap-3">
                <img src={post.user.avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold truncate">{post.user.username}</h3>
                        {post.channel && <span className="text-xs text-signal-accent truncate">in {post.channel.name}</span>}
                    </div>
                    <p className="text-xs text-gray-500">{new Date(post.createdAt).toLocaleString()}</p>
                </div>
                {post.user.id !== currentUser.id && (
                    <button onClick={onFollow} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15">
                        {post.user.isFollowing ? 'Following' : 'Follow'}
                    </button>
                )}
                {post.canDelete && (
                    <button onClick={onDelete} className="p-2 rounded-full hover:bg-red-500/10 text-red-400" title="Delete">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                )}
            </div>
            {post.caption && <p className="px-4 pb-3 text-sm whitespace-pre-wrap text-gray-100">{post.caption}</p>}
            {post.mediaUrl && (
                <div className="bg-black">
                    {post.mediaType === 'video' ? (
                        <video src={post.mediaUrl} controls className="w-full max-h-[70vh] object-contain" />
                    ) : (
                        <img src={post.mediaUrl} alt="" className="w-full max-h-[70vh] object-contain" />
                    )}
                </div>
            )}
            <div className="px-4 py-3 flex items-center gap-4 border-t border-white/10">
                <button onClick={onLike} className="flex items-center gap-2 text-sm">
                    {post.isLiked ? <HeartSolidIcon className="w-6 h-6 text-red-500" /> : <HeartIcon className="w-6 h-6" />}
                    {post.likesCount}
                </button>
                <button onClick={() => { setCommentsOpen(prev => !prev); if (!commentsOpen) fetchComments(); }} className="flex items-center gap-2 text-sm">
                    <ChatBubbleOvalLeftIcon className="w-6 h-6" />
                    {comments.length || post.commentsCount}
                </button>
            </div>
            {commentsOpen && (
                <div className="px-4 pb-4 space-y-3">
                    {comments.map(item => (
                        <div key={item.id} className="flex gap-2 text-sm">
                            <img src={item.user.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                            <div className="bg-white/5 rounded-xl px-3 py-2 flex-1">
                                <b>{item.user.username}</b>
                                <p className="text-gray-300">{item.content}</p>
                            </div>
                        </div>
                    ))}
                    <form onSubmit={submitComment} className="flex gap-2">
                        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" className="flex-1 bg-signal-input rounded-full px-4 py-2 outline-none text-sm" />
                        <button className="p-2 rounded-full bg-signal-accent"><PaperAirplaneIcon className="w-5 h-5" /></button>
                    </form>
                </div>
            )}
        </article>
    );
};

const ChannelsList = ({ channels, loading, onOpen, onSubscribe }) => (
    <div className="max-w-3xl mx-auto w-full p-3 sm:p-5 space-y-3">
        {loading ? <Loading /> : channels.length ? channels.map(channel => (
            <div key={channel.id} className="bg-[#111820] border border-white/10 rounded-2xl overflow-hidden">
                <button onClick={() => onOpen(channel.id)} className="w-full text-left">
                    <div className="h-28 bg-signal-input">
                        {channel.coverUrl ? <img src={channel.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><UsersIcon className="w-10 h-10 text-gray-500" /></div>}
                    </div>
                    <div className="p-4">
                        <h3 className="font-bold text-lg">{channel.name}</h3>
                        <p className="text-sm text-gray-400 line-clamp-2">{channel.description || 'No description yet'}</p>
                        <p className="text-xs text-gray-500 mt-2">{channel.subscriberCount} subscribers</p>
                    </div>
                </button>
                <div className="px-4 pb-4">
                    {channel.role === 'owner' ? (
                        <span className="text-xs text-signal-accent font-bold">Owner dashboard</span>
                    ) : channel.role === 'approved' ? (
                        <span className="text-xs text-green-400 font-bold">Subscribed</span>
                    ) : channel.role === 'pending' ? (
                        <span className="text-xs text-yellow-400 font-bold">Request pending</span>
                    ) : (
                        <button onClick={() => onSubscribe(channel.id)} className="flex items-center gap-2 bg-signal-accent hover:bg-signal-accentHover rounded-full px-4 py-2 text-sm font-bold">
                            <UserPlusIcon className="w-4 h-4" />
                            Subscribe
                        </button>
                    )}
                </div>
            </div>
        )) : <EmptyState text="No channels yet. Create one and approve subscribers." />}
    </div>
);

const ChannelView = ({ channel, posts, user, preview, media, caption, posting, fileRef, setCaption, setMedia, submitPost, likePost, deletePost, toggleFollow, requestSubscribe, reviewRequest }) => (
    <div className="max-w-3xl mx-auto w-full p-3 sm:p-5 space-y-4">
        <section className="bg-[#111820] border border-white/10 rounded-2xl overflow-hidden">
            <div className="h-36 bg-signal-input">
                {channel.coverUrl ? <img src={channel.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><UsersIcon className="w-12 h-12 text-gray-500" /></div>}
            </div>
            <div className="p-4">
                <h2 className="text-2xl font-bold">{channel.name}</h2>
                <p className="text-sm text-gray-400 mt-1">{channel.description || 'No description yet'}</p>
                <p className="text-xs text-gray-500 mt-2">Created by {channel.owner.username}</p>
                {channel.role === 'none' || channel.role === 'rejected' ? (
                    <button onClick={requestSubscribe} className="mt-4 bg-signal-accent hover:bg-signal-accentHover rounded-full px-4 py-2 font-bold">Request Subscribe</button>
                ) : channel.role === 'pending' ? (
                    <p className="mt-4 text-yellow-400 text-sm font-bold">Waiting for channel owner approval</p>
                ) : null}
            </div>
        </section>

        {channel.role === 'owner' && channel.pendingRequests?.length > 0 && (
            <section className="bg-[#111820] border border-white/10 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold">Subscriber Requests</h3>
                {channel.pendingRequests.map(req => (
                    <div key={req.id} className="flex items-center gap-3">
                        <img src={req.user.avatar} alt="" className="w-10 h-10 rounded-full" />
                        <span className="flex-1 font-medium">{req.user.username}</span>
                        <button onClick={() => reviewRequest(req.id, 'approve')} className="p-2 rounded-full bg-green-500/15 text-green-400"><CheckIcon className="w-5 h-5" /></button>
                        <button onClick={() => reviewRequest(req.id, 'reject')} className="p-2 rounded-full bg-red-500/15 text-red-400"><XMarkIcon className="w-5 h-5" /></button>
                    </div>
                ))}
            </section>
        )}

        {channel.canPost && (
            <Composer
                avatar={user?.avatar}
                caption={caption}
                setCaption={setCaption}
                media={media}
                setMedia={setMedia}
                preview={preview}
                fileRef={fileRef}
                posting={posting}
                onSubmit={submitPost}
            />
        )}

        {posts.length ? posts.map(post => (
            <PostCard
                key={post.id}
                post={post}
                currentUser={user}
                onLike={() => likePost(post.id)}
                onDelete={() => deletePost(post.id)}
                onFollow={() => toggleFollow(post.user.id)}
            />
        )) : <EmptyState text={channel.canPost ? 'No channel posts yet.' : 'Subscribe and wait for approval to post here.'} />}
    </div>
);

const Loading = () => (
    <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
);

const EmptyState = ({ text }) => (
    <div className="text-center text-gray-400 py-16 px-6 bg-[#111820] border border-white/10 rounded-2xl">
        {text}
    </div>
);

export default Social;
