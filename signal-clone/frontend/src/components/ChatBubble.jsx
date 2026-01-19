import React from 'react';
import { format } from 'date-fns';

import { LockClosedIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const ChatBubble = ({ message, isOwn, senderName }) => {
    return (
        <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className={`max-w-[75%] md:max-w-[60%] w-fit px-4 py-3 rounded-2xl relative shadow-md transition-all ${isOwn
                ? 'bg-gradient-to-br from-signal-accent to-signal-accentHover text-white rounded-br-sm'
                : 'bg-signal-input text-gray-100 rounded-bl-sm'
                }`}>

                {!isOwn && (
                    <p className="text-xs font-bold mb-1 opacity-80 text-blue-400">
                        {senderName}
                    </p>
                )}

                {message.type === 'image' || message.content.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img src={message.content} alt="sent" className="rounded-lg max-h-60 object-cover shadow-sm cursor-pointer" onClick={() => window.open(message.content, '_blank')} />
                ) : message.type === 'video' || message.content.match(/\.(mp4|webm|ogg)$/i) ? (
                    <video controls src={message.content} className="rounded-lg max-h-60 shadow-sm" />
                ) : message.type === 'file' || message.content.startsWith('http') ? (
                    <a href={message.content} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-300 hover:text-blue-100 underline decoration-dotted">
                        📎 Attachment
                    </a>
                ) : (
                    <div className="flex items-center gap-2">
                        <p className="break-words text-sm md:text-base">
                            {message.content}
                        </p>
                    </div>
                )}

                <div className="text-[10px] text-right opacity-60 mt-1 flex justify-end gap-1">
                    <span>{format(new Date(message.timestamp), 'HH:mm')}</span>
                    {isOwn && <span>✓✓</span>}
                </div>
            </div>
        </div>
    );
};

export default ChatBubble;
