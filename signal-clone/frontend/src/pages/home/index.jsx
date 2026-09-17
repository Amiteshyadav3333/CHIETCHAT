import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import { SocketContext } from '../../context/SocketContext';
import { useEncryption } from '../../hooks/useEncryption';
import {
    assertPinnedPublicKey, decryptEnvelope, decryptMediaDescriptor,
    encryptForRecipients, encryptMediaForRecipients,
    isEncryptedMediaDescriptor, isEncryptedPayload
} from '../../utils/encryption';
import { compressImage, compressVideo, getFileCategory } from '../../utils/mediaCompressor';
import { enqueueOfflineMessage, processOfflineQueue } from '../../utils/offlineQueue';
import {
    clearEncryptedMessageCache, loadEncryptedMessages, purgeLegacyMessageCaches,
    removeEncryptedMessage, saveEncryptedMessages, updateEncryptedMessageContent,
    upsertEncryptedMessage
} from '../../utils/encryptedMessageCache';
import { loadChatMetadata, saveChatMetadata } from '../../utils/chatMetadataCache';
import { emitWithAcknowledgement } from '../../utils/socketAcknowledgement';
import { photoUrlToStickerFile } from '../../utils/photoSticker';
import { useScheduledMessageSender } from '../../features/chat';
import { applyLiveLocationUpdate, useLiveLocationSharing } from '../../features/location';
import { useRealtimeNotifications } from '../../features/notifications';
import { applyPollVoteUpdate } from '../../features/polls';
import { playMessageNotification } from '../../utils/customNotificationSounds';

import { useHomeNavigation } from './hooks/useHomeNavigation';
import { useChatPreferences } from './hooks/useChatPreferences';
import { useCallManager } from './hooks/useCallManager';
import { useGroupDetails } from './hooks/useGroupDetails';

import { HomeNavigationRail } from './components/HomeNavigationRail';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatWindowView } from './components/ChatWindowView';
import { ChatInfoDrawer } from './components/ChatInfoDrawer';
import { CallOverlayContainer } from './components/CallOverlayContainer';
import { FeatureOverlays } from './components/FeatureOverlays';
import { HomeModalsContainer } from './components/HomeModalsContainer';

import {
    ChatBubbleLeftRightIcon, PlayIcon, PhotoIcon,
    MicrophoneIcon, SparklesIcon, BellIcon, PlusIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline';

const readVideoDuration = (file) => new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        URL.revokeObjectURL(url);
        resolve(duration);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    video.src = url;
});

export const Home = () => {
    const { user, token, logout, updateUser } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);
    const { publicKey, privateKey } = useEncryption(user, token);

    const [chats, setChats] = useState(() => loadChatMetadata(user?.id));
    const [activeChat, setActiveChat] = useState(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [messages, setMessages] = useState(() => {
        purgeLegacyMessageCaches();
        return [];
    });
    const [loadingChats, setLoadingChats] = useState(() => !loadChatMetadata(user?.id).length);

    // Custom Hooks
    const nav = useHomeNavigation();
    const prefs = useChatPreferences(user);

    // Chat room specific states
    const [replyTo, setReplyTo] = useState(null);
    const [showInfoPanel, setShowInfoPanel] = useState(false);
    const [contactBusinessInfo, setContactBusinessInfo] = useState(null);
    const [appLocked, setAppLocked] = useState(() => localStorage.getItem('app_lock_enabled') === '1');
    const [unlockPin, setUnlockPin] = useState('');
    const [unlockError, setUnlockError] = useState('');
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
    const [showSidebarEmoji, setShowSidebarEmoji] = useState(false);
    const [storyUserIds, setStoryUserIds] = useState([]);

    // Search Modal States
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchedUser, setSearchedUser] = useState(null);
    const [searchError, setSearchError] = useState('');
    const [showLinkPhoneModal, setShowLinkPhoneModal] = useState(false);
    const [linkPhone, setLinkPhone] = useState('');
    const [linkPhoneError, setLinkPhoneError] = useState('');
    const [linkingPhone, setLinkingPhone] = useState(false);

    // Notifications
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    // Messaging extras
    const [chatTranslationLang, setChatTranslationLang] = useState('');
    const [typingUsers, setTypingUsers] = useState({});
    const [editingMessage, setEditingMessage] = useState(null);
    const [editText, setEditText] = useState('');
    const [forwardMessage, setForwardMessage] = useState(null);
    const [aiEnabled, setAiEnabled] = useState(localStorage.getItem('ai_grammar_fix_enabled') !== 'false');
    const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(localStorage.getItem('smart_replies_enabled') === 'true');
    const [msgToDelete, setMsgToDelete] = useState(null);
    const [chatToDelete, setChatToDelete] = useState(null);
    const [showBioBanner, setShowBioBanner] = useState(true);

    const [drawSource, setDrawSource] = useState(null);
    const [showChatDraw, setShowChatDraw] = useState(false);
    const [disappearingTtl, setDisappearingTtl] = useState(0);
    const [snapMode, setSnapMode] = useState(false);
    const [snapNotice, setSnapNotice] = useState(null);
    const [cameraOpenRequest, setCameraOpenRequest] = useState(0);
    const [photoReactionSource, setPhotoReactionSource] = useState(null);
    const [showTopDropdown, setShowTopDropdown] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [showTopReactions, setShowTopReactions] = useState(false);
    const [topInfoMessage, setTopInfoMessage] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [showEncryptionInfo, setShowEncryptionInfo] = useState(false);

    // Computed Chat State
    const visibleActiveChat = activeChat
        ? chats.find(chat => chat.id === activeChat.id) || activeChat
        : null;

    const filteredChats = chats
        .filter(chat => !prefs.archivedChats.includes(chat.id))
        .filter(chat => chat.name?.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
        .sort((a, b) => {
            const aPin = prefs.pinnedChats.includes(a.id) ? 1 : 0;
            const bPin = prefs.pinnedChats.includes(b.id) ? 1 : 0;
            return bPin - aPin;
        });

    const archivedChatsList = chats.filter(chat => prefs.archivedChats.includes(chat.id));
    const totalUnreadMessages = chats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0);

    // Refs
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const userScrolledUpRef = useRef(false);
    const avatarInputRef = useRef(null);
    const contactDpInputRef = useRef(null);
    const activeChatRef = useRef(activeChat);
    const chatsRef = useRef(chats);
    const messageRefsMap = useRef({});
    const sidebarEmojiPickerRef = useRef(null);
    const businessAutomationRef = useRef(null);

    // Decryption helpers
    const decryptMessageForCurrentUser = useCallback(async (message) => {
        if (!privateKey || !user) return message;
        const isEncrypted = isEncryptedPayload(message.content);
        if (!isEncrypted) return { ...message, encryptedContent: false };
        try {
            const decrypted = await decryptEnvelope(privateKey, user.id, message.content);
            let readableContent = decrypted;
            let encryptedMedia = false;
            if (isEncryptedMediaDescriptor(decrypted)) {
                readableContent = await decryptMediaDescriptor(privateKey, user.id, decrypted);
                encryptedMedia = true;
            }
            return { ...message, encryptedContent: true, encryptedMedia, content: readableContent };
        } catch (err) {
            console.error("Failed to decrypt message:", message.id, err);
            return { ...message, encryptedContent: true, content: "[Decryption failed]" };
        }
    }, [privateKey, user]);

    const decryptMessagesForCurrentUser = useCallback(async (incomingMessages) => {
        return Promise.all(incomingMessages.map(decryptMessageForCurrentUser));
    }, [decryptMessageForCurrentUser]);

    // Fetch chats
    const fetchChats = useCallback(async ({ restoreActive = false } = {}) => {
        if (!token) return [];
        try {
            const res = await axios.get('/api/chats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const normalizedChats = await Promise.all(res.data.map(async chat => {
                let lastMessageContent = chat.lastMessage.content;
                if (isEncryptedPayload(lastMessageContent)) {
                    lastMessageContent = privateKey && user
                        ? await decryptEnvelope(privateKey, user.id, lastMessageContent)
                        : 'Encrypted message';
                }
                return {
                    ...chat,
                    lastMessage: {
                        ...chat.lastMessage,
                        content: lastMessageContent
                    }
                };
            }));
            setChats(normalizedChats);
            if (restoreActive) {
                const savedChatId = localStorage.getItem('activeChatId');
                if (savedChatId) {
                    const found = normalizedChats.find(c => c.id === parseInt(savedChatId, 10));
                    if (found) setActiveChat(found);
                }
            }
            return normalizedChats;
        } catch (err) {
            console.error(err);
            return [];
        } finally {
            setLoadingChats(false);
        }
    }, [token, privateKey, user]);

    // Group Management Hook
    const groups = useGroupDetails({
        token,
        visibleActiveChat,
        fetchChats,
        setActiveChat,
        setChats,
        setShowSearchModal
    });

    // Call Manager Hook
    const calls = useCallManager({
        socket,
        user,
        chats,
        activeChat,
        setActiveChat,
        fetchChats
    });

    const scheduleMessage = useScheduledMessageSender({ chat: visibleActiveChat, userId: user?.id, publicKey, token });

    const receiveNotification = useCallback(notification => {
        setNotifications(previous => [notification, ...previous]);
        setUnreadCount(count => count + 1);
    }, []);
    useRealtimeNotifications({ socket, onNotification: receiveNotification });

    useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
    useEffect(() => { chatsRef.current = chats; }, [chats]);

    const handleStatusGroupsChange = useCallback((statusGroups) => {
        setStoryUserIds(statusGroups.map(group => group.user?.id).filter(Boolean));
    }, []);

    // Outside click for sidebar emoji picker
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (showSidebarEmoji && sidebarEmojiPickerRef.current && !sidebarEmojiPickerRef.current.contains(e.target)) {
                const emojiBtn = document.getElementById('sidebar-emoji-btn');
                if (!emojiBtn || !emojiBtn.contains(e.target)) {
                    setShowSidebarEmoji(false);
                }
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [showSidebarEmoji]);

    // Offline queue processing
    const processQueue = useCallback(async () => {
        if (!navigator.onLine || !socket || !socket.connected || !publicKey) return;
        await processOfflineQueue(user.id, async (msg) => {
            const chat = chatsRef.current.find(c => c.id === msg.chatId);
            if (!chat) throw new Error('Queued chat is no longer available');

            const recipientPublicKeys = {};
            for (const participant of chat.participants) {
                const participantPublicKey = participant.id === user.id ? publicKey : participant.publicKey;
                if (!participantPublicKey) throw new Error('A participant encryption key is unavailable');
                if (participant.id !== user.id) await assertPinnedPublicKey(participant.id, participantPublicKey);
                recipientPublicKeys[participant.id] = participantPublicKey;
            }

            const encryptedContent = isEncryptedPayload(msg.content)
                ? msg.content
                : await encryptForRecipients(recipientPublicKeys, msg.content);

            await emitWithAcknowledgement(socket, 'send_message', {
                chatId: msg.chatId,
                clientMessageId: msg.tempId,
                assetId: msg.assetId || null,
                content: encryptedContent,
                type: msg.type,
                ttl: msg.disappearingTtl,
                snapMode: Boolean(msg.snapMode),
                replyToId: msg.replyTo?.id || null,
                replyContent: null,
                replySenderName: null
            });
        });
    }, [socket, publicKey, user]);

    useEffect(() => {
        const timer = window.setInterval(() => processQueue(), 15000);
        return () => window.clearInterval(timer);
    }, [processQueue]);

    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); processQueue(); };
        const handleOffline = () => { setIsOnline(false); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [processQueue]);

    // Initial chats & blocked users
    useEffect(() => {
        if (token) fetchChats();
    }, [token, fetchChats]);

    useEffect(() => {
        if (!token) return;
        axios.get('/api/user/blocked', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => setBlockedUsers(r.data))
            .catch(() => {});
        fetchNotifications();
    }, [token]);

    const fetchNotifications = async () => {
        if (!token) return;
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [res, birthdays] = await Promise.all([
                axios.get('/api/notifications', { headers }),
                axios.get('/api/contacts/birthdays', { headers }).catch(() => ({ data: [] }))
            ]);
            const merged = [...birthdays.data, ...res.data];
            setNotifications(merged);
            setUnreadCount(merged.filter(n => !n.isRead).length);
        } catch (err) { console.error(err); }
    };

    const handleBirthdayWish = async (notification) => {
        try {
            const res = await axios.post(`/api/users/${notification.targetId}/birthday-wish`, {}, { headers: { Authorization: `Bearer ${token}` } });
            alert(res.data.message || 'Birthday wish sent!');
            setNotifications(items => items.filter(item => item.id !== notification.id));
        } catch (err) { alert(err.response?.data?.error || 'Could not send birthday wish'); }
    };

    const handleMarkAllRead = async () => {
        if (!token) return;
        try {
            await axios.post('/api/notifications/read', {}, { headers: { Authorization: `Bearer ${token}` } });
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) { console.error(err); }
    };

    const handleMarkSingleRead = async (notifId) => {
        try {
            await axios.post(`/api/notifications/${notifId}/read`, {}, { headers: { Authorization: `Bearer ${token}` } });
            setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) { console.error(err); }
    };

    // Active chat persistence & preferences
    useEffect(() => {
        if (activeChat) {
            localStorage.setItem('activeChatId', activeChat.id);
            setChats(prev => prev.map(chat => chat.id === activeChat.id ? { ...chat, unreadCount: 0 } : chat));
        }
    }, [activeChat]);

    useEffect(() => {
        if (user?.id && chats && chats.length > 0) {
            try { saveChatMetadata(user.id, chats); } catch (e) { console.error("Failed to cache chats", e); }
        }
    }, [chats, user?.id]);

    useEffect(() => {
        setShowBioBanner(true);
    }, [activeChat]);

    useEffect(() => {
        if (activeChat) {
            const stored = localStorage.getItem(`chat_translation_lang_${activeChat.id}`) || '';
            setChatTranslationLang(stored);
            setDisappearingTtl(Number(localStorage.getItem(`chat_disappearing_ttl_${activeChat.id}`) || 0));
            const savedSnapMode = localStorage.getItem(`chat_snap_mode_${activeChat.id}`);
            setSnapMode(Boolean(activeChat.snapMode) || (savedSnapMode === null ? localStorage.getItem('snap_mode_default') === '1' : savedSnapMode === '1'));
        } else {
            setChatTranslationLang('');
            setDisappearingTtl(0);
            setSnapMode(false);
        }
    }, [activeChat?.id]);

    const updateDisappearingTtl = (value) => {
        const ttl = value === 'custom' ? 'custom' : Number(value);
        setDisappearingTtl(ttl);
        if (visibleActiveChat) localStorage.setItem(`chat_disappearing_ttl_${visibleActiveChat.id}`, String(ttl));
    };

    const updateSnapMode = (enabled) => {
        setSnapMode(enabled);
        if (visibleActiveChat) localStorage.setItem(`chat_snap_mode_${visibleActiveChat.id}`, enabled ? '1' : '0');
        if (visibleActiveChat?.id) socket?.emit('set_snap_mode', { chatId: visibleActiveChat.id, enabled });
    };

    // Snap & TTL timer
    useEffect(() => {
        const timer = window.setInterval(() => {
            const now = Date.now();
            setMessages(current => current.filter(message => {
                if (message.snapMode) {
                    return !message.snapExpiresAt || now < new Date(message.snapExpiresAt).getTime();
                }
                const lifetime = Number(message.ttl || 0);
                return !lifetime || now - new Date(message.timestamp).getTime() < lifetime * 1000;
            }));
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    // Snap protection
    useEffect(() => {
        if (!snapMode) return;
        const blockCaptureShortcut = event => {
            const captureShortcut = event.key === 'PrintScreen' || ((event.metaKey || event.ctrlKey) && event.shiftKey && ['3', '4', '5', 's', 'S'].includes(event.key));
            if (!captureShortcut) return;
            event.preventDefault();
            navigator.clipboard?.writeText('').catch(() => {});
        };
        const preventSnapActions = event => event.preventDefault();
        const updateCaptureShield = () => {
            document.body.classList.toggle('snap-capture-shield', document.hidden || !document.hasFocus());
        };
        document.addEventListener('keydown', blockCaptureShortcut, true);
        document.addEventListener('contextmenu', preventSnapActions, true);
        document.addEventListener('copy', preventSnapActions, true);
        document.addEventListener('dragstart', preventSnapActions, true);
        document.addEventListener('visibilitychange', updateCaptureShield, true);
        window.addEventListener('blur', updateCaptureShield, true);
        window.addEventListener('focus', updateCaptureShield, true);
        document.body.classList.add('snap-mode-active');
        return () => {
            document.removeEventListener('keydown', blockCaptureShortcut, true);
            document.removeEventListener('contextmenu', preventSnapActions, true);
            document.removeEventListener('copy', preventSnapActions, true);
            document.removeEventListener('dragstart', preventSnapActions, true);
            document.removeEventListener('visibilitychange', updateCaptureShield, true);
            window.removeEventListener('blur', updateCaptureShield, true);
            window.removeEventListener('focus', updateCaptureShield, true);
            document.body.classList.remove('snap-mode-active');
            document.body.classList.remove('snap-capture-shield');
        };
    }, [snapMode]);

    useEffect(() => {
        if (showInfoPanel && visibleActiveChat?.isGroup && visibleActiveChat.groupAdminId === user?.id) {
            groups.fetchGroupRequests(visibleActiveChat.id);
        }
    }, [showInfoPanel, visibleActiveChat?.id, visibleActiveChat?.isGroup, visibleActiveChat?.groupAdminId, user?.id]);

    // Socket events
    useEffect(() => {
        if (!socket) return;
        if (user) socket.emit('join_room', { room: 'global', userId: user.id });
        if (socket.connected) processQueue();

        socket.on('connect', () => {
            processQueue();
            fetchChats();
        });

        socket.on('snap_mode_update', ({ chatId, enabled, snapExpiresAt, initiatedBy, initiatorName }) => {
            localStorage.setItem(`chat_snap_mode_${chatId}`, enabled ? '1' : '0');
            setChats(current => current.map(chat => chat.id === chatId ? { ...chat, snapMode: enabled } : chat));
            setActiveChat(current => current?.id === chatId ? { ...current, snapMode: enabled } : current);
            if (!enabled && snapExpiresAt && activeChatRef.current?.id === chatId) {
                setMessages(current => current.map(message => message.snapMode && !message.snapExpiresAt
                    ? { ...message, snapExpiresAt }
                    : message));
            }
            if (activeChatRef.current?.id === chatId) setSnapMode(enabled);
            if (enabled && Number(initiatedBy) !== Number(user.id)) {
                const affectedChat = chats.find(chat => chat.id === chatId);
                setSnapNotice({
                    chatId,
                    title: 'Snap Mode started',
                    message: `${initiatorName || affectedChat?.name || 'A participant'} started Snap Mode. Previous normal chat content is hidden, and capture and download restrictions apply to this session.`,
                });
            }
        });

        socket.on('receive_message', async (newMsg) => {
            upsertEncryptedMessage(user.id, newMsg.chatId, newMsg);
            const readableMsg = await decryptMessageForCurrentUser(newMsg);

            const automation = businessAutomationRef.current;
            if (automation?.enabled && readableMsg.senderId !== user.id && readableMsg.type !== 'business_auto_reply') {
                const chat = chatsRef.current.find(item => item.id === readableMsg.chatId);
                if (chat?.participants?.length === 2) {
                    let autoReplyClaimed = false;
                    try {
                        const claim = await axios.post('/api/business/automation/claim', { messageId: readableMsg.id }, { headers: { Authorization: `Bearer ${token}` } });
                        autoReplyClaimed = Boolean(claim.data.claimed);
                    } catch (error) {
                        console.error('Could not claim business auto reply', error);
                    }
                    if (autoReplyClaimed) {
                        let autoReply = automation.welcomeMessage || 'Thanks for contacting us. How can we help?';
                        const incomingText = String(readableMsg.content || '').toLowerCase();
                        for (const [keyword, reply] of Object.entries(automation.keywordRules || {})) {
                            if (incomingText.includes(keyword.toLowerCase())) { autoReply = reply; break; }
                        }
                        try {
                            const recipientPublicKeys = {};
                            for (const participant of chat.participants) {
                                const key = participant.id === user.id ? publicKey : participant.publicKey;
                                if (key) {
                                    if (participant.id !== user.id) await assertPinnedPublicKey(participant.id, key);
                                    recipientPublicKeys[participant.id] = key;
                                }
                            }
                            if (Object.keys(recipientPublicKeys).length === chat.participants.length) {
                                const encryptedContent = await encryptForRecipients(recipientPublicKeys, autoReply);
                                socket.emit('send_message', {
                                    chatId: chat.id, content: encryptedContent,
                                    clientMessageId: `business_auto_${crypto.randomUUID?.() || Date.now()}`,
                                    type: 'business_auto_reply', ttl: 0,
                                });
                            }
                        } catch (error) { console.error('Business chatbot reply failed', error); }
                    }
                }
            }

            if (readableMsg.senderId !== user.id) {
                const isMuted = prefs.mutedChats?.includes(readableMsg.chatId);
                playMessageNotification(readableMsg.chatId, { isMuted });
                if (localStorage.getItem('desktop_alerts') !== '0' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
                    const chat = chatsRef.current.find(item => item.id === readableMsg.chatId);
                    new Notification(chat?.name || 'CHEETCHAT', {
                        body: readableMsg.type === 'text' || readableMsg.type === 'business_auto_reply' ? readableMsg.content : `New ${readableMsg.type || 'message'}`,
                        icon: '/icons/icon-192.png', tag: `chat-${readableMsg.chatId}`
                    });
                }
            }

            if (activeChatRef.current && readableMsg.chatId === activeChatRef.current.id) {
                const shouldFollowMessage = readableMsg.senderId === user.id || !userScrolledUpRef.current;
                if (readableMsg.senderId === user.id) userScrolledUpRef.current = false;
                setMessages(prev => {
                    if (readableMsg.senderId === user.id) {
                        const hasOptimistic = prev.some(m => (
                            m._isOptimistic && m.senderId === user.id && m.chatId === readableMsg.chatId &&
                            (!readableMsg.clientMessageId || m.clientMessageId === readableMsg.clientMessageId)
                        ));
                        if (hasOptimistic) {
                            let replaced = false;
                            return prev.map(m => {
                                const matchingClientId = !readableMsg.clientMessageId || m.clientMessageId === readableMsg.clientMessageId;
                                if (!replaced && matchingClientId && m._isOptimistic && m.senderId === user.id && m.chatId === readableMsg.chatId) {
                                    replaced = true;
                                    return readableMsg;
                                }
                                return m;
                            });
                        }
                    }
                    if (prev.some(message => message.id === readableMsg.id)) return prev;
                    return [...prev, readableMsg];
                });
                if (shouldFollowMessage) window.requestAnimationFrame(() => scrollToBottom());
                if (readableMsg.senderId !== user.id) {
                    socket.emit('mark_read', { chatId: readableMsg.chatId });
                }
            }

            if (!chatsRef.current.some(chat => chat.id === readableMsg.chatId)) {
                fetchChats();
                return;
            }

            setChats(prev => {
                const chatIdx = prev.findIndex(c => c.id === readableMsg.chatId);
                if (chatIdx === -1) {
                    fetchChats();
                    return prev;
                }
                const updatedChats = [...prev];
                const [targetChat] = updatedChats.splice(chatIdx, 1);
                targetChat.lastMessage = {
                    content: readableMsg.type === 'text' ? readableMsg.content : readableMsg.type,
                    timestamp: readableMsg.timestamp,
                    type: readableMsg.type
                };
                if (readableMsg.senderId !== user.id && activeChatRef.current?.id !== readableMsg.chatId) {
                    targetChat.unreadCount = Number(targetChat.unreadCount || 0) + 1;
                } else if (activeChatRef.current?.id === readableMsg.chatId) {
                    targetChat.unreadCount = 0;
                }
                return [targetChat, ...updatedChats];
            });
        });

        socket.on('message_status_update', ({ messageId, chatId, status, readAt, deliveredAt }) => {
            if (activeChatRef.current && chatId === activeChatRef.current.id) {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status, readAt: readAt || m.readAt, deliveredAt: deliveredAt || m.deliveredAt } : m));
            }
        });

        socket.on('message_edited', async ({ id, chatId, content, editedAt }) => {
            updateEncryptedMessageContent(user.id, chatId, id, content, editedAt);
            if (activeChatRef.current?.id === chatId) {
                const readableContent = isEncryptedPayload(content) && privateKey && user
                    ? await decryptEnvelope(privateKey, user.id, content)
                    : content;
                setMessages(prev => prev.map(m => m.id === id ? { ...m, content: readableContent, editedAt } : m));
            }
        });

        socket.on('message_deleted', ({ id, chatId, deletedAt }) => {
            removeEncryptedMessage(user.id, chatId, id);
            if (activeChatRef.current?.id === chatId) {
                setMessages(prev => prev.map(m => m.id === id ? { ...m, content: '', type: 'deleted', deletedAt } : m));
            }
        });

        socket.on('chat_deleted', ({ chatId }) => {
            clearEncryptedMessageCache(user.id, chatId);
            setChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChatRef.current?.id === chatId) {
                setActiveChat(null);
                localStorage.removeItem('activeChatId');
            }
        });

        socket.on('message_reaction_update', ({ id, chatId, reactions }) => {
            if (activeChatRef.current && String(activeChatRef.current.id) === String(chatId)) {
                const reactionsStr = typeof reactions === 'string' ? reactions : JSON.stringify(reactions);
                setMessages(prev => prev.map(m => String(m.id) === String(id) ? { ...m, reactions: reactionsStr } : m));
            }
        });

        socket.on('message_pin_update', ({ id, chatId, isPinned }) => {
            if (activeChatRef.current?.id === chatId) {
                setMessages(prev => prev.map(m => m.id === id ? { ...m, isPinned } : m));
            }
        });

        socket.on('poll_vote_update', update => {
            setMessages(prev => applyPollVoteUpdate(prev, update));
        });

        socket.on('typing_update', ({ chatId, userId, username, isTyping }) => {
            setTypingUsers(prev => {
                const chatTyping = { ...(prev[chatId] || {}) };
                if (isTyping) chatTyping[userId] = username;
                else delete chatTyping[userId];
                return { ...prev, [chatId]: chatTyping };
            });
        });

        socket.on('presence_update', ({ userId, isOnline: online, lastSeen }) => {
            setChats(prev => prev.map(chat => ({
                ...chat,
                participants: chat.participants.map(participant =>
                    participant.id === userId ? { ...participant, isOnline: online, lastSeen } : participant
                )
            })));
            setActiveChat(prev => prev ? {
                ...prev,
                participants: prev.participants.map(participant =>
                    participant.id === userId ? { ...participant, isOnline: online, lastSeen } : participant
                )
            } : prev);
        });

        socket.on('user_profile_updated', ({ user: updatedUser }) => {
            setChats(prev => prev.map(chat => ({
                ...chat,
                avatar: !chat.isGroup && chat.participants.some(participant => participant.id === updatedUser.id)
                    ? updatedUser.avatar : chat.avatar,
                participants: chat.participants.map(participant =>
                    participant.id === updatedUser.id ? { ...participant, ...updatedUser } : participant
                )
            })));
            setActiveChat(prev => prev ? {
                ...prev,
                avatar: !prev.isGroup && prev.participants.some(participant => participant.id === updatedUser.id)
                    ? updatedUser.avatar : prev.avatar,
                participants: prev.participants.map(participant =>
                    participant.id === updatedUser.id ? { ...participant, ...updatedUser } : participant
                )
            } : prev);
        });

        socket.on('audience_avatar_updated', ({ ownerId, avatar }) => {
            setChats(prev => prev.map(chat => {
                if (chat.isGroup || !chat.participants?.some(participant => participant.id === ownerId)) return chat;
                return {
                    ...chat,
                    avatar,
                    participants: chat.participants.map(participant => participant.id === ownerId ? { ...participant, avatar } : participant)
                };
            }));
            setActiveChat(prev => {
                if (!prev || prev.isGroup || !prev.participants?.some(participant => participant.id === ownerId)) return prev;
                return {
                    ...prev,
                    avatar,
                    participants: prev.participants.map(participant => participant.id === ownerId ? { ...participant, avatar } : participant)
                };
            });
        });

        socket.on('live_location_update', ({ chatId, userId, lat, lng }) => {
            if (activeChatRef.current?.id === chatId) {
                setMessages(prev => applyLiveLocationUpdate(prev, { userId, lat, lng }));
            }
        });

        return () => {
            socket.off('connect');
            socket.off('poll_vote_update');
            socket.off('receive_message');
            socket.off('presence_update');
            socket.off('user_profile_updated');
            socket.off('audience_avatar_updated');
            socket.off('message_status_update');
            socket.off('message_edited');
            socket.off('message_deleted');
            socket.off('chat_deleted');
            socket.off('message_reaction_update');
            socket.off('message_pin_update');
            socket.off('snap_mode_update');
            socket.off('typing_update');
            socket.off('live_location_update');
        };
    }, [socket, user, publicKey, fetchChats, decryptMessageForCurrentUser, processQueue, chats]);

    // Active chat messages loader
    useEffect(() => {
        if (!activeChat) {
            setMessages([]);
            return;
        }
        setMessages([]);
        userScrolledUpRef.current = false;
        let cancelled = false;

        const loadCachedMessages = async () => {
            if (!privateKey || !user?.id) return;
            const cached = loadEncryptedMessages(user.id, activeChat.id);
            if (!cached.length) return;
            const decrypted = await decryptMessagesForCurrentUser(cached);
            if (!cancelled) {
                setMessages(decrypted);
                setTimeout(() => scrollToBottom('auto'), 50);
            }
        };
        loadCachedMessages();

        const fetchMessages = async () => {
            if (!privateKey) return;
            try {
                const res = await axios.get(`/api/chats/${activeChat.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const decrypted = await decryptMessagesForCurrentUser(res.data);
                setMessages(decrypted);
                saveEncryptedMessages(user?.id, activeChat.id, res.data);
                window.requestAnimationFrame(() => scrollToBottom('auto'));
                socket?.emit('join_room', { room: activeChat.id });
                socket?.emit('mark_read', { chatId: activeChat.id });
            } catch (err) { console.error(err); }
        };
        fetchMessages();
        return () => { cancelled = true; };
    }, [activeChat?.id, token, socket, privateKey, user?.id, decryptMessagesForCurrentUser]);

    // Business automation refresh
    useEffect(() => {
        if (!token) return;
        const refreshAutomation = () => axios.get('/api/business/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(response => { businessAutomationRef.current = response.data.automation || null; })
            .catch(() => { businessAutomationRef.current = null; });
        refreshAutomation();
        window.addEventListener('cheetchat-business-automation-updated', refreshAutomation);
        return () => window.removeEventListener('cheetchat-business-automation-updated', refreshAutomation);
    }, [token]);

    const scrollToBottom = (behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
        userScrolledUpRef.current = false;
    };

    useEffect(() => {
        if (messages.length > 0 && !userScrolledUpRef.current) {
            const frame = window.requestAnimationFrame(() => scrollToBottom());
            return () => window.cancelAnimationFrame(frame);
        }
    }, [messages.length]);

    // Send message
    const handleSendMessage = async (text, type = 'text', replyMsg = null, ttl = 0, assetId = null) => {
        ttl = Number(ttl || 0);
        if (!activeChat?.id || !user?.id) return;
        const participants = Array.isArray(activeChat.participants)
            ? activeChat.participants.filter(participant => participant?.id)
            : [];
        if (participants.length === 0) {
            alert('Chat information is still loading. Please try again in a moment.');
            return;
        }

        const tempId = `temp_${Date.now()}_${Math.random()}`;
        const optimisticMsg = {
            id: tempId,
            chatId: activeChat.id,
            senderId: user.id,
            senderName: user.username || 'CHEETCHAT user',
            content: text,
            type,
            status: 'sending',
            timestamp: new Date().toISOString(),
            replyToId: replyMsg?.id || null,
            replyContent: replyMsg ? (replyMsg.type !== 'text' ? replyMsg.type : replyMsg.content) : null,
            replySenderName: replyMsg?.senderName || null,
            reactions: {},
            isPinned: false,
            _isOptimistic: true,
            clientMessageId: tempId,
            assetId,
            ttl,
            snapMode
        };
        userScrolledUpRef.current = false;
        setMessages(prev => [...prev, optimisticMsg]);
        scrollToBottom();
        setReplyTo(null);

        setChats(prev => {
            const chatIdx = prev.findIndex(c => c.id === activeChat.id);
            if (chatIdx === -1) return prev;
            const updatedChats = [...prev];
            const [targetChat] = updatedChats.splice(chatIdx, 1);
            targetChat.lastMessage = {
                content: type === 'text' ? text : type,
                timestamp: optimisticMsg.timestamp,
                type
            };
            return [targetChat, ...updatedChats];
        });

        if (!privateKey || !publicKey) {
            setMessages(prev => prev.map(message => message.id === tempId ? { ...message, status: 'failed' } : message));
            alert("Encryption keys are still loading. Please try again in a moment.");
            return;
        }

        let encryptedContent = null;
        try {
            const recipientPublicKeys = {};
            for (const participant of participants) {
                const participantPublicKey = participant.id === user.id ? publicKey : participant.publicKey;
                if (!participantPublicKey) throw new Error('A participant encryption key is unavailable');
                if (participant.id !== user.id) await assertPinnedPublicKey(participant.id, participantPublicKey);
                recipientPublicKeys[participant.id] = participantPublicKey;
            }

            encryptedContent = await encryptForRecipients(recipientPublicKeys, text);

            if (!navigator.onLine || !socket || !socket.connected) {
                enqueueOfflineMessage(user.id, activeChat.id, encryptedContent, type, replyMsg, ttl, tempId, assetId, null, snapMode);
                setMessages(prev => prev.map(message => message.id === tempId ? { ...message, status: 'queued' } : message));
                return;
            }

            const acknowledgement = await emitWithAcknowledgement(socket, 'send_message', {
                chatId: activeChat.id,
                clientMessageId: tempId,
                assetId,
                content: encryptedContent,
                type,
                ttl,
                snapMode,
                replyToId: replyMsg?.id || null,
                replyContent: null,
                replySenderName: null
            });
            setMessages(prev => prev.map(message => message.id === tempId
                ? { ...message, id: acknowledgement.messageId, status: 'sent', _isOptimistic: false }
                : message));
        } catch (err) {
            if (err.retryable !== false && encryptedContent) {
                enqueueOfflineMessage(user.id, activeChat.id, encryptedContent, type, replyMsg, ttl, tempId, assetId, null, snapMode);
            }
            setMessages(prev => prev.map(m => m.id === tempId ? {
                ...m, status: err.retryable === false ? 'failed' : 'queued'
            } : m));
            console.error('Send failed:', err);
        }
    };

    // Upload handler
    const handleUpload = async (file, preferredType = null) => {
        if (!token) { logout(); return; }
        const maxSize = 100 * 1024 * 1024;
        const safeTransportSize = 24 * 1024 * 1024;
        const category = getFileCategory(file);
        const originalSize = file.size;
        let fileToUpload = file;
        const sendHd = localStorage.getItem('hd_media') === '1';
        const dataSaver = localStorage.getItem('data_saver') === '1';

        try {
            const oversizedHdMedia = sendHd && ((category === 'video' && file.size > 24 * 1024 * 1024) || (category === 'image' && file.size > 9 * 1024 * 1024));
            if (sendHd && !oversizedHdMedia && (category === 'image' || category === 'video')) {
                setUploadProgress({ fileName: file.name, stage: 'HD original selected. Uploading…', percent: 5, originalSize, compressedSize: originalSize });
            } else if (category === 'image') {
                setUploadProgress({ fileName: file.name, stage: oversizedHdMedia ? 'Creating HD upload copy…' : 'Compressing image...', percent: 10, originalSize, compressedSize: null });
                fileToUpload = await compressImage(file, dataSaver
                    ? { maxWidth: 960, maxHeight: 960, quality: 0.62 }
                    : oversizedHdMedia ? { maxWidth: 3840, maxHeight: 3840, quality: 0.9 } : undefined);
                setUploadProgress(prev => ({
                    ...prev,
                    stage: 'Image compressed! Uploading...',
                    percent: 30,
                    compressedSize: fileToUpload.size
                }));
            } else if (category === 'video') {
                const duration = await readVideoDuration(file);
                const sizeBoundBitrate = duration > 0 ? Math.floor((safeTransportSize * 8) / duration) : 8_000_000;
                const transportBitrate = dataSaver ? 650_000 : Math.max(150_000, Math.min(oversizedHdMedia ? 12_000_000 : 1_200_000, sizeBoundBitrate));
                setUploadProgress({ fileName: file.name, stage: oversizedHdMedia ? 'Creating high-quality upload copy…' : 'Compressing video...', percent: 5, originalSize, compressedSize: null });
                fileToUpload = await compressVideo(file, {
                    videoBitsPerSecond: transportBitrate,
                    onProgress: (p) => setUploadProgress(prev => ({
                        ...prev,
                        stage: `Compressing video... ${Math.round(p)}%`,
                        percent: Math.round(p * 0.5)
                    }))
                });
                setUploadProgress(prev => ({
                    ...prev,
                    stage: 'Video compressed! Uploading...',
                    percent: 55,
                    compressedSize: fileToUpload.size
                }));
            } else {
                setUploadProgress({ fileName: file.name, stage: 'Preparing upload...', percent: 5, originalSize, compressedSize: null });
            }
        } catch (compressErr) {
            console.warn('Compression failed, using original:', compressErr);
            fileToUpload = file;
        }

        if (fileToUpload.size > maxSize) {
            setUploadProgress(null);
            alert('The original recording is saved in your gallery, but its upload copy is still over 100 MB. Try sharing a shorter clip.');
            return;
        }

        const participants = Array.isArray(activeChat?.participants)
            ? activeChat.participants.filter(participant => participant?.id)
            : [];
        if (!privateKey || !publicKey || participants.length === 0) {
            setUploadProgress(null);
            alert('Encryption keys or chat members are still loading. Please try again.');
            return;
        }
        const recipientPublicKeys = {};
        try {
            for (const participant of participants) {
                const participantKey = participant.id === user.id ? publicKey : participant.publicKey;
                if (!participantKey) throw new Error('A participant encryption key is unavailable');
                if (participant.id !== user.id) await assertPinnedPublicKey(participant.id, participantKey);
                recipientPublicKeys[participant.id] = participantKey;
            }
        } catch (error) {
            setUploadProgress(null);
            alert(error.message);
            return;
        }

        const formData = new FormData();
        try {
            setUploadProgress(prev => ({ ...prev, stage: 'End-to-end encrypting…', percent: Math.max(prev?.percent || 5, 60) }));
            const encryptedMedia = await encryptMediaForRecipients(recipientPublicKeys, fileToUpload);
            formData.append('file', encryptedMedia.ciphertext, 'attachment.e2ee');
            formData.append('encrypted', '1');
            formData.append('mediaKind', category === 'file' ? 'document' : category);
            const res = await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                },
                timeout: 3600000,
                onUploadProgress: (progressEvent) => {
                    const pct = progressEvent.total ? Math.round((progressEvent.loaded / progressEvent.total) * 100) : 50;
                    const uploadStart = category === 'image' ? 30 : category === 'video' ? 55 : 5;
                    const mapped = uploadStart + Math.round(pct * (95 - uploadStart) / 100);
                    setUploadProgress(prev => ({
                        ...prev,
                        stage: `Uploading... ${pct}%`,
                        percent: mapped,
                        compressedSize: prev?.compressedSize ?? fileToUpload.size
                    }));
                }
            });

            const url = res.data.url;
            let type = preferredType || 'file';
            const isImage = file.type.startsWith('image/') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const isAudio = file.type.startsWith('audio/') || file.name.startsWith('voice-') || url.match(/\.(mp3|wav|m4a|aac|oga)$/i);
            const isVideo = !isAudio && (file.type.startsWith('video/') || url.match(/\.(mp4|webm|ogg|mov)$/i));

            if (!preferredType) {
                if (isImage) type = 'image';
                else if (isAudio) type = 'audio';
                else if (isVideo) type = file.name.startsWith('video-note-') ? 'video_note' : 'video';
            }

            setUploadProgress(null);
            const descriptor = JSON.stringify({ ...encryptedMedia.descriptor, url });
            handleSendMessage(descriptor, type, replyTo, disappearingTtl, res.data.assetId);
            return { url, type };
        } catch (err) {
            setUploadProgress(null);
            console.error(err);
            const status = err.response?.status;
            const msg = status === 503
                ? 'Media safety service is temporarily unavailable. Your original is safe in Gallery—please retry shortly.'
                : status === 502
                    ? 'Upload server restarted or timed out. Please retry; the app will reuse an optimized upload copy.'
                    : err.response?.data?.error || err.response?.statusText || err.message;
            alert('Upload failed: ' + msg);
        }
    };

    const handleMessagePhotoSticker = async (photoMessage) => {
        const sourceUrl = String(photoMessage?.content || '');
        if (!sourceUrl) return;
        try {
            setUploadProgress({ fileName: 'Photo sticker', stage: 'Converting picture to sticker…', percent: 10, originalSize: null, compressedSize: null });
            const stickerFile = await photoUrlToStickerFile(sourceUrl);
            const uploaded = await handleUpload(stickerFile, 'sticker');
            if (uploaded?.url) localStorage.setItem('last_photo_sticker', uploaded.url);
        } catch (error) {
            setUploadProgress(null);
            alert(error.message || 'Could not make a sticker from this picture.');
        }
    };

    const handlePlaceSticker = async (message) => {
        const stickerUrl = localStorage.getItem('last_photo_sticker');
        if (!stickerUrl) return alert('Create a sticker from a chat photo first.');
        try {
            const res = await axios.post(`/api/messages/${message.id}/react`, { stickerUrl }, { headers: { Authorization: `Bearer ${token}` } });
            setMessages(items => items.map(item => String(item.id) === String(message.id) ? { ...item, reactions: res.data.reactions } : item));
        } catch (error) { alert(error.response?.data?.error || 'Could not place sticker'); }
    };

    const handleSearchUser = async (e) => {
        e.preventDefault();
        setSearchError('');
        setSearchedUser(null);
        const query = searchQuery.trim();
        const isHandleSearch = query.startsWith('@');
        const phoneDigits = query.replace(/\D/g, '');
        const isPhoneSearch = !isHandleSearch && phoneDigits.length > 0 && phoneDigits.length === query.replace(/\s/g, '').length;

        if (!query) { setSearchError('Enter a phone number, @handle, or name'); return; }
        if (isPhoneSearch && phoneDigits.length !== 10) { setSearchError('Phone number must be exactly 10 digits'); return; }

        const searchPayload = isPhoneSearch ? phoneDigits : query;
        try {
            const res = await axios.post('/api/user/search', { query: searchPayload }, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.error) setSearchError(res.data.error);
            else setSearchedUser(res.data);
        } catch (err) { setSearchError(err.response?.data?.error || "User not found"); }
    };

    const openNewChat = () => {
        setShowNotifications(false);
        nav.setShowSettings(false);
        if (!user?.hasPhone && !user?.phone) {
            setLinkPhoneError('');
            setShowLinkPhoneModal(true);
            return;
        }
        setShowSearchModal(true);
    };

    const handleLinkPhone = async (event) => {
        event.preventDefault();
        if (linkPhone.length !== 10) { setLinkPhoneError('Phone number must be exactly 10 digits'); return; }
        setLinkingPhone(true);
        setLinkPhoneError('');
        try {
            const response = await axios.post('/api/user/link-phone', { phone: linkPhone }, { headers: { Authorization: `Bearer ${token}` } });
            updateUser(response.data.user);
            setShowLinkPhoneModal(false);
            setLinkPhone('');
            setShowSearchModal(true);
        } catch (error) {
            setLinkPhoneError(error.response?.data?.error || 'Could not link this number');
        } finally {
            setLinkingPhone(false);
        }
    };

    const handleDeleteChat = (chatId) => { setChatToDelete(chatId); };
    const handleDeleteChatConfirm = async (chatId, option) => {
        try {
            await axios.delete(`/api/chats/${chatId}?option=${option}`, { headers: { Authorization: `Bearer ${token}` } });
            setChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChat?.id === chatId) { setActiveChat(null); localStorage.removeItem('activeChatId'); }
        } catch (err) { console.error(err); } finally { setChatToDelete(null); }
    };

    const handleDeleteMessage = (message) => { setMsgToDelete(message); };
    const handleDeleteMessageConfirm = async (messageId, option) => {
        try {
            const res = await axios.delete(`/api/messages/${messageId}?option=${option}`, { headers: { Authorization: `Bearer ${token}` } });
            if (option === 'everyone') {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '', type: 'deleted', deletedAt: res.data.deletedAt } : m));
            } else {
                setMessages(prev => prev.filter(m => m.id !== messageId));
            }
        } catch (err) { console.error(err); } finally { setMsgToDelete(null); }
    };

    const handleBlockUser = async (targetUserId) => {
        try {
            await axios.post('/api/user/block', { userId: targetUserId }, { headers: { Authorization: `Bearer ${token}` } });
            setBlockedUsers(prev => [...prev, targetUserId]);
        } catch (err) { console.error(err); }
    };

    const handleUnblockUser = async (targetUserId) => {
        try {
            await axios.post('/api/user/unblock', { userId: targetUserId }, { headers: { Authorization: `Bearer ${token}` } });
            setBlockedUsers(prev => prev.filter(id => id !== targetUserId));
        } catch (err) { console.error(err); }
    };

    const handleDeleteAvatar = async () => {
        try {
            const res = await axios.delete('/api/user/avatar', { headers: { Authorization: `Bearer ${token}` } });
            updateUser(res.data.user);
            await fetchChats();
        } catch (err) { console.error(err); }
    };

    const handleCopyMessage = async (message) => {
        try { await navigator.clipboard.writeText(message.content || ''); } catch { alert('Could not copy message'); }
    };

    const openEditMessage = (message) => {
        setEditingMessage(message);
        setEditText(message.content || '');
    };

    const submitEditMessage = async (e) => {
        e.preventDefault();
        if (!editingMessage || !editText.trim()) return;
        try {
            const encryptedContent = await encryptForRecipients(
                Object.fromEntries(activeChat.participants.map(p => [p.id, p.id === user.id ? publicKey : p.publicKey])),
                editText.trim()
            );
            const res = await axios.put(`/api/messages/${editingMessage.id}`, { content: encryptedContent }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessages(prev => prev.map(m => m.id === editingMessage.id ? { ...m, content: editText.trim(), editedAt: res.data.editedAt } : m));
            setEditingMessage(null);
            setEditText('');
        } catch (err) { console.error(err); alert('Could not edit message'); }
    };

    const handleReactMessage = async (message, emoji) => {
        try {
            const res = await axios.post(`/api/messages/${message.id}/react`, { emoji }, { headers: { Authorization: `Bearer ${token}` } });
            setMessages(prev => prev.map(m => String(m.id) === String(message.id) ? { ...m, reactions: res.data.reactions } : m));
        } catch (err) { console.error(err); }
    };

    const handlePinMessage = async (message) => {
        try {
            const res = await axios.post(`/api/messages/${message.id}/pin`, {}, { headers: { Authorization: `Bearer ${token}` } });
            setMessages(prev => prev.map(m => m.id === message.id ? { ...m, isPinned: res.data.isPinned } : m));
        } catch (err) { console.error(err); }
    };

    const handleForwardToChat = async (targetChat) => {
        if (!forwardMessage) return;
        const clientMessageId = `forward_${Date.now()}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        let encryptedContent = null;
        try {
            const recipientPublicKeys = {};
            for (const participant of targetChat.participants) {
                const participantPublicKey = participant.id === user.id ? publicKey : participant.publicKey;
                if (!participantPublicKey) return alert(`${participant.username} does not have an encryption key yet.`);
                if (participant.id !== user.id) await assertPinnedPublicKey(participant.id, participantPublicKey);
                recipientPublicKeys[participant.id] = participantPublicKey;
            }
            encryptedContent = await encryptForRecipients(recipientPublicKeys, forwardMessage.content);
            if (!navigator.onLine || !socket?.connected) {
                enqueueOfflineMessage(user.id, targetChat.id, encryptedContent, forwardMessage.type || 'text', null, 0, clientMessageId);
                setForwardMessage(null);
                alert('Network unavailable. The share is queued and will send when you reconnect.');
                return;
            }
            await emitWithAcknowledgement(socket, 'send_message', {
                chatId: targetChat.id, clientMessageId, content: encryptedContent,
                type: forwardMessage.type || 'text', ttl: 0, replyToId: null,
                replyContent: null, replySenderName: null
            });
            setForwardMessage(null);
        } catch (err) {
            console.error(err);
            if (err.retryable !== false && encryptedContent) {
                enqueueOfflineMessage(user.id, targetChat.id, encryptedContent, forwardMessage.type || 'text', null, 0, clientMessageId);
                setForwardMessage(null);
                alert('Network unavailable. The share is queued and will send when you reconnect.');
            } else {
                alert(err.message || 'Could not forward message');
            }
        }
    };

    const shareReelToChat = (reel) => {
        const reelUrl = `${window.location.origin}/reels/${reel.id}`;
        const caption = String(reel.caption || '').trim();
        nav.setShowReels(false);
        setForwardMessage({
            content: `${caption ? `${caption}\n` : ''}${reelUrl}`,
            type: 'text',
            _shareSource: 'reel',
        });
    };

    const shareSocialPostToChat = (post) => {
        const displayPost = post.isRetweet && post.originalPost ? post.originalPost : post;
        const postUrl = `${window.location.origin}/?post=${post.id}`;
        const caption = String(displayPost.caption || '').trim();
        nav.setShowSocial(false);
        setForwardMessage({
            content: `${caption ? `${caption}\n` : ''}${postUrl}`,
            type: 'text',
            _shareSource: 'social',
        });
    };

    const openSocialDirectMessage = async (socialUser) => {
        if (!socialUser?.id || socialUser.id === user?.id) return;
        try {
            const existing = chats.find(chat => !chat.isGroup && chat.participants?.some(participant => participant.id === socialUser.id));
            let chatId = existing?.id;
            if (!chatId) {
                if (!socialUser.platformId) throw new Error('This user has not created a unique ID yet.');
                await axios.post('/api/user/search', { query: `@${socialUser.platformId}` }, { headers: { Authorization: `Bearer ${token}` } });
                const created = await axios.post('/api/chats/create', { participants: [user.id, socialUser.id], isGroup: false }, { headers: { Authorization: `Bearer ${token}` } });
                chatId = created.data.id;
            }
            const updatedChats = await fetchChats();
            const target = updatedChats.find(chat => chat.id === chatId) || existing;
            if (!target) throw new Error('Could not open direct message.');
            setActiveChat(target);
            nav.setShowSocial(false);
        } catch (error) { alert(error.response?.data?.error || error.message || 'Could not start direct message'); }
    };

    const handleTyping = (isTyping) => {
        if (!socket || !visibleActiveChat) return;
        socket.emit('typing', { chatId: visibleActiveChat.id, isTyping });
    };

    const openActiveChatInfo = async () => {
        setShowInfoPanel(true);
        setContactBusinessInfo(null);
        if (!visibleActiveChat?.isGroup) {
            const other = getOtherParticipant(visibleActiveChat);
            if (other?.id) {
                try {
                    const res = await axios.get(`/api/business/${other.id}`, { headers: { Authorization: `Bearer ${token}` } });
                    setContactBusinessInfo(res.data);
                } catch (err) {
                    if (err.response?.status !== 404) console.warn('Business profile unavailable', err);
                }
            }
        }
    };

    const sendLiveLocationMessage = useCallback(payload => {
        handleSendMessage(JSON.stringify(payload), 'live_location');
    }, [handleSendMessage]);

    const reportLiveLocationError = useCallback(error => {
        console.error('Live location error', error);
        alert('Live location needs precise location permission.');
    }, []);

    const { liveLocationSharing, timeLeft, startLiveLocation, stopLiveLocation } = useLiveLocationSharing({
        socket, sendLocationMessage: sendLiveLocationMessage, onError: reportLiveLocationError,
    });

    const handleTranslate = useCallback(async (text, targetLang, sourceLang = 'auto') => {
        if (!token) return '';
        try {
            const res = await axios.post('/api/translate', { text, target_lang: targetLang, source_lang: sourceLang }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.translatedText;
        } catch (err) { console.error("Translation error", err); throw err; }
    }, [token]);

    const formatTimeLeft = (seconds) => {
        if (!seconds) return "";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startChat = async () => {
        if (!searchedUser || !user || !token) return;
        const existingChat = chats.find(chat =>
            !chat.isGroup && chat.participants?.some(participant => participant.id === searchedUser.id)
        );
        if (existingChat) {
            setActiveChat(existingChat);
            setShowSearchModal(false);
            setSearchQuery('');
            setSearchedUser(null);
            return;
        }
        try {
            const res = await axios.post('/api/chats/create', { participants: [user.id, searchedUser.id], isGroup: false }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const updatedChats = await fetchChats();
            const newChat = updatedChats.find(chat => chat.id === res.data.id);
            if (newChat) setActiveChat(newChat);
            setShowSearchModal(false);
            setSearchQuery('');
            setSearchedUser(null);
        } catch (err) {
            console.error(err);
            setSearchError(err.response?.data?.error || "Could not start chat");
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const res = await axios.post('/api/user/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });
            updateUser(res.data.user);
            await fetchChats();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Could not update profile photo");
        } finally {
            e.target.value = '';
        }
    };

    const handleContactDpChange = async (event, contactId) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !contactId) return;
        if (!file.type.startsWith('image/')) return alert('Please select an image file.');
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const res = await axios.post(`/api/user/contact-avatar/${contactId}`, formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            setChats(prev => prev.map(chat => chat.id === activeChatRef.current?.id
                ? { ...chat, myAvatarForContact: res.data.avatar, hasCustomAvatarForContact: true } : chat));
            setActiveChat(prev => prev ? { ...prev, myAvatarForContact: res.data.avatar, hasCustomAvatarForContact: true } : prev);
        } catch (err) { alert(err.response?.data?.error || 'Could not set contact-specific DP.'); }
    };

    const resetContactDp = async (contactId) => {
        if (!contactId) return;
        try {
            const res = await axios.delete(`/api/user/contact-avatar/${contactId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setChats(prev => prev.map(chat => chat.id === activeChatRef.current?.id
                ? { ...chat, myAvatarForContact: res.data.avatar || user?.avatar, hasCustomAvatarForContact: false } : chat));
            setActiveChat(prev => prev ? { ...prev, myAvatarForContact: res.data.avatar || user?.avatar, hasCustomAvatarForContact: false } : prev);
        } catch (err) { alert(err.response?.data?.error || 'Could not restore default DP.'); }
    };

    const getOtherParticipant = (chat) => {
        if (!chat || chat.isGroup) return null;
        if (!Array.isArray(chat.participants)) return null;
        return chat.participants.find(participant => participant?.id && participant.id !== user?.id) || null;
    };

    const formatLastSeen = (lastSeen) => {
        if (!lastSeen) return "last seen recently";
        const date = new Date(lastSeen);
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        if (isToday) return `last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        return `last seen ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const openNotifications = () => {
        setShowNotifications(prev => !prev);
        setShowSearchModal(false);
        nav.setShowSettings(false);
        setUnreadCount(0);
        handleMarkAllRead();
    };

    // Navigation items
    const navItems = [
        {
            label: 'Chats',
            icon: ChatBubbleLeftRightIcon,
            active: !nav.showSocial && !nav.showReels,
            action: () => {
                nav.hideAppNavForFeature();
                nav.setShowReels(false);
                nav.setShowSocial(false);
               
                setActiveChat(null);
                localStorage.removeItem('activeChatId');
            }
        },
        { label: 'Reels', icon: PlayIcon, active: nav.showReels, action: () => { nav.hideAppNavForFeature(); nav.setShowSocial(false); nav.setShowReels(true); nav.setShowAiChat(false); } },
        { label: 'Social', icon: PhotoIcon, active: nav.showSocial, action: () => { nav.hideAppNavForFeature(); nav.setShowReels(false); nav.setShowSocial(true); nav.setShowAiChat(false); } },
        },
        { label: 'AI', icon: SparklesIcon, active: nav.showAiChat, action: () => { nav.hideAppNavForFeature(); nav.setShowReels(false); nav.setShowSocial(false); nav.setShowAiChat(true); nav.setShowSaskatAI(false); } },
        { label: 'Notify', icon: BellIcon, active: showNotifications, action: openNotifications, badge: unreadCount },
        { label: 'New', icon: PlusIcon, active: showSearchModal || showLinkPhoneModal, action: openNewChat },
        { label: 'Settings', icon: Cog6ToothIcon, active: nav.showSettings, action: () => { setShowNotifications(false); setShowSearchModal(false); nav.setShowSettings(true); } }
    ];

    const featureOverlayOpen = showSearchModal || showLinkPhoneModal || showNotifications || nav.showSettings || calls.showCallModal || calls.incomingCall;
    const appNavHidden = featureOverlayOpen || Boolean(activeChat);
    const customWallpaper = localStorage.getItem('custom_chat_wallpaper');
    const hasCustomWallpaper = prefs.wallpaper === 'custom' && Boolean(customWallpaper);
    const chatBackground = prefs.wallpaper === 'dots'
        ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0), #0b141a'
        : prefs.wallpaper === 'emerald'
            ? 'linear-gradient(135deg, #06251f, #111b21 55%, #17212b)'
            : prefs.wallpaper === 'white'
                ? '#ffffff'
                : prefs.wallpaper === 'sunset' ? 'linear-gradient(145deg, #431407, #9a3412 48%, #701a75)'
                : prefs.wallpaper === 'ocean' ? 'linear-gradient(145deg, #082f49, #0e7490 48%, #164e63)'
                : prefs.wallpaper === 'lavender' ? 'linear-gradient(145deg, #312e81, #6d28d9 52%, #4c1d95)'
                : prefs.wallpaper === 'rose' ? 'linear-gradient(145deg, #4c0519, #9f1239 52%, #831843)'
                : prefs.wallpaper === 'sand' ? 'linear-gradient(145deg, #78350f, #a16207 52%, #713f12)'
                : prefs.wallpaper === 'aurora' ? 'linear-gradient(135deg, #042f2e, #065f46 34%, #312e81 68%, #4c1d95)'
                : 'linear-gradient(to bottom, #0b141a, #0d1b22)';

    useEffect(() => {
        if (!appNavHidden) nav.setNavPeekOpen(false);
    }, [appNavHidden]);

    const unlockApp = async (event) => {
        event.preventDefault();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(unlockPin)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash === localStorage.getItem('app_lock_pin_hash')) {
            setAppLocked(false); setUnlockPin(''); setUnlockError('');
        } else {
            setUnlockError('Incorrect PIN');
        }
    };

    return (
        <div className="flex h-[100dvh] bg-signal-bg overflow-hidden text-gray-100 font-sans relative">
            <HomeModalsContainer
                snapNotice={snapNotice}
                setSnapNotice={setSnapNotice}
                chats={chats}
                setActiveChat={setActiveChat}
                appLocked={appLocked}
                unlockError={unlockError}
                setUnlockPin={setUnlockPin}
                unlockApp={unlockApp}
                unlockPin={unlockPin}
                isOnline={isOnline}
                editingMessage={editingMessage}
                setEditingMessage={setEditingMessage}
                editText={editText}
                setEditText={setEditText}
                submitEditMessage={submitEditMessage}
                forwardMessage={forwardMessage}
                setForwardMessage={setForwardMessage}
                visibleActiveChat={visibleActiveChat}
                handleForwardToChat={handleForwardToChat}
                showLinkPhoneModal={showLinkPhoneModal}
                setShowLinkPhoneModal={setShowLinkPhoneModal}
                handleLinkPhone={handleLinkPhone}
                linkPhone={linkPhone}
                setLinkPhone={setLinkPhone}
                linkPhoneError={linkPhoneError}
                linkingPhone={linkingPhone}
                showSearchModal={showSearchModal}
                setShowSearchModal={setShowSearchModal}
                searchModalTab={groups.searchModalTab}
                setSearchModalTab={groups.setSearchModalTab}
                handleSearchUser={handleSearchUser}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchError={searchError}
                searchedUser={searchedUser}
                startChat={startChat}
                handleCreateGroup={groups.handleCreateGroup}
                newGroupName={groups.newGroupName}
                setNewGroupName={groups.setNewGroupName}
                newGroupIsPublic={groups.newGroupIsPublic}
                setNewGroupIsPublic={groups.setNewGroupIsPublic}
                handleSearchGroups={groups.handleSearchGroups}
                groupSearchQuery={groups.groupSearchQuery}
                setGroupSearchQuery={groups.setGroupSearchQuery}
                loadingGroups={groups.loadingGroups}
                discoveredGroups={groups.discoveredGroups}
                handleJoinGroup={groups.handleJoinGroup}
                editNicknameChat={prefs.editNicknameChat}
                setEditNicknameChat={prefs.setEditNicknameChat}
                nicknameInput={prefs.nicknameInput}
                setNicknameInput={prefs.setNicknameInput}
                saveNickname={prefs.saveNickname}
                uploadProgress={uploadProgress}
                topInfoMessage={topInfoMessage}
                setTopInfoMessage={setTopInfoMessage}
                msgToDelete={msgToDelete}
                setMsgToDelete={setMsgToDelete}
                handleDeleteMessageConfirm={handleDeleteMessageConfirm}
                chatToDelete={chatToDelete}
                setChatToDelete={setChatToDelete}
                handleDeleteChatConfirm={handleDeleteChatConfirm}
                showEncryptionInfo={showEncryptionInfo}
                setShowEncryptionInfo={setShowEncryptionInfo}
                user={user}
                publicKey={publicKey}
                appNavHidden={appNavHidden}
                isMobile={nav.isMobile}
                navPeekOpen={nav.navPeekOpen}
                setNavPeekOpen={nav.setNavPeekOpen}
            />

            {/* Left side navigation rail */}
            <HomeNavigationRail
                navPeekOpen={nav.navPeekOpen}
                setNavPeekOpen={nav.setNavPeekOpen}
                appNavHidden={appNavHidden}
                navItems={navItems}
                user={user}
                mobileHomeTab={nav.mobileHomeTab}
                setMobileHomeTab={nav.setMobileHomeTab}
                totalUnreadMessages={totalUnreadMessages}
                setShowArchive={prefs.setShowArchive}
            />

            {/* Sidebar with Contacts and Status */}
            <ChatSidebar
                activeChat={activeChat}
                setActiveChat={setActiveChat}
                user={user}
                token={token}
                openNewChat={openNewChat}
                avatarInputRef={avatarInputRef}
                handleAvatarChange={handleAvatarChange}
                handleDeleteAvatar={handleDeleteAvatar}
                sidebarSearchQuery={sidebarSearchQuery}
                setSidebarSearchQuery={setSidebarSearchQuery}
                showSidebarEmoji={showSidebarEmoji}
                setShowSidebarEmoji={setShowSidebarEmoji}
                sidebarEmojiPickerRef={sidebarEmojiPickerRef}
                handleStatusGroupsChange={handleStatusGroupsChange}
                storyUserIds={storyUserIds}
                isMobile={nav.isMobile}
                mobileHomeTab={nav.mobileHomeTab}
                setMobileHomeTab={nav.setMobileHomeTab}
                archivedChatsList={archivedChatsList}
                filteredChats={filteredChats}
                loadingChats={loadingChats}
                showArchive={prefs.showArchive}
                setShowArchive={prefs.setShowArchive}
                nicknames={prefs.nicknames}
                mutedChats={prefs.mutedChats}
                pinnedChats={prefs.pinnedChats}
                totalUnreadMessages={totalUnreadMessages}
                startCallForChat={calls.startCallForChat}
            />

            {/* Main Chat View */}
            <ChatWindowView
                visibleActiveChat={visibleActiveChat}
                activeChat={activeChat}
                setActiveChat={setActiveChat}
                showChatDraw={showChatDraw}
                setShowChatDraw={setShowChatDraw}
                drawSource={drawSource}
                setDrawSource={setDrawSource}
                liveLocationSharing={liveLocationSharing}
                timeLeft={timeLeft}
                stopLiveLocation={stopLiveLocation}
                formatTimeLeft={formatTimeLeft}
                messages={messages}
                messagesContainerRef={messagesContainerRef}
                messagesEndRef={messagesEndRef}
                messageRefsMap={messageRefsMap}
                userScrolledUpRef={userScrolledUpRef}
                user={user}
                token={token}
                socket={socket}
                openActiveChatInfo={openActiveChatInfo}
                getChatDisplayName={prefs.getChatDisplayName}
                getOtherParticipant={getOtherParticipant}
                formatLastSeen={formatLastSeen}
                smartSpaceButtonEnabled={nav.smartSpaceButtonEnabled}
                setShowSmartSpace={nav.setShowSmartSpace}
                showMessageSearch={showMessageSearch}
                setShowMessageSearch={setShowMessageSearch}
                messageSearchQuery={messageSearchQuery}
                setMessageSearchQuery={setMessageSearchQuery}
                startCall={calls.startCall}
                showTopDropdown={showTopDropdown}
                setShowTopDropdown={setShowTopDropdown}
                aiEnabled={aiEnabled}
                setAiEnabled={setAiEnabled}
                setSmartSpaceButtonEnabled={nav.setSmartSpaceButtonEnabled}
                smartRepliesEnabled={smartRepliesEnabled}
                setSmartRepliesEnabled={setSmartRepliesEnabled}
                showTranslateEnabled={prefs.showTranslateEnabled}
                setShowTranslateEnabled={prefs.setShowTranslateEnabled}
                mutedChats={prefs.mutedChats}
                toggleMute={prefs.toggleMute}
                pinnedChats={prefs.pinnedChats}
                togglePinChat={prefs.togglePinChat}
                setShowEncryptionInfo={setShowEncryptionInfo}
                toggleArchive={prefs.toggleArchive}
                setEditNicknameChat={prefs.setEditNicknameChat}
                setNicknameInput={prefs.setNicknameInput}
                nicknames={prefs.nicknames}
                setShowInfoPanel={setShowInfoPanel}
                handleCopyMessage={handleCopyMessage}
                setForwardMessage={setForwardMessage}
                showTopReactions={showTopReactions}
                setShowTopReactions={setShowTopReactions}
                handleReactMessage={handleReactMessage}
                handlePinMessage={handlePinMessage}
                openEditMessage={openEditMessage}
                setTopInfoMessage={setTopInfoMessage}
                customWallpaper={customWallpaper}
                hasCustomWallpaper={hasCustomWallpaper}
                chatBackground={chatBackground}
                wallpaper={prefs.wallpaper}
                showBioBanner={showBioBanner}
                setShowBioBanner={setShowBioBanner}
                snapMode={snapMode}
                handleDeleteMessage={handleDeleteMessage}
                setReplyTo={setReplyTo}
                replyTo={replyTo}
                handleTranslate={handleTranslate}
                chatTranslationLang={chatTranslationLang}
                setChatTranslationLang={setChatTranslationLang}
                handleMessagePhotoSticker={handleMessagePhotoSticker}
                handlePlaceSticker={handlePlaceSticker}
                setPhotoReactionSource={setPhotoReactionSource}
                photoReactionSource={photoReactionSource}
                setCameraOpenRequest={setCameraOpenRequest}
                cameraOpenRequest={cameraOpenRequest}
                typingUsers={typingUsers}
                handleSendMessage={handleSendMessage}
                handleUpload={handleUpload}
                startLiveLocation={startLiveLocation}
                handleTyping={handleTyping}
                disappearingTtl={disappearingTtl}
                scheduleMessage={scheduleMessage}
            />

            {/* Chat & Group Info Drawer */}
            <ChatInfoDrawer
                showInfoPanel={showInfoPanel}
                setShowInfoPanel={setShowInfoPanel}
                visibleActiveChat={visibleActiveChat}
                user={user}
                token={token}
                messages={messages}
                groupRequests={groups.groupRequests}
                handleRespondRequest={groups.handleRespondRequest}
                handleToggleMuteGroup={groups.handleToggleMuteGroup}
                handleDeleteChat={handleDeleteChat}
                setChats={setChats}
                setActiveChat={setActiveChat}
                wallpaper={prefs.wallpaper}
                setWallpaper={prefs.setWallpaper}
                disappearingTtl={disappearingTtl}
                updateDisappearingTtl={updateDisappearingTtl}
                setShowChatDraw={setShowChatDraw}
                snapMode={snapMode}
                updateSnapMode={updateSnapMode}
                getOtherParticipant={getOtherParticipant}
                blockedUsers={blockedUsers}
                handleBlockUser={handleBlockUser}
                handleUnblockUser={handleUnblockUser}
                contactBusinessInfo={contactBusinessInfo}
                contactDpInputRef={contactDpInputRef}
                handleContactDpChange={handleContactDpChange}
                resetContactDp={resetContactDp}
                formatLastSeen={formatLastSeen}
            />

            {/* Calls Overlay */}
            <CallOverlayContainer
                showCallModal={calls.showCallModal}
                setShowCallModal={calls.setShowCallModal}
                callType={calls.callType}
                callRingState={calls.callRingState}
                preparedCallStreamRef={calls.preparedCallStreamRef}
                incomingCall={calls.incomingCall}
                acceptCall={calls.acceptCall}
                rejectCall={calls.rejectCall}
                activeChat={activeChat}
                setActiveChat={setActiveChat}
                fetchChats={fetchChats}
                token={token}
            />

            {/* Heavy Feature Overlays */}
            <FeatureOverlays
                showReels={nav.showReels}
                setShowReels={nav.setShowReels}
                shareReelToChat={shareReelToChat}
                showSocial={nav.showSocial}
                setShowSocial={nav.setShowSocial}
                socialDeepLink={nav.socialDeepLink}
                setSocialDeepLink={nav.setSocialDeepLink}
                shareSocialPostToChat={shareSocialPostToChat}
                openSocialDirectMessage={openSocialDirectMessage}
                showSaskatAI={nav.showSaskatAI}
                setShowSaskatAI={nav.setShowSaskatAI}
                showSettings={nav.showSettings}
                setShowSettings={nav.setShowSettings}
                user={user}
                token={token}
                logout={logout}
                updateUser={updateUser}
                theme={prefs.theme}
                wallpaper={prefs.wallpaper}
                setTheme={prefs.setTheme}
                setWallpaper={prefs.setWallpaper}
                setShowSmartSpace={nav.setShowSmartSpace}
                smartSpaceButtonEnabled={nav.smartSpaceButtonEnabled}
                setSmartSpaceButtonEnabled={nav.setSmartSpaceButtonEnabled}
                showAiChat={nav.showAiChat}
                setShowAiChat={nav.setShowAiChat}
                chats={chats}
                getOtherParticipant={getOtherParticipant}
                startCallForChat={calls.startCallForChat}
                fetchChats={fetchChats}
                showSmartSpace={nav.showSmartSpace}
                setActiveChat={setActiveChat}
                showNotifications={showNotifications}
                setShowNotifications={setShowNotifications}
                notifications={notifications}
                handleMarkSingleRead={handleMarkSingleRead}
                handleMarkAllRead={handleMarkAllRead}
                handleNotificationNavigate={(notif) => nav.handleNotificationNavigate(notif, setShowNotifications)}
                handleBirthdayWish={handleBirthdayWish}
                incomingCall={calls.incomingCall}
                showCallModal={calls.showCallModal}
            />
        </div>
    );
};

export default Home;
