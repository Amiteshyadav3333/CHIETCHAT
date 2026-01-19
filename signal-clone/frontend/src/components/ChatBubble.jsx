import React from 'react';
import { format } from 'date-fns';

import { LockClosedIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const ChatBubble = ({ message, isOwn, senderName }) => {
    const isEncryptedWarning = message.content.startsWith('🔒') || message.content.startsWith('⚠️');

    return (
        <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className={`max-w-[75%] md:max-w-[60%] px-4 py-3 rounded-2xl relative shadow-md transition-all ${isEncryptedWarning
                    ? 'bg-gray-800 text-gray-400 border border-gray-700'
                    : isOwn
                        ? 'bg-gradient-to-br from-signal-accent to-signal-accentHover text-white rounded-br-sm'
                        : 'bg-signal-input text-gray-100 rounded-bl-sm'
                }`}>

                {!isOwn && (
                    <p className={`text-xs font-bold mb-1 opacity-80 ${isEncryptedWarning ? 'text-gray-500' : 'text-blue-400'}`}>
                        {senderName}
                    </p>
                )}

                {message.type === 'image' ? (
                    <img src={message.content} alt="sent" className="rounded-lg max-h-60 object-cover shadow-sm" />
                ) : (
                    <div className="flex items-center gap-2">
                        {isEncryptedWarning && (
                            message.content.startsWith('⚠️')
                                ? <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
                                : <LockClosedIcon className="w-4 h-4" />
                        )}
                        <p className={`break-words text-sm md:text-base ${isEncryptedWarning ? 'italic text-xs' : ''}`}>
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
