import React, { useState, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { TrashIcon, DocumentIcon, ArrowUturnLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';

const SWIPE_THRESHOLD = 60;

const ChatBubble = ({ message, isOwn, senderName, onDelete, senderAvatar, showAvatar, onReply, replyTo }) => {
    const [showDelete, setShowDelete] = useState(false);
    const [swipeX, setSwipeX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const touchStartX = useRef(null);
    const content = message.content || '';

    const handleDownload = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            const fileName = url.split('/').pop() || 'download';
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback: open in new tab
            window.open(url, '_blank');
        }
    };

    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
        setSwiping(true);
    };

    const handleTouchMove = (e) => {
        if (touchStartX.current === null) return;
        const diff = e.touches[0].clientX - touchStartX.current;
        // own messages: swipe left (negative), others: swipe right (positive)
        if (isOwn && diff < 0) setSwipeX(Math.max(diff, -SWIPE_THRESHOLD));
        else if (!isOwn && diff > 0) setSwipeX(Math.min(diff, SWIPE_THRESHOLD));
    };

    const handleTouchEnd = () => {
        if (Math.abs(swipeX) >= SWIPE_THRESHOLD - 5) {
            onReply && onReply(message);
        }
        setSwipeX(0);
        setSwiping(false);
        touchStartX.current = null;
    };

    const renderContent = (cnt, type) => {
        if (type === 'image' || cnt.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return (
                <div className="relative group/media">
                    <img
                        src={cnt}
                        alt="sent"
                        className="rounded-xl max-w-[260px] max-h-[300px] w-full object-cover cursor-pointer block"
                        onClick={() => window.open(cnt, '_blank')}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity"
                        title="Download Image"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        if (type === 'audio' || cnt.match(/\.(mp3|wav|m4a|aac|oga|webm)$/i)) {
            return (
                <div className="flex flex-col gap-1">
                    <audio controls src={cnt} className="w-full h-8 accent-blue-500 min-w-[200px]" />
                    <button
                        onClick={() => handleDownload(cnt)}
                        className="text-[10px] text-white/60 hover:text-white flex items-center gap-1 self-end px-1"
                    >
                        <ArrowDownTrayIcon className="w-3 h-3" /> Download
                    </button>
                </div>
            );
        }
        if (type === 'video' || cnt.match(/\.(mp4|webm|ogg)$/i)) {
            return (
                <div className="relative group/media">
                    <video controls src={cnt} className="rounded-xl max-w-[260px] max-h-[300px] w-full object-cover" />
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity"
                        title="Download Video"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        if (type === 'file') {
            const fileName = cnt.split('/').pop() || 'File';
            return (
                <div className="flex flex-col gap-1">
                    <a href={cnt} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-w-[180px]">
                        <div className={`p-2 rounded-lg ${isOwn ? 'bg-white/20' : 'bg-blue-500/20'}`}>
                            <DocumentIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-white">{fileName}</p>
                            <p className="text-xs opacity-60">Tap to open</p>
                        </div>
                    </a>
                    <button
                        onClick={() => handleDownload(cnt)}
                        className="text-[10px] text-white/60 hover:text-white flex items-center gap-1 self-end px-1"
                    >
                        <ArrowDownTrayIcon className="w-3 h-3" /> Download
                    </button>
                </div>
            );
        }
        if (type === 'poll') {
            try {
                const poll = JSON.parse(cnt);
                return (
                    <div className="flex flex-col gap-3 min-w-[220px] p-1">
                        <h4 className="font-bold text-sm text-white border-b border-white/10 pb-2">{poll.question}</h4>
                        <div className="space-y-2">
                            {poll.options.map((opt, i) => (
                                <button key={i} className="w-full bg-white/10 hover:bg-white/20 text-left px-3 py-2 rounded-lg text-xs transition-colors border border-white/5">
                                    {opt}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-white/40 italic">Tap an option to vote</p>
                    </div>
                );
            } catch { return <p className="italic text-xs opacity-60 text-red-400">Invalid poll data</p>; }
        }
        if (type === 'location' || type === 'live_location') {
            try {
                const loc = JSON.parse(cnt);
                const mapUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
                return (
                    <a href={mapUrl} target="_blank" rel="noreferrer" className="flex flex-col gap-2 min-w-[180px] group/loc">
                        <div className="bg-white/10 rounded-xl p-3 flex items-center gap-3 group-hover/loc:bg-white/20 transition-colors">
                            <div className={`p-2 ${type === 'live_location' ? 'bg-red-500/20 animate-pulse' : 'bg-green-500/20'} rounded-full`}>
                                <CheckIcon className={`w-6 h-6 ${type === 'live_location' ? 'text-red-500' : 'text-green-500'}`} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white">{type === 'live_location' ? 'Live Location' : 'Location'}</p>
                                <p className="text-[10px] text-white/60">Tap to view on Map</p>
                            </div>
                        </div>
                    </a>
                );
            } catch { return <p className="italic text-xs opacity-60 text-red-400">Invalid location data</p>; }
        }
        return <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{cnt}</p>;
    };

    const isMedia = ['image', 'video'].includes(message.type) ||
        content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg)$/i);

    const timestamp = (
        <span className={`text-[11px] select-none whitespace-nowrap ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
            {format(new Date(message.timestamp), 'HH:mm')}
        </span>
    );

    const ticks = isOwn && (
        <span className={`flex items-center ${message.status === 'read' ? 'text-[#53bdeb]' : 'text-gray-400'}`}>
            <CheckIcon className={`w-3 h-3 ${message.status === 'sent' ? '' : '-mr-1.5'}`} />
            {message.status !== 'sent' && <CheckIcon className="w-3 h-3" />}
        </span>
    );

    return (
        <div
            className={`flex items-end gap-2 w-full ${isOwn ? 'flex-row-reverse' : 'flex-row'} mb-1`}
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: `translateX(${swipeX}px)`,
                transition: swiping ? 'none' : 'transform 0.2s ease'
            }}
        >
            {/* Swipe reply icon */}
            {Math.abs(swipeX) > 20 && (
                <div className={`absolute ${isOwn ? 'right-2' : 'left-2'} flex items-center justify-center opacity-${Math.min(Math.round(Math.abs(swipeX) / SWIPE_THRESHOLD * 10) * 10, 100)}`}>
                    <ArrowUturnLeftIcon className="w-5 h-5 text-gray-400" />
                </div>
            )}

            {/* Avatar for others in group */}
            {!isOwn && (
                <div className="w-7 h-7 flex-shrink-0 mb-1">
                    {showAvatar && senderAvatar ? (
                        <img src={senderAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                        <div className="w-7 h-7" />
                    )}
                </div>
            )}

            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%] md:max-w-[60%]`}>
                {!isOwn && senderName && showAvatar && (
                    <span className="text-xs font-semibold text-blue-400 ml-3 mb-0.5">{senderName}</span>
                )}

                <div className="relative group/bubble flex items-end gap-1">
                    {/* Desktop reply button */}
                    <button
                        onClick={() => onReply && onReply(message)}
                        className={`opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-gray-300 mb-1 flex-shrink-0 ${isOwn ? 'order-first' : 'order-last'}`}
                    >
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                    </button>

                    {isOwn && showDelete && onDelete && (
                        <button
                            onClick={() => onDelete(message.id)}
                            className="opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-red-400 mb-1 flex-shrink-0"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}

                    <div className={`relative ${isMedia ? 'p-1' : 'px-3 py-2'} rounded-2xl shadow-sm
                        ${isOwn
                            ? 'bg-[#005c4b] text-white rounded-tr-sm'
                            : 'bg-[#202c33] text-gray-100 rounded-tl-sm'
                        }`}
                    >
                        {/* Reply preview */}
                        {replyTo && (
                            <div className={`mb-1 px-2 py-1 rounded-lg border-l-4 ${isOwn ? 'border-green-300 bg-white/10' : 'border-blue-400 bg-white/5'} text-xs text-gray-300 max-w-[220px]`}>
                                <p className="font-semibold text-blue-300 truncate">{replyTo.senderName || 'Message'}</p>
                                <p className="truncate opacity-80">
                                    {replyTo.type && replyTo.type !== 'text' ? `📎 ${replyTo.type}` : replyTo.content}
                                </p>
                            </div>
                        )}

                        {renderContent(content, message.type)}

                        <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMedia ? 'absolute bottom-2 right-2 bg-black/40 rounded-full px-1.5 py-0.5' : ''}`}>
                            {timestamp}
                            {ticks}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const DateSeparator = ({ date }) => {
    const label = isToday(new Date(date))
        ? 'Today'
        : isYesterday(new Date(date))
            ? 'Yesterday'
            : format(new Date(date), 'dd MMM yyyy');

    return (
        <div className="flex items-center justify-center my-3">
            <span className="bg-[#182229] text-gray-400 text-xs px-3 py-1 rounded-full shadow">
                {label}
            </span>
        </div>
    );
};

export default ChatBubble;
