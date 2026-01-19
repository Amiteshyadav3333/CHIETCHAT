import React from 'react';

const ContactList = ({ chats, activeChat, onSelectChat }) => {
    return (
        <div className="flex flex-col overflow-y-auto h-full space-y-1">
            {chats.map(chat => (
                <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat)}
                    className={`flex items-center p-3 cursor-pointer rounded-lg transition-colors mx-2 ${activeChat?.id === chat.id
                            ? 'bg-signal-secondary'
                            : 'hover:bg-signal-secondary/50'
                        }`}
                >
                    <div className="relative">
                        <img
                            src={chat.avatar || `https://ui-avatars.com/api/?name=${chat.name}&background=random`}
                            alt={chat.name}
                            className="w-12 h-12 rounded-full object-cover"
                        />
                        {/* Online Indicator simulation */}
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-signal-bg"></div>
                    </div>

                    <div className="ml-3 flex-1 overflow-hidden">
                        <div className="flex justify-between items-baseline">
                            <h3 className="text-gray-100 font-semibold truncate">{chat.name}</h3>
                            {chat.lastMessage.timestamp && (
                                <span className="text-xs text-gray-500">
                                    {new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-400 truncate">
                            {chat.lastMessage.content}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ContactList;
