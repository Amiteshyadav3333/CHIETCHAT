import React from 'react';
import { format } from 'date-fns';
import { AppLockOverlay, EditMessageModal, ForwardMessageModal, OfflineBanner } from '../../../components/HomeOverlays';
import DeleteChatModal from '../../../components/DeleteChatModal';
import EncryptionInfoModal from '../../../components/EncryptionInfoModal';
import { formatFileSize } from '../../../utils/mediaCompressor';
import { InformationCircleIcon, XMarkIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';

export const HomeModalsContainer = ({
    snapNotice,
    setSnapNotice,
    chats,
    setActiveChat,
    appLocked,
    unlockError,
    setUnlockPin,
    unlockApp,
    unlockPin,
    isOnline,
    editingMessage,
    setEditingMessage,
    editText,
    setEditText,
    submitEditMessage,
    forwardMessage,
    setForwardMessage,
    visibleActiveChat,
    handleForwardToChat,
    showLinkPhoneModal,
    setShowLinkPhoneModal,
    handleLinkPhone,
    linkPhone,
    setLinkPhone,
    linkPhoneError,
    linkingPhone,
    showSearchModal,
    setShowSearchModal,
    searchModalTab,
    setSearchModalTab,
    handleSearchUser,
    searchQuery,
    setSearchQuery,
    searchError,
    searchedUser,
    startChat,
    handleCreateGroup,
    newGroupName,
    setNewGroupName,
    newGroupIsPublic,
    setNewGroupIsPublic,
    handleSearchGroups,
    groupSearchQuery,
    setGroupSearchQuery,
    loadingGroups,
    discoveredGroups,
    handleJoinGroup,
    editNicknameChat,
    setEditNicknameChat,
    nicknameInput,
    setNicknameInput,
    saveNickname,
    uploadProgress,
    topInfoMessage,
    setTopInfoMessage,
    msgToDelete,
    setMsgToDelete,
    handleDeleteMessageConfirm,
    chatToDelete,
    setChatToDelete,
    handleDeleteChatConfirm,
    showEncryptionInfo,
    setShowEncryptionInfo,
    user,
    publicKey,
    appNavHidden,
    isMobile,
    navPeekOpen,
    setNavPeekOpen,
}) => {
    return (
        <>
            {snapNotice && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true">
                    <div className="w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-[#111b21] p-6 shadow-2xl">
                        <div className="text-5xl">👻</div>
                        <h2 className="mt-4 text-xl font-black text-yellow-300">{snapNotice.title}</h2>
                        <p className="mt-3 text-sm leading-6 text-gray-200">{snapNotice.message}</p>
                        <div className="mt-4 rounded-xl bg-yellow-400/10 p-3 text-xs leading-5 text-yellow-100">
                            Snap chat end hone ke 10 minutes baad session content sabhi users se hide hoga. System screenshot ko web browser 100% control nahi kar sakta.
                        </div>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const chat = chats.find(item => item.id === snapNotice.chatId);
                                    if (chat) setActiveChat(chat);
                                    setSnapNotice(null);
                                }}
                                className="flex-1 rounded-xl border border-yellow-400/40 py-3 text-sm font-bold text-yellow-200"
                            >
                                Open chat
                            </button>
                            <button
                                type="button"
                                onClick={() => setSnapNotice(null)}
                                className="flex-1 rounded-xl bg-yellow-400 py-3 text-sm font-black text-black"
                            >
                                I understand
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {appLocked && <AppLockOverlay error={unlockError} onPinChange={setUnlockPin} onSubmit={unlockApp} pin={unlockPin} />}
            {!isOnline && <OfflineBanner />}
            {editingMessage && <EditMessageModal onCancel={() => setEditingMessage(null)} onChange={setEditText} onSubmit={submitEditMessage} text={editText} />}
            {forwardMessage && <ForwardMessageModal activeChatId={visibleActiveChat?.id} chats={chats} message={forwardMessage} onClose={() => setForwardMessage(null)} onForward={handleForwardToChat} />}

            {showLinkPhoneModal && (
                <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/80 p-4">
                    <form onSubmit={handleLinkPhone} className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111b21] p-6 shadow-2xl">
                        <button type="button" onClick={() => setShowLinkPhoneModal(false)} className="float-right text-sm text-gray-400 hover:text-white">Close</button>
                        <div className="text-4xl">📱</div>
                        <h2 className="mt-4 text-xl font-black text-white">Link your number and find your friends</h2>
                        <p className="mt-2 text-sm leading-6 text-gray-400">Add your mobile number to discover friends and let them find you on CHEETCHAT.</p>
                        <input autoFocus value={linkPhone} onChange={event => setLinkPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" pattern="\d{10}" maxLength={10} placeholder="10-digit mobile number" className="mt-5 w-full rounded-xl border border-white/10 bg-[#202c33] px-4 py-3 text-white outline-none focus:border-[#00a884]" required />
                        {linkPhoneError && <p className="mt-2 text-sm text-red-400">{linkPhoneError}</p>}
                        <button type="submit" disabled={linkingPhone} className="mt-5 w-full rounded-xl bg-[#00a884] py-3 text-sm font-black text-white disabled:opacity-60">{linkingPhone ? 'Linking…' : 'Link number'}</button>
                    </form>
                </div>
            )}

            {showSearchModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-signal-secondary w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">CheetChat Search</h2>
                            <button onClick={() => setShowSearchModal(false)} className="text-gray-400 hover:text-white">Close</button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-700 mb-4 text-xs font-bold uppercase tracking-wider">
                            <button 
                                type="button"
                                onClick={() => setSearchModalTab('search_user')}
                                className={`flex-1 pb-2 border-b-2 text-center transition-colors ${searchModalTab === 'search_user' ? 'border-signal-accent text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                            >
                                Direct Chat
                            </button>
                            <button 
                                type="button"
                                onClick={() => setSearchModalTab('create_group')}
                                className={`flex-1 pb-2 border-b-2 text-center transition-colors ${searchModalTab === 'create_group' ? 'border-signal-accent text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                            >
                                Create Group
                            </button>
                            <button 
                                type="button"
                                onClick={() => setSearchModalTab('discover_groups')}
                                className={`flex-1 pb-2 border-b-2 text-center transition-colors ${searchModalTab === 'discover_groups' ? 'border-signal-accent text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                            >
                                Discover
                            </button>
                        </div>

                        {/* Direct Chat search */}
                        {searchModalTab === 'search_user' && (
                            <div>
                                <form onSubmit={handleSearchUser} className="mb-4">
                                    <label className="block text-xs text-gray-400 mb-1 ml-1">SEARCH BY PHONE NUMBER OR @USERID</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="9876543210 or @userid"
                                            className="flex-1 bg-signal-input border-none rounded-lg px-4 py-2 focus:ring-1 focus:ring-signal-accent outline-none text-white text-sm"
                                            autoFocus
                                        />
                                        <button type="submit" className="bg-signal-input hover:bg-gray-700 text-white px-4 rounded-lg font-bold text-sm">
                                            Search
                                        </button>
                                    </div>
                                </form>

                                {searchError && (
                                    <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm mb-4 text-center border border-red-500/20">
                                        {searchError}
                                    </div>
                                )}

                                {searchedUser && (
                                    <div className="bg-signal-input rounded-xl p-4 flex items-center justify-between animate-fade-in border border-signal-accent/30">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <img src={searchedUser.avatar} className="w-12 h-12 rounded-full object-cover" alt="" />
                                                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-signal-input ${searchedUser.isOnline ? 'bg-emerald-500' : 'bg-gray-500'}`} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-white">{searchedUser.username}</h3>
                                                {searchedUser.platformId && (
                                                    <p className="text-xs font-medium text-violet-400">@{searchedUser.platformId}</p>
                                                )}
                                                <p className="text-xs text-gray-500">ID: @{searchedUser.platformId || `user_${searchedUser.id}`}</p>
                                                {searchedUser.phone && <p className="text-xs text-gray-500">📞 {searchedUser.phone}</p>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={startChat}
                                            className="bg-signal-accent hover:bg-signal-accentHover text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg"
                                        >
                                            Chat
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Create Group Form */}
                        {searchModalTab === 'create_group' && (
                            <form onSubmit={handleCreateGroup} className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1 ml-1">GROUP NAME</label>
                                    <input
                                        type="text"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        placeholder="e.g. Developers Hub"
                                        className="w-full bg-signal-input border-none rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-signal-accent outline-none text-white text-sm"
                                        required
                                    />
                                </div>
                                
                                <div className="flex items-center justify-between p-3 bg-signal-input rounded-lg border border-gray-700">
                                    <div>
                                        <p className="text-sm font-semibold text-white">Public Group</p>
                                        <p className="text-xs text-gray-400">Anyone can join instantly</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setNewGroupIsPublic(v => !v)}
                                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${newGroupIsPublic ? 'bg-signal-accent' : 'bg-gray-600'}`}
                                    >
                                        <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow ${newGroupIsPublic ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-signal-accent hover:bg-signal-accentHover text-white py-2.5 rounded-xl font-bold shadow-lg text-sm transition-all"
                                >
                                    Create Group
                                </button>
                            </form>
                        )}

                        {/* Discover Groups */}
                        {searchModalTab === 'discover_groups' && (
                            <div className="flex flex-col max-h-[350px] overflow-hidden">
                                <form onSubmit={handleSearchGroups} className="mb-3 flex gap-2">
                                    <input
                                        type="text"
                                        value={groupSearchQuery}
                                        onChange={(e) => setGroupSearchQuery(e.target.value)}
                                        placeholder="Search groups by name..."
                                        className="flex-1 bg-signal-input border-none rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-signal-accent outline-none text-white text-sm"
                                    />
                                    <button type="submit" className="bg-signal-input hover:bg-gray-700 text-white px-3 rounded-lg text-xs font-bold">
                                        Search
                                    </button>
                                </form>

                                <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
                                    {loadingGroups ? (
                                        <p className="text-xs text-gray-400 text-center py-4">Loading groups...</p>
                                    ) : discoveredGroups.length === 0 ? (
                                        <p className="text-xs text-gray-400 text-center py-4">No groups found</p>
                                    ) : (
                                        discoveredGroups.map(group => (
                                            <div key={group.id} className="bg-signal-input rounded-xl p-3 flex items-center justify-between border border-gray-700/50">
                                                <div className="min-w-0 flex-1 pr-2">
                                                    <h4 className="font-bold text-sm text-white truncate">{group.name}</h4>
                                                    <p className="text-[11px] text-gray-400">
                                                        {group.membersCount || 0} members • {group.isPublic ? 'Public' : 'Private'}
                                                    </p>
                                                </div>
                                                {group.hasPendingRequest ? (
                                                    <span className="text-xs text-yellow-500 font-semibold italic bg-yellow-500/10 px-2 py-1 rounded">
                                                        Requested
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleJoinGroup(group)}
                                                        className="bg-signal-accent hover:bg-signal-accentHover text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow"
                                                    >
                                                        {group.isPublic ? 'Join' : 'Request'}
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Quick peek menu button */}
            {(appNavHidden || isMobile) && !navPeekOpen && (
                <button
                    onClick={() => setNavPeekOpen(true)}
                    className="fixed left-0 top-1/2 z-[70] -translate-y-1/2 rounded-r-2xl border border-l-0 border-gray-700 bg-[#111b21]/95 px-1.5 py-6 text-gray-300 shadow-2xl hover:text-white active:scale-95"
                    title="Show menu"
                >
                    <EllipsisVerticalIcon className="w-5 h-5" />
                </button>
            )}

            {/* Nickname Edit Modal */}
            {editNicknameChat && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setEditNicknameChat(null)}>
                    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f2c34] p-6 text-white shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-1">Edit Nickname</h3>
                        <p className="text-xs text-gray-400 mb-4">Set a custom name for this chat (saved on this device only).</p>
                        <input
                            type="text"
                            value={nicknameInput}
                            onChange={(e) => setNicknameInput(e.target.value)}
                            placeholder={editNicknameChat.name}
                            className="w-full bg-[#111b21] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-[#00a884] mb-4"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    saveNickname(editNicknameChat.id, nicknameInput.trim());
                                    setEditNicknameChat(null);
                                }
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            {nicknameInput && (
                                <button
                                    onClick={() => {
                                        saveNickname(editNicknameChat.id, '');
                                        setEditNicknameChat(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-white/5 mr-auto"
                                >
                                    Reset to Default
                                </button>
                            )}
                            <button
                                onClick={() => setEditNicknameChat(null)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    saveNickname(editNicknameChat.id, nicknameInput.trim());
                                    setEditNicknameChat(null);
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00a884] hover:bg-[#00a884]/80 text-white"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Progress Modal */}
            {uploadProgress && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center pb-8 px-4 pointer-events-none">
                    <div className="w-full max-w-sm bg-[#1f2c34] border border-white/10 rounded-2xl p-4 shadow-2xl pointer-events-auto animate-slide-up">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-full bg-[#25d366]/20 flex items-center justify-center flex-shrink-0">
                                {uploadProgress.percent < 55 ? (
                                    <svg viewBox="0 0 24 24" fill="#25d366" className="w-4 h-4 animate-spin">
                                        <path d="M12 2a10 10 0 1 0 10 10A10.016 10.016 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A8.008 8.008 0 0 1 4.07 11H6a1 1 0 0 0 0-2H4.07A8.008 8.008 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8.008 8.008 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8.008 8.008 0 0 1 13 16.93z" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="#25d366" className="w-4 h-4">
                                        <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
                                    </svg>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-semibold truncate">{uploadProgress.fileName}</p>
                                <p className="text-white/50 text-[10px] mt-0.5">{uploadProgress.stage}</p>
                            </div>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                            <div
                                className="h-full bg-gradient-to-r from-[#25d366] to-[#00c896] rounded-full transition-all duration-500"
                                style={{ width: `${uploadProgress.percent}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-white/40">Original: <span className="text-white/60">{formatFileSize(uploadProgress.originalSize)}</span></span>
                            {uploadProgress.compressedSize != null && uploadProgress.compressedSize !== uploadProgress.originalSize && (
                                <span className="text-green-400 font-semibold">
                                    ↓ Compressed: {formatFileSize(uploadProgress.compressedSize)} ({Math.round((1 - uploadProgress.compressedSize / uploadProgress.originalSize) * 100)}% saved)
                                </span>
                            )}
                            <span className="text-white/40">{uploadProgress.percent}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Message Info Modal */}
            {topInfoMessage && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
                    onClick={() => setTopInfoMessage(null)}
                >
                    <div 
                        className="w-full max-w-md overflow-hidden rounded-2xl bg-[#111b21] border border-white/10 shadow-2xl p-6 relative animate-scale-up text-white"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <InformationCircleIcon className="w-5 h-5 text-[#53bdeb]" />
                                Message Info (Last Message)
                            </h3>
                            <button 
                                onClick={() => setTopInfoMessage(null)}
                                className="p-1 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5 max-h-32 overflow-y-auto">
                                <p className="text-xs text-white/50 mb-1">Message Preview</p>
                                <p className="text-sm whitespace-pre-wrap break-words">
                                    {topInfoMessage.type === 'deleted' ? 'Deleted message' : topInfoMessage.content}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/60">Sent</span>
                                    </div>
                                    <span className="text-xs font-medium text-white/90">
                                        {topInfoMessage.timestamp ? format(new Date(topInfoMessage.timestamp), 'd MMM yyyy, HH:mm:ss') : 'N/A'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/60">Delivered</span>
                                    </div>
                                    <span className="text-xs font-medium text-white/90">
                                        {topInfoMessage.deliveredAt ? (
                                            format(new Date(topInfoMessage.deliveredAt), 'd MMM yyyy, HH:mm:ss')
                                        ) : (
                                            topInfoMessage.status === 'sent' ? (
                                                <span className="text-white/40">Pending</span>
                                            ) : (
                                                topInfoMessage.status === 'delivered' || topInfoMessage.status === 'read' ? 'Yes' : 'N/A'
                                            )
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/60">Seen / Read</span>
                                    </div>
                                    <span className="text-xs font-medium text-white/90">
                                        {topInfoMessage.readAt ? (
                                            <span className="text-[#53bdeb] font-semibold flex items-center gap-1">
                                                {format(new Date(topInfoMessage.readAt), 'd MMM yyyy, HH:mm:ss')}
                                            </span>
                                        ) : (
                                            <span className="text-white/40">Unread</span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setTopInfoMessage(null)}
                                className="px-4 py-2 bg-[#53bdeb] hover:bg-[#40a3ce] text-black font-semibold rounded-lg text-xs transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete message confirmation modal */}
            {msgToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setMsgToDelete(null)}>
                    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f2c34] p-6 text-white shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2">Delete message?</h3>
                        <p className="text-sm text-gray-400 mb-6">This action cannot be undone.</p>
                        <div className="flex flex-col gap-2">
                            {msgToDelete.senderId === user?.id && (
                                <button 
                                    onClick={() => handleDeleteMessageConfirm(msgToDelete.id, 'everyone')}
                                    className="w-full rounded-xl bg-red-600 hover:bg-red-500 py-3 text-sm font-semibold transition"
                                >
                                    Delete for everyone
                                </button>
                            )}
                            <button 
                                onClick={() => handleDeleteMessageConfirm(msgToDelete.id, 'me')}
                                className="w-full rounded-xl bg-white/10 hover:bg-white/15 py-3 text-sm font-semibold transition"
                            >
                                Delete for me
                            </button>
                            <button 
                                onClick={() => setMsgToDelete(null)}
                                className="w-full rounded-xl py-3 text-sm font-semibold text-gray-400 hover:text-white transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Chat Confirmation Modal */}
            <DeleteChatModal
                chat={chatToDelete ? { ...chats.find(chat => chat.id === chatToDelete), currentUserId: user?.id } : null}
                onClose={() => setChatToDelete(null)}
                onConfirm={scope => handleDeleteChatConfirm(chatToDelete, scope)}
            />

            {/* Verify Encryption Modal */}
            {showEncryptionInfo && visibleActiveChat && (
                <EncryptionInfoModal
                    chat={visibleActiveChat}
                    user={user}
                    publicKey={publicKey}
                    onClose={() => setShowEncryptionInfo(false)}
                />
            )}
        </>
    );
};
