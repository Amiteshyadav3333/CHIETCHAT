import React from 'react';
import { XMarkIcon, HeartIcon, ChatBubbleLeftIcon, UserPlusIcon, BellIcon } from '@heroicons/react/24/solid';
import { formatDistanceToNow } from 'date-fns';

const NotificationPanel = ({ notifications, onClose, onMarkRead }) => {
    const getIcon = (type) => {
        switch (type) {
            case 'like': return <HeartIcon className="w-5 h-5 text-red-500" />;
            case 'comment': return <ChatBubbleLeftIcon className="w-5 h-5 text-blue-500" />;
            case 'follow': return <UserPlusIcon className="w-5 h-5 text-green-500" />;
            default: return <BellIcon className="w-5 h-5 text-gray-400" />;
        }
    };

    return (
        <div className="absolute inset-y-0 left-0 w-full md:w-80 bg-[#111b21] z-[55] shadow-2xl border-r border-gray-800 flex flex-col animate-slide-right">
            <div className="p-4 bg-[#202c33] flex justify-between items-center border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <BellIcon className="w-6 h-6 text-signal-accent" />
                    <h2 className="text-lg font-bold text-white">Notifications</h2>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-700 rounded-lg">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
                        <BellIcon className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-sm">No notifications yet</p>
                        <p className="text-xs mt-1">Interactions on your reels and profile will appear here.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800/50">
                        {notifications.map((n) => (
                            <div 
                                key={n.id} 
                                className={`p-4 flex gap-3 hover:bg-[#202c33]/50 transition-colors cursor-pointer group ${!n.isRead ? 'bg-signal-accent/5' : ''}`}
                                onClick={() => onMarkRead(n.id)}
                            >
                                <div className="relative shrink-0">
                                    <img src={n.sender?.avatar} alt="" className="w-10 h-10 rounded-full border border-gray-700" />
                                    <div className="absolute -bottom-1 -right-1 bg-[#111b21] rounded-full p-0.5">
                                        {getIcon(n.type)}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                        <p className="text-sm text-gray-200 leading-tight">
                                            <span className="font-bold text-white">{n.sender?.username}</span> {n.content}
                                        </p>
                                        {!n.isRead && <div className="w-2 h-2 bg-signal-accent rounded-full shrink-0 mt-1" />}
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {notifications.length > 0 && (
                <div className="p-3 bg-[#202c33]/30 border-t border-gray-800">
                    <p className="text-[10px] text-center text-gray-500">Only showing recent 50 activities</p>
                </div>
            )}
        </div>
    );
};

export default NotificationPanel;
