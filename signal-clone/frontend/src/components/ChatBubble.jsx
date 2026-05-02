import React, { useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { TrashIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';

const ChatBubble = ({ message, isOwn, senderName, onDelete, senderAvatar, showAvatar }) => {
    const [showDelete, setShowDelete] = useState(false);
    const content = message.content || '';

    const renderContent = () => {
        if (message.type === 'image' || content.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return (
                <div className="relative">
                    <img
                        src={content}
                        alt="sent"
                        className="rounded-xl max-w-[260px] max-h-[300px] w-full object-cover cursor-pointer block"
                        onClick={() => window.open(content, '_blank')}
                    />
                </div>
            );
        }
        if (message.type === 'audio' || content.match(/\.(mp3|wav|m4a|aac|oga|webm)$/i)) {
            return (
                <div className="min-w-[200px]">
                    <audio controls src={content} className="w-full h-8 accent-blue-500" />
                </div>
            );
        }
        if (message.type === 'video' || content.match(/\.(mp4|webm|ogg)$/i)) {
            return (
                <video
                    controls
                    src={content}
                    className="rounded-xl max-w-[260px] max-h-[300px] w-full object-cover"
                />
            );
        }
        if (message.type === 'file') {
            const fileName = content.split('/').pop() || 'File';
            return (
                <a
                    href={content}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 min-w-[180px] group"
                >
                    <div className={`p-2 rounded-lg ${isOwn ? 'bg-white/20' : 'bg-blue-500/20'}`}>
                        <DocumentIcon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-white">{fileName}</p>
                        <p className="text-xs opacity-60">Tap to open</p>
                    </div>
                </a>
            );
        }
        return (
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{content}</p>
        );
    };

    const isMedia = ['image', 'video'].includes(message.type) ||
        content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg)$/i);

    const timestamp = (
        <span className={`text-[11px] select-none whitespace-nowrap ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
            {format(new Date(message.timestamp), 'HH:mm')}
        </span>
    );

    const ticks = isOwn && (
        <span className="text-blue-300 flex items-center">
            <CheckIcon className="w-3 h-3 -mr-1.5" />
            <CheckIcon className="w-3 h-3" />
        </span>
    );

    return (
        <div
            className={`flex items-end gap-2 w-full ${isOwn ? 'flex-row-reverse' : 'flex-row'} mb-1`}
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
        >
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
                {/* Sender name in group */}
                {!isOwn && senderName && showAvatar && (
                    <span className="text-xs font-semibold text-blue-400 ml-3 mb-0.5">{senderName}</span>
                )}

                <div className="relative group/bubble flex items-end gap-1">
                    {/* Delete button */}
                    {isOwn && showDelete && onDelete && (
                        <button
                            onClick={() => onDelete(message.id)}
                            className="opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-red-400 mb-1 flex-shrink-0"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}

                    {/* Bubble */}
                    <div className={`relative ${isMedia ? 'p-1' : 'px-3 py-2'} rounded-2xl shadow-sm
                        ${isOwn
                            ? 'bg-[#005c4b] text-white rounded-tr-sm'
                            : 'bg-[#202c33] text-gray-100 rounded-tl-sm'
                        }`}
                    >
                        {renderContent()}

                        {/* Timestamp + ticks */}
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

// Date separator like WhatsApp
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
