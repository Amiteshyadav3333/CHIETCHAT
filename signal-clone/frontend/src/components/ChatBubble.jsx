import React, { useState } from 'react';
import { format } from 'date-fns';
import { TrashIcon } from '@heroicons/react/24/outline';

const ChatBubble = ({ message, isOwn, senderName, onDelete }) => {
    const [showDelete, setShowDelete] = useState(false);

    const content = message.content || '';

    const renderContent = () => {
        if (message.type === 'image' || content.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return <img src={content} alt="sent" className="rounded-lg max-h-60 object-cover shadow-sm cursor-pointer" onClick={() => window.open(content, '_blank')} />;
        }
        if (message.type === 'audio' || content.match(/\.(mp3|wav|m4a|aac|oga|webm)$/i)) {
            return <audio controls src={content} className="max-w-full" />;
        }
        if (message.type === 'video' || content.match(/\.(mp4|webm|ogg)$/i)) {
            return <video controls src={content} className="rounded-lg max-h-60 shadow-sm" />;
        }
        if (message.type === 'file' || (content.startsWith('http') && !message.type === 'text')) {
            return (
                <a href={content} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-300 hover:text-blue-100 underline decoration-dotted">
                    📎 Attachment
                </a>
            );
        }
        return <p className="break-words text-sm md:text-base">{content}</p>;
    };

    return (
        <div
            className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} mb-2 group`}
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
        >
            <div className="flex items-end gap-1">
                {isOwn && showDelete && onDelete && (
                    <button
                        onClick={() => onDelete(message.id)}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors mb-1"
                        title="Delete message"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}

                <div className={`max-w-[85%] md:max-w-[60%] w-fit px-4 py-3 rounded-2xl relative shadow-md transition-all ${isOwn
                    ? 'bg-gradient-to-br from-signal-accent to-signal-accentHover text-white rounded-br-sm'
                    : 'bg-signal-input text-gray-100 rounded-bl-sm'
                    }`}>

                    {!isOwn && (
                        <p className="text-xs font-bold mb-1 opacity-80 text-blue-400">{senderName}</p>
                    )}

                    {renderContent()}

                    <div className="text-[10px] text-right opacity-60 mt-1 flex justify-end gap-1">
                        <span>{format(new Date(message.timestamp), 'HH:mm')}</span>
                        {isOwn && <span>✓✓</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatBubble;
