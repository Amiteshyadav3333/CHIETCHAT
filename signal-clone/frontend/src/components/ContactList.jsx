import React from 'react';
import AvatarZoom from './AvatarZoom';

const ContactList = ({ chats, activeChat, onSelectChat, loading, nicknames = {}, mutedChats = [], pinnedChats = [] }) => {
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                Loading chats...
            </div>
        );
    }

    const getLastMsgPreview = (chat) => {
        const c = chat.lastMessage?.content || '';
        const t = chat.lastMessage?.type;
        if (!c) return 'Tap to open chat';
        if (t === 'image') return '📷 Photo';
        if (t === 'video') return '🎥 Video';
        if (t === 'audio') return '🎵 Voice message';
        if (t === 'file') return '📎 File';
        if (t === 'location' || t === 'live_location') return '📍 Location';
        if (t === 'gif') return '🎞️ GIF';
        if (t === 'sticker') return '🎭 Sticker';
        if (t === 'poll') return '📊 Poll';
        if (t === 'gift') return '🎁 Gift';
        if (t === 'deleted') return '🚫 This message was deleted';
        return c.length > 40 ? c.slice(0, 40) + '…' : c;
    };

    return (
        <div className="flex flex-col overflow-y-auto h-full">
            {chats.map(chat => {
                const displayName = nicknames[chat.id] || chat.name;
                const isMuted = mutedChats.includes(chat.id);
                const isPinned = pinnedChats.includes(chat.id);
                const isOnline = chat.participants?.some(p => p.username === chat.name && p.isOnline);

                return (
                    <div
                        key={chat.id}
                        onClick={() => onSelectChat(chat)}
                        className={`flex items-center px-3 py-3 cursor-pointer transition-colors mx-1 rounded-xl ${
                            activeChat?.id === chat.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
                        }`}
                    >
                        <div className="relative flex-shrink-0">
                            <AvatarZoom src={chat.avatar || null} name={chat.name} size="w-12 h-12" />
                            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#111b21] ${isOnline ? 'bg-green-500' : 'bg-gray-600'}`} />
                        </div>

                        <div className="ml-3 flex-1 min-w-0">
                            <div className="flex justify-between items-center gap-1">
                                <div className="flex items-center gap-1 min-w-0">
                                    {isPinned && <span className="text-[10px] text-[#00a884] flex-shrink-0">📌</span>}
                                    <h3 className="text-gray-100 font-semibold truncate text-sm">{displayName}</h3>
                                    {isMuted && <span className="text-[10px] text-gray-500 flex-shrink-0">🔇</span>}
                                </div>
                                {chat.lastMessage?.timestamp && (
                                    <span className="text-[11px] text-gray-500 flex-shrink-0">
                                        {new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                                {getLastMsgPreview(chat)}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ContactList;
