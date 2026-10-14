import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MagnifyingGlassIcon, PlayIcon, UserIcon, UsersIcon, ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline';

const categories = [
    ['chats', 'Your chats', ChatBubbleLeftRightIcon],
    ['users', 'People', UserIcon],
    ['reels', 'Videos', PlayIcon],
    ['posts', 'Posts', ChatBubbleLeftRightIcon],
    ['communities', 'Communities', UsersIcon],
];

const SearchRow = ({ icon: Icon, image, title, subtitle, onClick, action, actionLabel }) => (
    <div className="global-search-row group flex items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {image ? <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.06] text-gray-400"><Icon className="h-5 w-5" /></span>}
            <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-100">{title}</span>
                {subtitle && <span className="mt-0.5 block truncate text-xs text-gray-400">{subtitle}</span>}
            </span>
        </button>
        {action && <button type="button" onClick={action} className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-[#ff6533] hover:text-white">{actionLabel}</button>}
    </div>
);

export const GlobalSearchBar = ({ token, chats = [], onSelectResult, onMessageUser }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ users: [], reels: [], posts: [], communities: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const normalizedQuery = query.trim();
    const resultCount = useMemo(() => Object.values(results).reduce((total, list) => total + list.length, 0), [results]);

    useEffect(() => {
        if (normalizedQuery.length < 2) {
            setResults({ users: [], reels: [], posts: [], communities: [] });
            setLoading(false);
            setError('');
            return undefined;
        }
        setResults({ chats: [], users: [], reels: [], posts: [], communities: [] });
        setLoading(true);
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setError('');
            try {
                const response = await axios.get('/api/search', {
                    params: { q: normalizedQuery },
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });
                const matchingChats = (Array.isArray(chats) ? chats : []).map(chat => {
                    const participants = (chat.participants || []).map(person => person?.username).filter(Boolean).join(' ');
                    const title = chat.name || participants || (chat.isGroup ? 'Group chat' : 'Direct chat');
                    const searchable = `${title} ${participants}`.toLowerCase();
                    return searchable.includes(normalizedQuery.toLowerCase()) ? { ...chat, title } : null;
                }).filter(Boolean).slice(0, 6);
                setResults({
                    chats: matchingChats,
                    users: Array.isArray(response.data?.users) ? response.data.users : [],
                    reels: Array.isArray(response.data?.reels) ? response.data.reels : [],
                    posts: Array.isArray(response.data?.posts) ? response.data.posts : [],
                    communities: Array.isArray(response.data?.communities) ? response.data.communities : [],
                });
            } catch (requestError) {
                if (!controller.signal.aborted) setError(requestError.response?.data?.error || 'Search is temporarily unavailable. Try again.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 260);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [normalizedQuery, token, chats]);

    const select = (type, item) => {
        setOpen(false);
        setQuery('');
        onSelectResult(type, item);
    };

    return (
        <div className="global-search relative mx-auto min-w-0 max-w-[620px] flex-1">
            <form onSubmit={event => { event.preventDefault(); setOpen(true); }} className={`reddit-topbar-search flex h-10 items-center gap-3 rounded-full px-4 ${open ? 'global-search-focused' : ''}`}>
                <MagnifyingGlassIcon className="h-5 w-5 shrink-0" />
                <input
                    type="search"
                    value={query}
                    onChange={event => { setQuery(event.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
                    placeholder="Search people, videos, posts, communities"
                    aria-label="Search people, videos, posts and communities"
                    aria-expanded={open && normalizedQuery.length >= 2}
                    autoComplete="off"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:ring-0"
                />
                {loading ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-[#ff6533]" aria-label="Searching" /> : normalizedQuery && <button type="button" onClick={() => { setQuery(''); setOpen(false); }} className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Clear search"><XMarkIcon className="h-4 w-4" /></button>}
                <kbd className="ml-auto hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] sm:inline">⌘ K</kbd>
            </form>
            {open && normalizedQuery.length >= 2 && (
                <>
                    <button type="button" aria-label="Close search results" className="fixed inset-0 z-40 cursor-default bg-black/15" onClick={() => setOpen(false)} />
                    <div className="global-search-results absolute left-0 right-0 top-[calc(100%+10px)] z-50 max-h-[min(72vh,640px)] overflow-y-auto rounded-2xl border border-white/10 bg-[#111b23] p-2 shadow-2xl">
                        <div className="flex items-center justify-between px-3 pb-2 pt-1 text-xs text-gray-500">
                            <span>Search results for <strong className="font-semibold text-gray-300">{normalizedQuery}</strong></span>
                            {!loading && <span>{resultCount} found</span>}
                        </div>
                        {error ? <p className="px-3 py-5 text-center text-sm text-rose-300">{error}</p> : loading && resultCount === 0 ? <p className="px-3 py-5 text-center text-sm text-gray-400">Searching across CheetChat…</p> : null}
                        {!loading && !error && resultCount === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">No matches yet. Try a different name or keyword.</p>}
                        {categories.map(([key, label, Icon]) => results[key]?.length > 0 && (
                            <section key={key} className="pb-1">
                                <h3 className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[.15em] text-gray-500">{label}</h3>
                                {results[key].map(item => {
                                    const id = `${key}-${item.id}`;
                                    if (key === 'chats') return <SearchRow key={id} icon={ChatBubbleLeftRightIcon} image={item.avatar} title={item.title} subtitle={item.isGroup ? 'Group chat' : 'Direct chat'} onClick={() => select('chat', item)} />;
                                    if (key === 'users') return <SearchRow key={id} icon={UserIcon} image={item.avatar} title={item.username} subtitle={`${item.platformId ? `@${item.platformId} · ` : ''}${item.bio || 'CheetChat member'}`} onClick={() => select('profile', item)} action={() => { setOpen(false); setQuery(''); onMessageUser(item); }} actionLabel="Message" />;
                                    if (key === 'reels') return <SearchRow key={id} icon={PlayIcon} title={item.caption || 'Video'} subtitle={`${item.user?.username || 'Creator'} · ${item.category || 'Reel'}`} onClick={() => select('reel', item)} />;
                                    if (key === 'posts') return <SearchRow key={id} icon={ChatBubbleLeftRightIcon} image={item.mediaType === 'image' ? item.mediaUrl : null} title={item.articleTitle || item.caption || 'Post'} subtitle={`${item.user?.username || 'Member'} · Social post`} onClick={() => select('post', item)} />;
                                    return <SearchRow key={id} icon={UsersIcon} image={item.avatar} title={item.name} subtitle={`${item.type === 'channel' ? 'Channel' : 'Public group'} · ${item.description || 'Community'}`} onClick={() => select('community', item)} />;
                                })}
                            </section>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
