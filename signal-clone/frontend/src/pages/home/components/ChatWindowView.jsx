import React from 'react';
import ChatBubble, { ChatDrawingOverlay, DateSeparator, isChatOverlayDrawing } from '../../../components/ChatBubble';
import MessageInput from '../../../components/MessageInput';
import DrawStudio from '../../../components/DrawStudio';
import AvatarZoom from '../../../components/AvatarZoom';
import {
    ArrowLeftIcon, PhoneIcon, VideoCameraIcon, EllipsisVerticalIcon,
    XMarkIcon, MapPinIcon, InformationCircleIcon, ClipboardDocumentIcon,
    ForwardIcon, PencilSquareIcon, SparklesIcon, MagnifyingGlassIcon,
    LockClosedIcon, ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline';
import GroupCollaborationHub from '../../../components/collaboration/GroupCollaborationHub';

export const ChatWindowView = ({
    visibleActiveChat,
    activeChat,
    setActiveChat,
    showChatDraw,
    setShowChatDraw,
    drawSource,
    setDrawSource,
    liveLocationSharing,
    timeLeft,
    stopLiveLocation,
    formatTimeLeft,
    messages,
    messagesContainerRef,
    messagesEndRef,
    messageRefsMap,
    userScrolledUpRef,
    user,
    token,
    socket,
    openActiveChatInfo,
    getChatDisplayName,
    getOtherParticipant,
    formatLastSeen,
    smartSpaceButtonEnabled,
    setShowSmartSpace,
    showMessageSearch,
    setShowMessageSearch,
    messageSearchQuery,
    setMessageSearchQuery,
    startCall,
    showTopDropdown,
    setShowTopDropdown,
    aiEnabled,
    setAiEnabled,
    setSmartSpaceButtonEnabled,
    smartRepliesEnabled,
    setSmartRepliesEnabled,
    showTranslateEnabled,
    setShowTranslateEnabled,
    mutedChats,
    toggleMute,
    pinnedChats,
    togglePinChat,
    setShowEncryptionInfo,
    toggleArchive,
    setEditNicknameChat,
    setNicknameInput,
    nicknames,
    setShowInfoPanel,
    handleCopyMessage,
    setForwardMessage,
    showTopReactions,
    setShowTopReactions,
    handleReactMessage,
    handlePinMessage,
    openEditMessage,
    setTopInfoMessage,
    customWallpaper,
    hasCustomWallpaper,
    chatBackground,
    wallpaper,
    showBioBanner,
    setShowBioBanner,
    snapMode,
    handleDeleteMessage,
    setReplyTo,
    replyTo,
    handleTranslate,
    chatTranslationLang,
    setChatTranslationLang,
    handleMessagePhotoSticker,
    handlePlaceSticker,
    setPhotoReactionSource,
    photoReactionSource,
    setCameraOpenRequest,
    cameraOpenRequest,
    typingUsers,
    handleSendMessage,
    handleUpload,
    startLiveLocation,
    handleTyping,
    disappearingTtl,
    scheduleMessage,
}) => {
    const [showCollaborationHub, setShowCollaborationHub] = React.useState(false);

    if (!visibleActiveChat) {
        return (
            <div className="hidden md:flex flex-1 items-center justify-center flex-col text-gray-500">
                <h2 className="text-2xl font-bold mb-2">Welcome to CHEETCHAT</h2>
                <p>Select a chat or click + to start messaging.</p>
            </div>
        );
    }

    return (
        <div className={`relative h-full min-h-0 flex-1 flex-col overflow-hidden bg-black/50 ${activeChat ? 'flex' : 'hidden md:flex'}`}>
            {showChatDraw && (
                <DrawStudio
                    key={drawSource ? `${drawSource.type}-${drawSource.timestamp || drawSource.src}` : 'blank-draw'}
                    initialSource={drawSource}
                    inline
                    onClose={() => { setShowChatDraw(false); setDrawSource(null); }}
                    onSendDrawing={drawing => {
                        handleSendMessage(JSON.stringify({ ...drawing, presentation: drawSource ? 'card' : 'chat-overlay' }), 'drawing', null, disappearingTtl);
                        setShowChatDraw(false);
                        setDrawSource(null);
                    }}
                />
            )}

            {/* Live Location Sharing Banner */}
            {liveLocationSharing && liveLocationSharing.chatId === visibleActiveChat.id && (
                <div className="bg-signal-accent/20 px-4 py-2 flex justify-between items-center border-b border-signal-accent/30 animate-pulse">
                    <div className="flex items-center gap-2">
                        <MapPinIcon className="w-4 h-4 text-signal-accent" />
                        <span className="text-xs font-bold text-signal-accent">Sharing Live Location ({formatTimeLeft(timeLeft)})</span>
                    </div>
                    <button 
                        onClick={stopLiveLocation}
                        className="text-[10px] bg-red-500 text-white px-2 py-1 rounded font-bold hover:bg-red-600 transition-colors"
                    >
                        STOP SHARING
                    </button>
                </div>
            )}

            {/* Pinned Message Banner */}
            {(() => {
                const pinnedMsg = messages.find(m => m.isPinned);
                if (!pinnedMsg) return null;
                const scrollToPinned = () => {
                    const el = messageRefsMap.current[pinnedMsg.id];
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
                return (
                    <div
                        onClick={scrollToPinned}
                        className="flex items-center gap-3 px-4 py-2 cursor-pointer border-b border-yellow-500/20 hover:bg-yellow-500/5 transition-colors group"
                        style={{ background: 'linear-gradient(90deg, rgba(234,179,8,0.08) 0%, rgba(0,0,0,0) 100%)' }}
                        title="Click to go to pinned message"
                    >
                        <div className="flex-shrink-0 w-0.5 h-8 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-full" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                                📌 Pinned Message
                            </p>
                            <p className="text-xs text-gray-300 truncate">
                                {pinnedMsg.type && pinnedMsg.type !== 'text' ? `📎 ${pinnedMsg.type}` : (pinnedMsg.content || '...')}
                            </p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-yellow-400/50 group-hover:text-yellow-400 transition-colors flex-shrink-0">
                            <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z" clipRule="evenodd" />
                        </svg>
                    </div>
                );
            })()}

            {/* Chat Header */}
            <div className="h-16 bg-signal-bg border-b border-gray-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={openActiveChatInfo}>
                    <button onClick={(e) => { e.stopPropagation(); setActiveChat(null); localStorage.removeItem('activeChatId'); }} className="md:hidden p-2 -ml-2">
                        <ArrowLeftIcon className="w-6 h-6 text-gray-300" />
                    </button>
                    <AvatarZoom
                        src={visibleActiveChat.avatar || null}
                        name={visibleActiveChat.name}
                        size="w-10 h-10"
                    />
                    <div className="min-w-0">
                        <h3 className="font-bold text-sm md:text-base truncate">{getChatDisplayName(visibleActiveChat)}</h3>
                        {visibleActiveChat.isGroup ? (
                            <p className="truncate text-xs text-gray-500">{visibleActiveChat.participants?.length || 0} members</p>
                        ) : (() => {
                            const other = getOtherParticipant(visibleActiveChat);
                            return <p className={`truncate text-xs ${other?.isOnline ? 'text-emerald-400' : 'text-gray-500'}`}>
                                {other?.isOnline ? 'Online' : formatLastSeen(other?.lastSeen)}
                            </p>;
                        })()}
                    </div>
                </div>
                <div className="flex gap-3 text-signal-accent items-center relative">
                    {visibleActiveChat.isGroup && (
                        <button
                            onClick={() => setShowCollaborationHub(true)}
                            title="Workspace Hub (Tasks, Notes, Milestones)"
                            className="rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 p-1.5 text-emerald-400 hover:from-emerald-500/30 hover:to-cyan-500/30 transition shadow-sm"
                        >
                            <ClipboardDocumentCheckIcon className="w-5 h-5" />
                        </button>
                    )}
                    {smartSpaceButtonEnabled && (
                        <button onClick={() => { setShowTopDropdown(false); setShowSmartSpace(true); }} title="Open AI Smart Space" className="rounded-full bg-emerald-400/10 p-1.5 text-emerald-400 hover:bg-emerald-400/20">
                            <SparklesIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={() => setShowMessageSearch(v => !v)} title="Search messages"><MagnifyingGlassIcon className="w-6 h-6" /></button>
                    <button onClick={() => startCall('voice')} title="Voice Call"><PhoneIcon className="w-6 h-6" /></button>
                    <button onClick={() => startCall('video')} title="Video Call"><VideoCameraIcon className="w-6 h-6" /></button>
                    <div className="relative">
                        <button onClick={() => { setShowTopDropdown(v => !v); setShowTopReactions(false); }} className="text-gray-400 hover:text-white">
                            <EllipsisVerticalIcon className="w-6 h-6" />
                        </button>
                        {showTopDropdown && (() => {
                            const lastMessage = messages[messages.length - 1];
                            return (
                                <div className="absolute right-0 top-8 z-50 w-52 overflow-hidden rounded-xl bg-[#111b21] shadow-2xl border border-white/10 text-white text-xs">
                                    <button 
                                        onClick={() => {
                                            const newVal = !aiEnabled;
                                            setAiEnabled(newVal);
                                            localStorage.setItem('ai_grammar_fix_enabled', String(newVal));
                                        }} 
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span className="text-[#a78bfa]">✨</span>
                                        <span>{aiEnabled ? 'Disable AI Grammar' : 'Enable AI Grammar'}</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const next = !smartSpaceButtonEnabled;
                                            setSmartSpaceButtonEnabled(next);
                                            localStorage.setItem('smart_space_button_enabled', next ? '1' : '0');
                                            setShowTopDropdown(false);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span>🧠</span>
                                        <span>{smartSpaceButtonEnabled ? 'Hide AI Smart Space button' : 'Enable AI Smart Space button'}</span>
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const newVal = !smartRepliesEnabled;
                                            setSmartRepliesEnabled(newVal);
                                            localStorage.setItem('smart_replies_enabled', String(newVal));
                                        }} 
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span className="text-[#00a884]">💡</span>
                                        <span>{smartRepliesEnabled ? 'Disable Smart Replies' : 'Enable Smart Replies'}</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const newVal = !showTranslateEnabled;
                                            setShowTranslateEnabled(newVal);
                                            localStorage.setItem('translate_btn_enabled', String(newVal));
                                            setShowTopDropdown(false);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span className="text-[#53bdeb]">🌐</span>
                                        <span>{showTranslateEnabled ? 'Disable Translate Button' : 'Enable Translate Button'}</span>
                                    </button>
                                    <button
                                        onClick={() => { toggleMute(visibleActiveChat.id); setShowTopDropdown(false); }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span>{mutedChats.includes(visibleActiveChat.id) ? '🔔' : '🔕'}</span>
                                        <span>{mutedChats.includes(visibleActiveChat.id) ? 'Unmute Chat' : 'Mute Chat'}</span>
                                    </button>
                                    <button
                                        onClick={() => { togglePinChat(visibleActiveChat.id); setShowTopDropdown(false); }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span>📌</span>
                                        <span>{pinnedChats.includes(visibleActiveChat.id) ? 'Unpin Chat' : 'Pin Chat'}</span>
                                    </button>
                                    <button
                                        onClick={() => { setShowEncryptionInfo(true); setShowTopDropdown(false); }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <LockClosedIcon className="h-4 w-4 text-emerald-400" />
                                        <span>Verify end-to-end encryption</span>
                                    </button>
                                    <button
                                        onClick={() => { toggleArchive(visibleActiveChat.id); setActiveChat(null); setShowTopDropdown(false); }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span>📦</span>
                                        <span>Archive Chat</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditNicknameChat(visibleActiveChat);
                                            setNicknameInput(nicknames[visibleActiveChat.id] || '');
                                            setShowTopDropdown(false);
                                        }}
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                    >
                                        <span>✏️</span>
                                        <span>Edit Nickname</span>
                                    </button>
                                    <button 
                                        onClick={() => { setShowInfoPanel(true); setShowTopDropdown(false); }} 
                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10 border-t border-white/5"
                                    >
                                        <InformationCircleIcon className="w-4 h-4 text-[#53bdeb]" />
                                        <span>{visibleActiveChat.isGroup ? 'Group Info' : 'Contact Info'}</span>
                                    </button>
                                    {lastMessage ? (
                                        <>
                                            <div className="border-t border-white/5 my-1" />
                                            <div className="px-4 py-1.5 text-[10px] uppercase font-bold tracking-wider text-white/40">Last Message Actions</div>
                                            <button 
                                                onClick={() => { handleCopyMessage(lastMessage); setShowTopDropdown(false); }} 
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <ClipboardDocumentIcon className="w-4 h-4" />
                                                <span>Copy Last Message</span>
                                            </button>
                                            <button 
                                                onClick={() => { setForwardMessage(lastMessage); setShowTopDropdown(false); }} 
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <ForwardIcon className="w-4 h-4" />
                                                <span>Forward Last Message</span>
                                            </button>
                                            <button 
                                                onClick={() => { setShowTopReactions(v => !v); }} 
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <span>😊</span>
                                                <span>React to Last Message</span>
                                            </button>
                                            
                                            {showTopReactions && (
                                                <div className="flex gap-1 bg-black/40 p-1.5 justify-around border-t border-b border-white/5">
                                                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => {
                                                                handleReactMessage(lastMessage, emoji);
                                                                setShowTopReactions(false);
                                                                setShowTopDropdown(false);
                                                            }}
                                                            className="hover:scale-125 transition-transform text-sm"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <button 
                                                onClick={() => { handlePinMessage(lastMessage); setShowTopDropdown(false); }} 
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <span>📌</span>
                                                <span>{lastMessage.isPinned ? 'Unpin Last Message' : 'Pin Last Message'}</span>
                                            </button>
                                            
                                            {lastMessage.senderId === user?.id && lastMessage.type === 'text' && (
                                                <button 
                                                    onClick={() => { openEditMessage(lastMessage); setShowTopDropdown(false); }} 
                                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                                >
                                                    <PencilSquareIcon className="w-4 h-4" />
                                                    <span>Edit Last Message</span>
                                                </button>
                                            )}

                                            <button 
                                                onClick={() => { 
                                                    setTopInfoMessage(lastMessage);
                                                    setShowTopDropdown(false);
                                                }} 
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <InformationCircleIcon className="w-4 h-4" />
                                                <span>Last Message Info</span>
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {showMessageSearch && (
                <div className="flex items-center gap-2 border-b border-white/5 bg-[#202c33] px-4 py-2">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                    <input autoFocus value={messageSearchQuery} onChange={e => setMessageSearchQuery(e.target.value)} placeholder="Search text, links, images or documents…" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500" />
                    <span className="text-xs text-gray-500">{messages.filter(m => !messageSearchQuery || `${m.content || ''} ${m.type || ''}`.toLowerCase().includes(messageSearchQuery.toLowerCase())).length} found</span>
                    <button onClick={() => { setShowMessageSearch(false); setMessageSearchQuery(''); }}><XMarkIcon className="h-5 w-5 text-gray-400" /></button>
                </div>
            )}

            {/* Messages Area */}
            <div
                ref={messagesContainerRef}
                onScroll={event => {
                    const element = event.currentTarget;
                    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                    userScrolledUpRef.current = distanceFromBottom > 120;
                }}
                className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-0.5 ${localStorage.getItem('animated_theme') === '1' && !hasCustomWallpaper ? 'animated-chat-wallpaper' : ''}`}
                style={hasCustomWallpaper ? {
                    backgroundColor: '#0b141a',
                    backgroundImage: `url("${customWallpaper}")`,
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: 'cover'
                } : {
                    background: chatBackground,
                    backgroundSize: wallpaper === 'dots' ? '18px 18px' : undefined
                }}
            >
                {(() => {
                    const other = getOtherParticipant(visibleActiveChat);
                    const otherBio = other?.bio;
                    return otherBio && showBioBanner && (
                        <div className="sticky top-0 z-30 mb-2 flex items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/70 to-indigo-950/70 px-4 py-3 text-xs text-white shadow-lg backdrop-blur-md animate-slide-up">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
                                    ✨
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold mb-0.5">Note (24h Bio)</div>
                                    <p className="truncate text-white/95 font-medium italic">"{otherBio}"</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowBioBanner(false)}
                                className="shrink-0 p-1 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/5 transition"
                                title="Close"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })()}
                <button
                    type="button"
                    onClick={() => setShowEncryptionInfo(true)}
                    className="mx-auto mb-3 flex max-w-sm items-start gap-2 rounded-xl bg-[#182229]/90 px-4 py-2.5 text-left text-[11px] leading-4 text-amber-200 shadow-sm hover:bg-[#202c33]"
                    title="View encryption information"
                >
                    <LockClosedIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <span>Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to or share them. Tap to verify.</span>
                </button>
                {messages.filter(msg => (!snapMode || msg.snapMode) && (!messageSearchQuery || `${msg.content || ''} ${msg.type || ''}`.toLowerCase().includes(messageSearchQuery.toLowerCase()))).map((msg, idx, shownMessages) => {
                    if (msg.type === 'drawing' && isChatOverlayDrawing(msg.content)) {
                        return <ChatDrawingOverlay key={msg.id || idx} content={msg.content} messageId={msg.id} isOwn={msg.senderId === user.id} onDelete={() => handleDeleteMessage(msg)} />;
                    }
                    const prevMsg = shownMessages[idx - 1];
                    const currDate = new Date(msg.timestamp).toDateString();
                    const prevDate = prevMsg ? new Date(prevMsg.timestamp).toDateString() : null;
                    const showDate = currDate !== prevDate;
                    const prevSenderId = prevMsg?.senderId;
                    const showAvatar = msg.senderId !== user.id && prevSenderId !== msg.senderId;
                    const sender = visibleActiveChat.participants.find(p => p.id === msg.senderId);
                    const replyTarget = msg.replyToId
                        ? shownMessages.find(candidate => candidate.id === msg.replyToId)
                        : null;
                    const replySender = replyTarget
                        ? visibleActiveChat.participants.find(participant => participant.id === replyTarget.senderId)
                        : null;
                    const replyData = (msg.replyToId || msg.replySenderName === 'Status') ? {
                        content: replyTarget?.content || msg.replyContent || 'Message',
                        type: replyTarget?.type || msg.replyType || (msg.replySenderName === 'Status' ? 'status' : 'text'),
                        senderName: replySender?.username || msg.replySenderName || 'Message'
                    } : null;

                    return (
                        <React.Fragment key={msg.id || idx}>
                            {showDate && <DateSeparator date={msg.timestamp} />}
                            <div data-user-content ref={el => { if (msg.id) messageRefsMap.current[msg.id] = el; }}>
                                <ChatBubble
                                    message={{ ...msg, senderName: sender?.username }}
                                    isOwn={msg.senderId === user.id}
                                    senderName={visibleActiveChat.isGroup ? sender?.username : null}
                                    senderAvatar={sender?.avatar}
                                    showAvatar={showAvatar || prevSenderId !== msg.senderId}
                                    onDelete={handleDeleteMessage}
                                    onReply={(m) => setReplyTo({ ...m, senderName: sender?.username || 'You' })}
                                    onEdit={openEditMessage}
                                    onCopy={handleCopyMessage}
                                    onForward={setForwardMessage}
                                    onReact={handleReactMessage}
                                    onPin={handlePinMessage}
                                    replyTo={replyData}
                                    onTranslate={handleTranslate}
                                    chatId={visibleActiveChat.id}
                                    chatTranslationLang={chatTranslationLang}
                                    isLastMessage={idx === shownMessages.length - 1}
                                    socket={socket}
                                    token={token}
                                    currentUserId={user.id}
                                    gamePlayers={visibleActiveChat.participants}
                                    showTranslateBtn={showTranslateEnabled}
                                    onAnnotate={(source) => { setDrawSource(source); setShowChatDraw(true); }}
                                    onPhotoReply={(photoMessage) => {
                                        setReplyTo({ ...photoMessage, senderName: sender?.username || 'Photo' });
                                        setPhotoReactionSource({ src: photoMessage.content, type: photoMessage.type, senderName: sender?.username || 'Media' });
                                        setCameraOpenRequest(value => value + 1);
                                    }}
                                    onMakeSticker={handleMessagePhotoSticker}
                                    onPlaceSticker={handlePlaceSticker}
                                    snapMode={snapMode}
                                />
                            </div>
                        </React.Fragment>
                    );
                })}
                {Object.values(typingUsers[visibleActiveChat.id] || {}).length > 0 && (
                    <div className="ml-10 mt-2 inline-flex items-center gap-2 rounded-full bg-[#202c33] px-3 py-1 text-xs text-gray-300">
                        <span>{Object.values(typingUsers[visibleActiveChat.id]).join(', ')} typing</span>
                        <span className="flex gap-0.5">
                            <i className="h-1 w-1 rounded-full bg-gray-400 animate-bounce" />
                            <i className="h-1 w-1 rounded-full bg-gray-400 animate-bounce [animation-delay:120ms]" />
                            <i className="h-1 w-1 rounded-full bg-gray-400 animate-bounce [animation-delay:240ms]" />
                        </span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <MessageInput
                onSend={(text, type, ttl) => handleSendMessage(text, type, replyTo, ttl)}
                onUpload={handleUpload}
                onStartLiveLocation={durationMinutes => startLiveLocation(visibleActiveChat.id, durationMinutes)}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onTranslate={handleTranslate}
                chatId={visibleActiveChat.id}
                chatTranslationLang={chatTranslationLang}
                onChangeTranslationLang={setChatTranslationLang}
                onTyping={handleTyping}
                disappearingTtl={disappearingTtl}
                disabled={visibleActiveChat.isChatDisabled && visibleActiveChat.groupAdminId !== user?.id}
                placeholderOverride={visibleActiveChat.isChatDisabled && visibleActiveChat.groupAdminId !== user?.id ? "Only admins can send messages in this group" : ""}
                lastMessageText={messages.length > 0 && messages[messages.length - 1].senderId !== user?.id && (!messages[messages.length - 1].type || messages[messages.length - 1].type === 'text') ? messages[messages.length - 1].content : ''}
                showAiFeature={aiEnabled}
                showSmartReplies={smartRepliesEnabled}
                currentUserId={user?.id}
                gamePlayers={visibleActiveChat.participants}
                payeeId={getOtherParticipant(visibleActiveChat)?.id}
                payeeName={getOtherParticipant(visibleActiveChat)?.username || visibleActiveChat.name}
                onSchedule={scheduleMessage}
                token={token}
                drawSource={drawSource}
                onDrawSourceConsumed={() => setDrawSource(null)}
                onOpenDraw={() => setShowChatDraw(true)}
                cameraOpenRequest={cameraOpenRequest}
                photoReactionSource={photoReactionSource}
                onPhotoReactionComplete={() => setPhotoReactionSource(null)}
            />

            {/* Workspace & Collaboration Hub Modal */}
            {showCollaborationHub && visibleActiveChat.isGroup && (
                <GroupCollaborationHub
                    chat={visibleActiveChat}
                    currentUser={user}
                    token={token}
                    socket={socket}
                    onClose={() => setShowCollaborationHub(false)}
                    onShareToChat={(text) => {
                        if (handleSendMessage) {
                            handleSendMessage(text);
                        }
                    }}
                />
            )}
        </div>
    );
};
