import React from 'react';
import { format } from 'date-fns';

const ChatBubble = ({ message, isOwn, senderName }) => {
    return (
        <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className={`max-w-[70%] px-4 py-2 rounded-2xl relative ${isOwn ? 'bg-signal-accent text-white rounded-br-none' : 'bg-signal-input text-gray-200 rounded-bl-none'
                }`}>
                {!isOwn && (
                    <p className="text-xs text-signal-accent font-bold mb-1">{senderName}</p>
                )}

                {message.type === 'image' ? (
                    <img src={message.content} alt="sent" className="rounded-lg max-h-60" />
                ) : (
                    <p className="break-words text-sm md:text-base">{message.content}</p>
                )}

                <div className="text-[10px] text-right opacity-70 mt-1 flex justify-end gap-1">
                    <span>{format(new Date(message.timestamp), 'HH:mm')}</span>
                    {isOwn && <span>✓✓</span>}
                </div>
            </div>
        </div>
    );
};

export default ChatBubble;
