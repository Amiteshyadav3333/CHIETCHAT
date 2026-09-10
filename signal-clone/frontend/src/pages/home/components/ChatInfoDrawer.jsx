import React from 'react';
import TelegramGroupInfo from '../../../components/TelegramGroupInfo';
import UserAvatar from '../../../components/UserAvatar';
import ChatPreferences from '../../../components/ChatPreferences';
import { XMarkIcon, TrashIcon, NoSymbolIcon } from '@heroicons/react/24/outline';

export const ChatInfoDrawer = ({
    showInfoPanel,
    setShowInfoPanel,
    visibleActiveChat,
    user,
    token,
    messages,
    groupRequests,
    handleRespondRequest,
    handleToggleMuteGroup,
    handleDeleteChat,
    setChats,
    setActiveChat,
    wallpaper,
    setWallpaper,
    disappearingTtl,
    updateDisappearingTtl,
    setShowChatDraw,
    snapMode,
    updateSnapMode,
    getOtherParticipant,
    blockedUsers,
    handleBlockUser,
    handleUnblockUser,
    contactBusinessInfo,
    contactDpInputRef,
    handleContactDpChange,
    resetContactDp,
    formatLastSeen,
}) => {
    if (!showInfoPanel || !visibleActiveChat) return null;

    if (visibleActiveChat.isGroup) {
        const isAdmin = visibleActiveChat.groupAdminId === user?.id;
        return (
            <TelegramGroupInfo
                chat={visibleActiveChat}
                user={user}
                token={token}
                messages={messages}
                requests={groupRequests}
                onRespondRequest={handleRespondRequest}
                onClose={() => setShowInfoPanel(false)}
                onTogglePosting={handleToggleMuteGroup}
                onDelete={() => { setShowInfoPanel(false); handleDeleteChat(visibleActiveChat.id); }}
                onUpdated={(settings) => {
                    setChats(prev => prev.map(item => item.id === visibleActiveChat.id ? { ...item, ...settings } : item));
                    setActiveChat(prev => prev?.id === visibleActiveChat.id ? { ...prev, ...settings } : prev);
                }}
            />
        );
    }

    const other = getOtherParticipant(visibleActiveChat);
    const isBlocked = other && blockedUsers.includes(other.id);

    return (
        <div className="absolute inset-0 z-40 bg-black/70 flex justify-end" onClick={() => setShowInfoPanel(false)}>
            <div className="w-80 bg-[#111b21] h-full flex flex-col shadow-2xl animate-slide-left" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 p-4 border-b border-gray-800">
                    <button onClick={() => setShowInfoPanel(false)} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                    <h2 className="text-white font-bold text-lg">Contact Info</h2>
                </div>
                <div className="flex flex-col items-center py-6 gap-2 border-b border-gray-800">
                    <UserAvatar
                        src={visibleActiveChat.avatar || other?.avatar}
                        name={visibleActiveChat.name || other?.username}
                        className="w-24 h-24 rounded-full object-cover border-2 border-gray-700"
                        alt=""
                    />
                    <h3 className="text-white font-bold text-xl">{other?.username || visibleActiveChat.name}</h3>
                    {other && <p className="text-violet-400 text-sm font-semibold">@{other.platformId || `user_${other.id}`}</p>}
                    {other?.phone && <p className="text-gray-400 text-sm">📞 {other.phone}</p>}
                    <p className={`text-xs ${other?.isOnline ? 'text-green-500' : 'text-gray-500'}`}>
                        {other?.isOnline ? 'Online' : formatLastSeen(other?.lastSeen)}
                    </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" style={{ scrollbarWidth: 'thin' }}>
                    <div className="flex flex-col gap-1">
                        {other && (
                            <div className="mb-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                                <div className="flex items-center gap-3">
                                    <img
                                        src={visibleActiveChat.myAvatarForContact || user?.avatar}
                                        className="h-12 w-12 rounded-full border-2 border-violet-400 object-cover"
                                        alt="Your DP for this contact"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-white">Your DP for {other.username}</p>
                                        <p className="text-[11px] text-gray-400">
                                            {visibleActiveChat.hasCustomAvatarForContact ? 'Only this contact sees this DP' : 'Using your default profile DP'}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <button onClick={() => contactDpInputRef.current?.click()} className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">
                                        {visibleActiveChat.hasCustomAvatarForContact ? 'Change special DP' : 'Set special DP'}
                                    </button>
                                    {visibleActiveChat.hasCustomAvatarForContact && (
                                        <button onClick={() => resetContactDp(other.id)} className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5">
                                            Use default
                                        </button>
                                    )}
                                </div>
                                <input ref={contactDpInputRef} type="file" accept="image/*" className="hidden" onChange={event => handleContactDpChange(event, other.id)} />
                            </div>
                        )}
                        {contactBusinessInfo?.business?.businessName && (
                            <div className="mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold text-white">{contactBusinessInfo.business.businessName}</p>
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[9px] font-bold uppercase text-emerald-300">Business</span>
                                </div>
                                <p className="mt-1 text-xs text-emerald-300">{contactBusinessInfo.business.category}</p>
                                <p className="mt-2 text-xs leading-5 text-gray-400">{contactBusinessInfo.business.description}</p>
                                {contactBusinessInfo.business.openingHours && <p className="mt-2 text-[11px] text-gray-400">🕘 {contactBusinessInfo.business.openingHours}</p>}
                                {contactBusinessInfo.business.address && <p className="mt-1 text-[11px] text-gray-400">📍 {contactBusinessInfo.business.address}</p>}
                                {!!contactBusinessInfo.products?.length && <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Catalog ({contactBusinessInfo.products.length})</p>}
                                <div className="mt-2 space-y-2">
                                    {contactBusinessInfo.products?.map(product => (
                                        <div key={product.id} className="flex items-center gap-2 rounded-lg bg-black/20 p-2">
                                            {product.imageUrl && <img src={product.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold text-white">{product.name}</p>
                                                <p className="text-[11px] text-emerald-300">₹{Number(product.price).toFixed(2)} · {product.inStock ? 'In stock' : 'Out of stock'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <ChatPreferences
                            wallpaper={wallpaper}
                            onWallpaperChange={setWallpaper}
                            disappearingTtl={disappearingTtl}
                            onDisappearingChange={updateDisappearingTtl}
                            chatId={visibleActiveChat.id}
                            onOpenDraw={() => { setShowInfoPanel(false); setShowChatDraw(true); }}
                            snapMode={snapMode}
                            onSnapModeChange={updateSnapMode}
                        />
                        {other && (
                            <button
                                onClick={() => isBlocked ? handleUnblockUser(other.id) : handleBlockUser(other.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isBlocked ? 'text-green-400 hover:bg-green-500/10' : 'text-red-400 hover:bg-red-500/10'}`}
                            >
                                <NoSymbolIcon className="w-5 h-5" />
                                {isBlocked ? `Unblock ${other.username}` : `Block ${other.username}`}
                            </button>
                        )}
                        {other && (
                            <button
                                onClick={() => alert(`Report submitted for ${other.username}. Our moderation team will review this chat.`)}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                            >
                                <NoSymbolIcon className="w-5 h-5" />
                                Report User
                            </button>
                        )}
                        <button
                            onClick={() => { setShowInfoPanel(false); handleDeleteChat(visibleActiveChat.id); }}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <TrashIcon className="w-5 h-5" />
                            Delete Chat
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
