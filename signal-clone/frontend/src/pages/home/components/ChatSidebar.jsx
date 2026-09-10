import React from 'react';
import AvatarZoom from '../../../components/AvatarZoom';
import ContactList from '../../../components/ContactList';
import StatusSection from '../../../components/StatusSection';
import SidebarEmojiPicker from '../../../components/SidebarEmojiPicker';
import { PlusIcon, FaceSmileIcon } from '@heroicons/react/24/outline';
import { MobileBottomNavigation } from './HomeNavigationRail';

export const ChatSidebar = ({
    activeChat,
    setActiveChat,
    user,
    token,
    openNewChat,
    avatarInputRef,
    handleAvatarChange,
    handleDeleteAvatar,
    sidebarSearchQuery,
    setSidebarSearchQuery,
    showSidebarEmoji,
    setShowSidebarEmoji,
    sidebarEmojiPickerRef,
    handleStatusGroupsChange,
    storyUserIds,
    isMobile,
    mobileHomeTab,
    setMobileHomeTab,
    archivedChatsList,
    filteredChats,
    loadingChats,
    showArchive,
    setShowArchive,
    nicknames,
    mutedChats,
    pinnedChats,
    totalUnreadMessages,
    startCallForChat,
}) => {
    return (
        <div className={`h-full min-h-0 w-full overflow-hidden md:w-[360px] lg:w-[390px] border-r border-gray-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
            {/* Header */}
            <div className="p-4 bg-signal-secondary flex justify-between items-center shadow-md z-10">
                <div className="flex items-center gap-3">
                    <div className="relative group cursor-pointer" title="Change profile photo">
                        <AvatarZoom src={user?.avatar} name={user?.username} size="w-10 h-10" />
                        <div className="absolute inset-0 hidden group-hover:flex flex-col items-center justify-center rounded-full bg-black/70 z-10 cursor-pointer gap-0.5">
                            <span onClick={() => avatarInputRef.current?.click()} className="text-[9px] text-white leading-tight">Edit</span>
                            {user?.avatar && !user.avatar.includes('dicebear') && (
                                <span onClick={handleDeleteAvatar} className="text-[9px] text-red-400 leading-tight">Delete</span>
                            )}
                        </div>
                    </div>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                    />
                    <div>
                        <h2 className="font-bold">{user?.username}</h2>
                        <p className="text-xs text-green-500">Online</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={openNewChat}
                        className="p-2 hover:bg-gray-700/55 rounded-full text-signal-accent transition-colors" 
                        title="New Chat"
                    >
                        <PlusIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* WhatsApp-style Sidebar Search */}
            <div className="px-3 py-2 bg-[#111b21] flex items-center gap-2">
                <div className="relative flex-1 flex items-center">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.604 10.604Z" />
                        </svg>
                    </span>

                    <input
                        type="text"
                        value={sidebarSearchQuery}
                        onChange={(e) => setSidebarSearchQuery(e.target.value)}
                        placeholder="Search or start new chat..."
                        className="w-full bg-[#202c33] text-sm text-white placeholder-gray-500 rounded-lg pl-9 pr-10 py-[9px] outline-none focus:ring-1 focus:ring-[#00a884]/60 border-none transition-all"
                    />

                    {sidebarSearchQuery && (
                        <button
                            onClick={() => setSidebarSearchQuery('')}
                            className="absolute right-9 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                            title="Clear"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    <button
                        id="sidebar-emoji-btn"
                        type="button"
                        onClick={() => setShowSidebarEmoji(v => !v)}
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition-all rounded-full p-0.5 ${showSidebarEmoji ? 'text-[#00a884]' : 'text-gray-400 hover:text-[#00a884]'}`}
                        title="Emoji"
                    >
                        <FaceSmileIcon className="w-5 h-5" />
                    </button>
                </div>

                {showSidebarEmoji && (
                    <SidebarEmojiPicker
                        pickerRef={sidebarEmojiPickerRef}
                        onPick={(emoji) => {
                            setSidebarSearchQuery(prev => prev + emoji);
                            setShowSidebarEmoji(false);
                        }}
                    />
                )}
            </div>

            {/* Stories stay above chats on desktop */}
            <div className="hidden md:block">
                <StatusSection user={user} token={token} onStatusGroupsChange={handleStatusGroupsChange} />
            </div>

            {/* Archive toggle button */}
            {(!isMobile || mobileHomeTab === 'chats') && archivedChatsList.length > 0 && (
                <button
                    onClick={() => setShowArchive(v => !v)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                    <span>📦</span>
                    <span className="font-semibold">{showArchive ? 'Hide Archived' : `Archived (${archivedChatsList.length})`}</span>
                </button>
            )}

            {/* Contact list by view mode */}
            {isMobile && mobileHomeTab === 'stories' ? (
                <StatusSection
                    user={user}
                    token={token}
                    onStatusGroupsChange={handleStatusGroupsChange}
                    mobileFull
                />
            ) : isMobile && mobileHomeTab === 'calls' ? (
                <ContactList
                    chats={filteredChats}
                    activeChat={activeChat}
                    onSelectChat={setActiveChat}
                    loading={loadingChats}
                    currentUserId={user?.id}
                    storyUserIds={storyUserIds}
                    callsMode
                    onVoiceCall={(chat) => startCallForChat(chat, 'voice')}
                    onVideoCall={(chat) => startCallForChat(chat, 'video')}
                />
            ) : showArchive ? (
                <ContactList
                    chats={archivedChatsList}
                    activeChat={activeChat}
                    onSelectChat={(chat) => { setActiveChat(chat); setShowArchive(false); }}
                    loading={false}
                    nicknames={nicknames}
                    mutedChats={mutedChats}
                    pinnedChats={pinnedChats}
                    currentUserId={user?.id}
                    storyUserIds={storyUserIds}
                />
            ) : (
                <ContactList
                    chats={isMobile && mobileHomeTab === 'groups' ? filteredChats.filter(chat => chat.isGroup) : filteredChats}
                    activeChat={activeChat}
                    onSelectChat={setActiveChat}
                    loading={loadingChats}
                    nicknames={nicknames}
                    mutedChats={mutedChats}
                    pinnedChats={pinnedChats}
                    currentUserId={user?.id}
                    storyUserIds={storyUserIds}
                />
            )}

            {/* Phone bottom navigation */}
            <MobileBottomNavigation
                mobileHomeTab={mobileHomeTab}
                setMobileHomeTab={setMobileHomeTab}
                totalUnreadMessages={totalUnreadMessages}
                setShowArchive={setShowArchive}
            />
        </div>
    );
};
