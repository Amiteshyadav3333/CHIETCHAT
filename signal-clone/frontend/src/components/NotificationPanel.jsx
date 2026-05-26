import React, { useState } from 'react';
import {
    XMarkIcon, BellIcon, CheckIcon, TrashIcon,
    ArrowPathRoundedSquareIcon
} from '@heroicons/react/24/outline';
import {
    HeartIcon, ChatBubbleLeftIcon, UserPlusIcon,
    UsersIcon, StarIcon, ArrowUpTrayIcon
} from '@heroicons/react/24/solid';
import { formatDistanceToNow } from 'date-fns';

// Activity type → icon + color + label
const ACTIVITY_META = {
    like:            { icon: HeartIcon,                      color: 'text-red-400',     bg: 'bg-red-500/15',     label: 'liked your post' },
    comment:         { icon: ChatBubbleLeftIcon,              color: 'text-blue-400',    bg: 'bg-blue-500/15',    label: 'commented on your post' },
    comment_reply:   { icon: ChatBubbleLeftIcon,              color: 'text-cyan-400',    bg: 'bg-cyan-500/15',    label: 'replied to your comment' },
    retweet:         { icon: ArrowPathRoundedSquareIcon,      color: 'text-green-400',   bg: 'bg-green-500/15',   label: 'retweeted your post' },
    follow:          { icon: UserPlusIcon,                    color: 'text-purple-400',  bg: 'bg-purple-500/15',  label: 'started following you' },
    channel_request: { icon: UsersIcon,                      color: 'text-yellow-400',  bg: 'bg-yellow-500/15',  label: 'channel activity' },
    mention:         { icon: StarIcon,                        color: 'text-orange-400',  bg: 'bg-orange-500/15',  label: 'mentioned you' },
    share:           { icon: ArrowUpTrayIcon,                 color: 'text-teal-400',    bg: 'bg-teal-500/15',    label: 'shared your post' },
};

const getMeta = (type) => ACTIVITY_META[type] || {
    icon: BellIcon,
    color: 'text-gray-400',
    bg: 'bg-gray-500/15',
    label: 'new activity'
};

const NotificationPanel = ({ notifications, onClose, onMarkRead, onMarkAllRead, onNavigate }) => {
    const [filter, setFilter] = useState('all');

    const filtered = filter === 'unread'
        ? notifications.filter(n => !n.isRead)
        : notifications;

    const handleClick = (n) => {
        // Mark as read
        onMarkRead(n.id);
        // Navigate to activity
        if (onNavigate) onNavigate(n);
    };

    return (
        <div className="absolute inset-y-0 left-0 w-full md:w-96 bg-[#0d1117] z-[55] shadow-2xl border-r border-white/8 flex flex-col animate-slide-in-left">
            {/* ── Header ── */}
            <div className="px-4 py-4 bg-[#161b22] border-b border-white/8 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-signal-accent/20">
                            <BellIcon className="w-5 h-5 text-signal-accent" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Activity</h2>
                        {notifications.filter(n => !n.isRead).length > 0 && (
                            <span className="px-2 py-0.5 text-xs font-bold bg-signal-accent text-white rounded-full">
                                {notifications.filter(n => !n.isRead).length}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {notifications.some(n => !n.isRead) && (
                            <button
                                onClick={onMarkAllRead}
                                className="flex items-center gap-1 text-xs text-signal-accent hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition"
                                title="Mark all read"
                            >
                                <CheckIcon className="w-3.5 h-3.5" />
                                All read
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-gray-400 hover:text-white transition"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-2">
                    {[['all', 'All'], ['unread', 'Unread']].map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                                filter === key
                                    ? 'bg-signal-accent text-white'
                                    : 'bg-white/8 text-gray-400 hover:text-white hover:bg-white/12'
                            }`}
                        >
                            {label}
                            {key === 'unread' && notifications.filter(n => !n.isRead).length > 0 && (
                                <span className="ml-1.5 opacity-80">
                                    ({notifications.filter(n => !n.isRead).length})
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Notification List ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <BellIcon className="w-8 h-8 opacity-30" />
                        </div>
                        <p className="text-sm font-medium text-gray-400">
                            {filter === 'unread' ? 'No unread notifications' : 'No activity yet'}
                        </p>
                        <p className="text-xs mt-1 text-gray-600 leading-relaxed">
                            {filter === 'unread'
                                ? 'You\'re all caught up!'
                                : 'When someone likes, comments, or follows you, it will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div className="py-1">
                        {/* Group by date */}
                        <NotificationGroups notifications={filtered} onClickItem={handleClick} />
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-white/8 bg-[#161b22]/50 flex-shrink-0">
                    <p className="text-[10px] text-center text-gray-600">
                        Showing last {notifications.length} activities • Tap to navigate
                    </p>
                </div>
            )}
        </div>
    );
};

// ── Group by Today / Yesterday / Older ──────────────────────────────────────
const NotificationGroups = ({ notifications, onClickItem }) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart - 86400000);

    const groups = { Today: [], Yesterday: [], Older: [] };
    notifications.forEach(n => {
        const d = new Date(n.createdAt);
        if (d >= todayStart) groups.Today.push(n);
        else if (d >= yesterdayStart) groups.Yesterday.push(n);
        else groups.Older.push(n);
    });

    return (
        <>
            {Object.entries(groups).map(([label, items]) =>
                items.length > 0 ? (
                    <div key={label}>
                        <div className="px-4 py-2 sticky top-0 bg-[#0d1117]/90 backdrop-blur-sm z-10">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</p>
                        </div>
                        {items.map(n => (
                            <NotificationItem key={n.id} notification={n} onClick={() => onClickItem(n)} />
                        ))}
                    </div>
                ) : null
            )}
        </>
    );
};

// ── Single Notification Item ──────────────────────────────────────────────────
const NotificationItem = ({ notification: n, onClick }) => {
    const meta = getMeta(n.type);
    const Icon = meta.icon;

    // Build context preview text
    const getContextText = () => {
        if (n.content) return n.content;
        return meta.label;
    };

    // Navigate label based on type
    const getNavHint = () => {
        switch (n.type) {
            case 'like':
            case 'comment':
            case 'comment_reply':
            case 'retweet':
            case 'share':
                return '→ View post';
            case 'follow':
                return '→ View profile';
            case 'channel_request':
                return '→ View channel';
            default:
                return '→ Open';
        }
    };

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-white/4 active:bg-white/8 transition-colors group relative ${
                !n.isRead ? 'bg-signal-accent/4' : ''
            }`}
        >
            {/* Unread dot */}
            {!n.isRead && (
                <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-signal-accent" />
            )}

            {/* Avatar + icon */}
            <div className="relative shrink-0">
                <img
                    src={n.sender?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
                    alt={n.sender?.username}
                    className="w-11 h-11 rounded-full object-cover border border-white/10"
                />
                <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${meta.bg} rounded-full flex items-center justify-center ring-2 ring-[#0d1117]`}>
                    <Icon className={`w-3 h-3 ${meta.color}`} />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-100 leading-snug">
                    <span className="font-bold text-white">{n.sender?.username || 'Someone'}</span>
                    {' '}
                    <span className="text-gray-300">{getContextText()}</span>
                </p>

                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-500">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                    <span className={`text-[10px] font-medium ${meta.color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                        {getNavHint()}
                    </span>
                </div>

                {/* Post preview if available */}
                {n.postPreview && (
                    <div className="mt-1.5 px-2 py-1.5 bg-white/5 rounded-lg border border-white/8 text-xs text-gray-400 truncate">
                        {n.postPreview}
                    </div>
                )}
            </div>

            {/* Arrow indicator */}
            <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </div>
        </button>
    );
};

export default NotificationPanel;
