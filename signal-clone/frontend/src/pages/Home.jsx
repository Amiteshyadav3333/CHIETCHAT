import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ContactList from '../components/ContactList';
import ChatBubble, { DateSeparator } from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import DrawStudio from '../components/DrawStudio';
import IncomingCallModal from '../components/IncomingCallModal';
import VideoCallModal from '../components/VideoCall';
import AvatarZoom from '../components/AvatarZoom';
import StatusSection from '../components/StatusSection';
import { ArrowLeftIcon, PhoneIcon, VideoCameraIcon, PlusIcon, EllipsisVerticalIcon, XMarkIcon, TrashIcon, NoSymbolIcon, PlayIcon, Cog6ToothIcon, BellIcon, MapPinIcon, PhotoIcon, ChatBubbleLeftRightIcon, InformationCircleIcon, ClipboardDocumentIcon, ForwardIcon, PencilSquareIcon, MicrophoneIcon, FaceSmileIcon, SparklesIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useEncryption } from '../hooks/useEncryption';
import { decryptEnvelope, encryptForRecipients, isEncryptedPayload } from '../utils/encryption';
import { compressImage, compressVideo, getFileCategory, formatFileSize } from '../utils/mediaCompressor';
import { enqueueOfflineMessage, processOfflineQueue } from '../utils/offlineQueue';
import {
    clearEncryptedMessageCache, loadEncryptedMessages, purgeLegacyMessageCaches, removeEncryptedMessage,
    saveEncryptedMessages, updateEncryptedMessageContent, upsertEncryptedMessage,
} from '../utils/encryptedMessageCache';
import { loadChatMetadata, saveChatMetadata } from '../utils/chatMetadataCache';
import { emitWithAcknowledgement } from '../utils/socketAcknowledgement';
import ChatPreferences from '../components/ChatPreferences';
import DeleteChatModal from '../components/DeleteChatModal';
import UserAvatar from '../components/UserAvatar';
import SidebarEmojiPicker from '../components/SidebarEmojiPicker';
import { AppLockOverlay, EditMessageModal, ForwardMessageModal, OfflineBanner } from '../components/HomeOverlays';

const Reels = React.lazy(() => import('./Reels'));
const Social = React.lazy(() => import('./Social'));
const PodLiveView = React.lazy(() => import('./PodLiveView'));
const AiChat = React.lazy(() => import('../components/AiChat'));
const AiSmartSpace = React.lazy(() => import('../components/AiSmartSpace'));
const SettingsModal = React.lazy(() => import('../components/SettingsModal'));
const NotificationPanel = React.lazy(() => import('../components/NotificationPanel'));

// ─── WhatsApp-style Emoji Picker ───────────────────────────────────────────

const FeatureLoader = () => (
    <div className="flex h-full w-full items-center justify-center bg-[#111b21] text-sm font-semibold text-[#00a884]">
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[#00a884]/30 border-t-[#00a884]" />
        Opening…
    </div>
);


const Home = () => {
    const { user, token, logout, updateUser } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);
    const { privateKey, publicKey } = useEncryption(user, token);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const [chats, setChats] = useState(() => {
        return loadChatMetadata(user?.id);
    });
    const [activeChat, setActiveChat] = useState(() => {
        try {
            const savedChatId = localStorage.getItem('activeChatId');
            if (savedChatId) {
                const found = loadChatMetadata(user?.id).find(c => c.id === parseInt(savedChatId, 10));
                if (found) return found;
            }
        } catch (e) {
            console.error("Failed to restore active chat synchronously", e);
        }
        return null;
    });
    const [messages, setMessages] = useState(() => {
        purgeLegacyMessageCaches();
        return [];
    });
    const [loadingChats, setLoadingChats] = useState(() => {
        return !loadChatMetadata(user?.id).length;
    });
    const [showCallModal, setShowCallModal] = useState(false);
    const [callType, setCallType] = useState('video');
    const [incomingCall, setIncomingCall] = useState(null);
    const [callRingState, setCallRingState] = useState({});
    const preparedCallStreamRef = useRef(null);
    const businessAutomationRef = useRef(null);
    const [replyTo, setReplyTo] = useState(null);
    const [showInfoPanel, setShowInfoPanel] = useState(false);
    const [contactBusinessInfo, setContactBusinessInfo] = useState(null);
    const [appLocked, setAppLocked] = useState(() => localStorage.getItem('app_lock_enabled') === '1');
    const [unlockPin, setUnlockPin] = useState('');
    const [unlockError, setUnlockError] = useState('');
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showReels, setShowReels] = useState(() => localStorage.getItem('activeView') === 'reels');
    const [showSocial, setShowSocial] = useState(() => localStorage.getItem('activeView') === 'social');
    const [showAiChat, setShowAiChat] = useState(() => localStorage.getItem('activeView') === 'ai');
    const [showSmartSpace, setShowSmartSpace] = useState(false);
    const [smartSpaceButtonEnabled, setSmartSpaceButtonEnabled] = useState(() => localStorage.getItem('smart_space_button_enabled') === '1');
    const [showPodlive, setShowPodlive] = useState(() => localStorage.getItem('activeView') === 'podlive');
    const [socialDeepLink, setSocialDeepLink] = useState(null); // { type: 'post'|'profile', id }
    const [showSettings, setShowSettings] = useState(() => localStorage.getItem('activeView') === 'settings');
    const [navPeekOpen, setNavPeekOpen] = useState(false);
    const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
    const [showSidebarEmoji, setShowSidebarEmoji] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobileHomeTab, setMobileHomeTab] = useState('chats');
    const [storyUserIds, setStoryUserIds] = useState([]);

    const handleStatusGroupsChange = useCallback((groups) => {
        setStoryUserIds(groups.map(group => group.user?.id).filter(Boolean));
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Search Modal States
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchedUser, setSearchedUser] = useState(null);
    const [searchError, setSearchError] = useState('');
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [liveLocationSharing, setLiveLocationSharing] = useState(null); // { chatId, expiry, intervalId }
    const [timeLeft, setTimeLeft] = useState(null);
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

    // ── Archive / Mute / Nickname / Pin (local device storage) ──
    const [archivedChats, setArchivedChats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('archived_chats') || '[]'); } catch { return []; }
    });
    const [mutedChats, setMutedChats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('muted_chats') || '[]'); } catch { return []; }
    });
    const [pinnedChats, setPinnedChats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('pinned_chats') || '[]'); } catch { return []; }
    });
    const [nicknames, setNicknames] = useState(() => {
        try { return JSON.parse(localStorage.getItem('chat_nicknames') || '{}'); } catch { return {}; }
    });
    const [showArchive, setShowArchive] = useState(false);
    const [editNicknameChat, setEditNicknameChat] = useState(null);
    const [nicknameInput, setNicknameInput] = useState('');
    const [showTranslateEnabled, setShowTranslateEnabled] = useState(() => localStorage.getItem('translate_btn_enabled') !== 'false');

    const toggleArchive = (chatId) => {
        setArchivedChats(prev => {
            const next = prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId];
            localStorage.setItem('archived_chats', JSON.stringify(next));
            return next;
        });
    };
    const toggleMute = (chatId) => {
        setMutedChats(prev => {
            const next = prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId];
            localStorage.setItem('muted_chats', JSON.stringify(next));
            return next;
        });
    };
    const togglePinChat = (chatId) => {
        setPinnedChats(prev => {
            const next = prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId];
            localStorage.setItem('pinned_chats', JSON.stringify(next));
            return next;
        });
    };
    const saveNickname = (chatId, name) => {
        setNicknames(prev => {
            const next = { ...prev, [chatId]: name };
            localStorage.setItem('chat_nicknames', JSON.stringify(next));
            return next;
        });
    };
    const getChatDisplayName = (chat) => nicknames[chat.id] || chat.name;

    useEffect(() => {
        setShowBioBanner(true);
    }, [activeChat]);
    const [theme, setTheme] = useState(() => localStorage.getItem('chat_theme') || 'dark');
    const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('chat_wallpaper') || 'white');
    const [drawSource, setDrawSource] = useState(null);
    const [showChatDraw, setShowChatDraw] = useState(false);
    const [disappearingTtl, setDisappearingTtl] = useState(0);
    const [snapMode, setSnapMode] = useState(false);
    const [showTopDropdown, setShowTopDropdown] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [showTopReactions, setShowTopReactions] = useState(false);
    const [topInfoMessage, setTopInfoMessage] = useState(null);
    // Upload progress state
    const [uploadProgress, setUploadProgress] = useState(null); // null | { fileName, stage, percent, originalSize, compressedSize }

    // Group states
    const [searchModalTab, setSearchModalTab] = useState('search_user'); // 'search_user' | 'create_group' | 'discover_groups'
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupIsPublic, setNewGroupIsPublic] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState('');
    const [discoveredGroups, setDiscoveredGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupRequests, setGroupRequests] = useState([]);

    const visibleActiveChat = activeChat
        ? chats.find(chat => chat.id === activeChat.id) || activeChat
        : null;

    const filteredChats = chats
        .filter(chat => !archivedChats.includes(chat.id))
        .filter(chat => chat.name?.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
        .sort((a, b) => {
            const aPin = pinnedChats.includes(a.id) ? 1 : 0;
            const bPin = pinnedChats.includes(b.id) ? 1 : 0;
            return bPin - aPin;
        });

    const archivedChatsList = chats.filter(chat => archivedChats.includes(chat.id));
    const totalUnreadMessages = chats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0);

    // Non-Encrypted Ref
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const userScrolledUpRef = useRef(false);
    const avatarInputRef = useRef(null);
    const contactDpInputRef = useRef(null);
    const activeChatRef = useRef(activeChat);
    const chatsRef = useRef(chats);
    const showCallModalRef = useRef(showCallModal);
    const callStartInFlightRef = useRef(false);
    const messageRefsMap = useRef({});
    const sidebarEmojiPickerRef = useRef(null);

    const scheduleMessage = async (content, sendAt) => {
        const chat = visibleActiveChat;
        if (!chat || !publicKey) throw new Error('Encryption keys are not ready');
        const recipientPublicKeys = {};
        for (const participant of chat.participants) {
            const participantPublicKey = participant.id === user.id ? publicKey : participant.publicKey;
            if (!participantPublicKey) throw new Error('A participant encryption key is unavailable');
            recipientPublicKeys[participant.id] = participantPublicKey;
        }
        const encryptedContent = await encryptForRecipients(recipientPublicKeys, content);
        const clientMessageId = `scheduled_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
        await axios.post(`/api/chats/${chat.id}/scheduled-messages`, {
            content: encryptedContent, scheduledFor: sendAt, clientMessageId,
        }, { headers: { Authorization: `Bearer ${token}` } });
    };

    useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
    useEffect(() => { chatsRef.current = chats; }, [chats]);
    useEffect(() => { showCallModalRef.current = showCallModal; }, [showCallModal]);
    useEffect(() => { localStorage.setItem('chat_theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('chat_wallpaper', wallpaper); }, [wallpaper]);

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

    const processQueue = useCallback(async () => {
        if (!navigator.onLine || !socket || !socket.connected || !publicKey) return;
        await processOfflineQueue(user.id, async (msg) => {
            const chat = chatsRef.current.find(c => c.id === msg.chatId);
            if (!chat) throw new Error('Queued chat is no longer available');

            const recipientPublicKeys = {};
            for (const participant of chat.participants) {
                const participantPublicKey = participant.id === user.id
                    ? publicKey
                    : participant.publicKey;
                if (!participantPublicKey) throw new Error('A participant encryption key is unavailable');
                recipientPublicKeys[participant.id] = participantPublicKey;
            }

            // Legacy queues may contain plaintext from older builds. New writes are
            // rejected unless already encrypted, so this branch is migration-only.
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
        const handleOnline = () => {
            setIsOnline(true);
            processQueue();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [processQueue]);

    // Persist active view for refresh survival
    useEffect(() => {
        const view = showReels ? 'reels' : showSocial ? 'social' : showPodlive ? 'podlive' : showSmartSpace ? 'smart-space' : showSettings ? 'settings' : 'chats';
        localStorage.setItem('activeView', view);
    }, [showReels, showSocial, showPodlive, showSmartSpace, showSettings]);

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

    const decryptMessageForCurrentUser = useCallback(async (message) => {
        if (!privateKey || !user) return message;

        const isEncrypted = isEncryptedPayload(message.content);
        if (!isEncrypted) {
            return {
                ...message,
                encryptedContent: false
            };
        }

        try {
            const decrypted = await decryptEnvelope(privateKey, user.id, message.content);
            return {
                ...message,
                encryptedContent: true,
                content: decrypted
            };
        } catch (err) {
            console.error("Failed to decrypt message:", message.id, err);
            return {
                ...message,
                encryptedContent: true,
                content: "[Decryption failed]"
            };
        }
    }, [privateKey, user]);

    const decryptMessagesForCurrentUser = useCallback(async (incomingMessages) => {
        return Promise.all(incomingMessages.map(decryptMessageForCurrentUser));
    }, [decryptMessageForCurrentUser]);

    const fetchGroupRequests = useCallback(async (chatId) => {
        if (!token) return;
        try {
            const res = await axios.get(`/api/groups/${chatId}/requests`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setGroupRequests(res.data);
        } catch (err) {
            console.error("Error fetching group requests", err);
        }
    }, [token]);

    const fetchPublicGroups = useCallback(async () => {
        if (!token) return;
        setLoadingGroups(true);
        try {
            const res = await axios.get('/api/groups/public', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDiscoveredGroups(res.data);
        } catch (err) {
            console.error("Error fetching public groups", err);
        } finally {
            setLoadingGroups(false);
        }
    }, [token]);

    const handleRespondRequest = async (reqId, action) => {
        if (!token || !visibleActiveChat) return;
        try {
            await axios.post(`/api/groups/requests/${reqId}/respond`, { action }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchGroupRequests(visibleActiveChat.id);
            await fetchChats();
        } catch (err) {
            console.error("Error responding to request", err);
            alert(err.response?.data?.error || "Action failed");
        }
    };

    const handleToggleMuteGroup = async () => {
        if (!token || !visibleActiveChat) return;
        try {
            const res = await axios.post(`/api/groups/${visibleActiveChat.id}/toggle-chat`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setChats(prev => prev.map(c => c.id === visibleActiveChat.id ? { ...c, isChatDisabled: res.data.isChatDisabled } : c));
            setActiveChat(prev => prev && prev.id === visibleActiveChat.id ? { ...prev, isChatDisabled: res.data.isChatDisabled } : prev);
        } catch (err) {
            console.error("Error toggling group chat mute", err);
            alert(err.response?.data?.error || "Action failed");
        }
    };

    const handleSearchGroups = async (e) => {
        if (e) e.preventDefault();
        if (!token) return;
        if (!groupSearchQuery.trim()) {
            fetchPublicGroups();
            return;
        }
        setLoadingGroups(true);
        try {
            const res = await axios.post('/api/groups/search', { query: groupSearchQuery }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDiscoveredGroups(res.data);
        } catch (err) {
            console.error("Error searching groups", err);
        } finally {
            setLoadingGroups(false);
        }
    };

    const handleJoinGroup = async (group) => {
        if (!token) return;
        try {
            const res = await axios.post(`/api/groups/${group.id}/join`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.joined) {
                const updatedChats = await fetchChats();
                const newChat = updatedChats.find(chat => chat.id === group.id);
                if (newChat) setActiveChat(newChat);
                setShowSearchModal(false);
            } else if (res.data.pending) {
                alert("Request to join private group sent to the admin.");
                setDiscoveredGroups(prev => prev.map(g => g.id === group.id ? { ...g, hasPendingRequest: true } : g));
            }
        } catch (err) {
            console.error("Error joining group", err);
            alert(err.response?.data?.error || "Failed to join group");
        }
    };

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        if (!newGroupName.trim() || !token) {
            alert("Group name is required");
            return;
        }
        try {
            const res = await axios.post('/api/groups/create', {
                name: newGroupName,
                isPublic: newGroupIsPublic
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const updatedChats = await fetchChats();
            const newChat = updatedChats.find(chat => chat.id === res.data.id);
            if (newChat) setActiveChat(newChat);
            setNewGroupName('');
            setNewGroupIsPublic(false);
            setShowSearchModal(false);
        } catch (err) {
            console.error("Error creating group", err);
            alert(err.response?.data?.error || "Failed to create group");
        }
    };

    useEffect(() => {
        if (token) fetchChats({ restoreActive: true });
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
            const res = await axios.get('/api/notifications', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(res.data);
            setUnreadCount(res.data.filter(n => !n.isRead).length);
        } catch (err) { console.error(err); }
    };

    const handleMarkAllRead = async () => {
        if (!token) return;
        try {
            await axios.post('/api/notifications/read', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) { console.error(err); }
    };

    const handleMarkSingleRead = async (notifId) => {
        try {
            await axios.post(`/api/notifications/${notifId}/read`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) { console.error(err); }
    };

    // Navigate to the activity from a notification click
    const handleNotificationNavigate = (notification) => {
        setShowNotifications(false);
        setShowReels(false);
        setShowPodlive(false);
        const { type, targetId } = notification;

        // Social-related activities → open Social page with deep link
        if (['like', 'comment', 'comment_reply', 'retweet', 'share'].includes(type)) {
            // targetId is post_id
            setSocialDeepLink({ type: 'post', id: targetId });
            setShowSocial(true);
        } else if (type === 'follow') {
            // targetId is the follower's user_id
            setSocialDeepLink({ type: 'profile', id: notification.sender?.id || targetId });
            setShowSocial(true);
        } else if (type === 'channel_request') {
            // targetId is channel_id
            setSocialDeepLink({ type: 'channel', id: targetId });
            setShowSocial(true);
        } else {
            // Default: just open social feed
            setShowSocial(true);
        }
    };

    // Persist active chat logic
    useEffect(() => {
        if (activeChat) {
            localStorage.setItem('activeChatId', activeChat.id);
            setChats(prev => prev.map(chat => (
                chat.id === activeChat.id ? { ...chat, unreadCount: 0 } : chat
            )));
        }
    }, [activeChat]);

    // Persist chats list on changes
    useEffect(() => {
        if (user?.id && chats && chats.length > 0) {
            try {
                saveChatMetadata(user.id, chats);
            } catch (e) {
                console.error("Failed to cache chats", e);
            }
        }
    }, [chats, user?.id]);

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

    useEffect(() => {
        if (!snapMode) return;
        const blockCaptureShortcut = event => {
            const captureShortcut = event.key === 'PrintScreen' || ((event.metaKey || event.ctrlKey) && event.shiftKey && ['3', '4', '5', 's', 'S'].includes(event.key));
            if (!captureShortcut) return;
            event.preventDefault();
            navigator.clipboard?.writeText('').catch(() => {});
        };
        document.addEventListener('keydown', blockCaptureShortcut, true);
        document.body.classList.add('snap-mode-active');
        return () => {
            document.removeEventListener('keydown', blockCaptureShortcut, true);
            document.body.classList.remove('snap-mode-active');
        };
    }, [snapMode]);

    useEffect(() => {
        if (showInfoPanel && visibleActiveChat?.isGroup && visibleActiveChat.groupAdminId === user?.id) {
            fetchGroupRequests(visibleActiveChat.id);
        }
    }, [showInfoPanel, visibleActiveChat?.id, visibleActiveChat?.isGroup, visibleActiveChat?.groupAdminId, user?.id]);

    useEffect(() => {
        if (showSearchModal && searchModalTab === 'discover_groups') {
            fetchPublicGroups();
        }
    }, [showSearchModal, searchModalTab]);

    useEffect(() => {
        if (!socket) return;

        if (user) {
            socket.emit('join_room', { room: 'global', userId: user.id });
        }

        if (socket.connected) {
            processQueue();
        }

        socket.on('connect', () => {
            processQueue();
            // Cached conversations are already visible; reconcile silently once
            // the network/socket is ready so the latest messages appear.
            fetchChats();
        });

        socket.on('incoming_call', (data) => {
            if (!showCallModalRef.current) {
                setIncomingCall(data);
                // Send ringing confirmation back to the caller
                socket.emit('confirm_ring', { callerId: data.callerId, chatId: data.chatId });
            }
        });

        socket.on('ring_status', (data) => {
            setCallRingState(prev => ({ ...prev, [data.chatId]: data.status }));
        });

        socket.on('snap_mode_update', ({ chatId, enabled, snapExpiresAt }) => {
            localStorage.setItem(`chat_snap_mode_${chatId}`, enabled ? '1' : '0');
            setChats(current => current.map(chat => chat.id === chatId ? { ...chat, snapMode: enabled } : chat));
            setActiveChat(current => current?.id === chatId ? { ...current, snapMode: enabled } : current);
            if (!enabled && snapExpiresAt && activeChatRef.current?.id === chatId) {
                setMessages(current => current.map(message => message.snapMode && !message.snapExpiresAt
                    ? { ...message, snapExpiresAt }
                    : message));
            }
            if (activeChatRef.current?.id === chatId) setSnapMode(enabled);
        });

        socket.on('peer_ringing', (data) => {
            setCallRingState(prev => ({ ...prev, [data.chatId]: 'ringing' }));
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
                            if (key) recipientPublicKeys[participant.id] = key;
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
                if (localStorage.getItem('message_sounds') !== '0') {
                    const customAudio = localStorage.getItem('custom_notification_audio');
                    if (customAudio) {
                        new Audio(customAudio).play().catch(() => {});
                    } else {
                        try {
                            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                            const context = new AudioContextClass();
                            const oscillator = context.createOscillator();
                            const gain = context.createGain();
                            oscillator.frequency.value = 740; gain.gain.value = 0.08;
                            oscillator.connect(gain); gain.connect(context.destination);
                            oscillator.start(); oscillator.stop(context.currentTime + 0.12);
                            oscillator.onended = () => context.close().catch(() => {});
                        } catch { /* browser blocked audio until user interaction */ }
                    }
                }
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
                    // Replace optimistic message from same sender, or skip if already exists
                    if (readableMsg.senderId === user.id) {
                        const hasOptimistic = prev.some(m => (
                            m._isOptimistic && m.senderId === user.id && m.chatId === readableMsg.chatId &&
                            (!readableMsg.clientMessageId || m.clientMessageId === readableMsg.clientMessageId)
                        ));
                        if (hasOptimistic) {
                            // Replace the oldest optimistic msg from this user
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
                    fetchChats(); // Fetch if chat not in list
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

        socket.on('poll_vote_update', ({ id, votes }) => {
            setMessages(prev => prev.map(m => m.id === id ? { ...m, votes } : m));
        });

        socket.on('typing_update', ({ chatId, userId, username, isTyping }) => {
            setTypingUsers(prev => {
                const chatTyping = { ...(prev[chatId] || {}) };
                if (isTyping) chatTyping[userId] = username;
                else delete chatTyping[userId];
                return { ...prev, [chatId]: chatTyping };
            });
        });

        socket.on('presence_update', ({ userId, isOnline, lastSeen }) => {
            setChats(prev => prev.map(chat => ({
                ...chat,
                participants: chat.participants.map(participant =>
                    participant.id === userId
                        ? { ...participant, isOnline, lastSeen }
                        : participant
                )
            })));

            setActiveChat(prev => prev ? {
                ...prev,
                participants: prev.participants.map(participant =>
                    participant.id === userId
                        ? { ...participant, isOnline, lastSeen }
                        : participant
                )
            } : prev);
        });

        socket.on('user_profile_updated', ({ user: updatedUser }) => {
            setChats(prev => prev.map(chat => ({
                ...chat,
                avatar: !chat.isGroup && chat.participants.some(participant => participant.id === updatedUser.id)
                    ? updatedUser.avatar
                    : chat.avatar,
                participants: chat.participants.map(participant =>
                    participant.id === updatedUser.id
                        ? { ...participant, ...updatedUser }
                        : participant
                )
            })));

            setActiveChat(prev => prev ? {
                ...prev,
                avatar: !prev.isGroup && prev.participants.some(participant => participant.id === updatedUser.id)
                    ? updatedUser.avatar
                    : prev.avatar,
                participants: prev.participants.map(participant =>
                    participant.id === updatedUser.id
                        ? { ...participant, ...updatedUser }
                        : participant
                )
            } : prev);
        });

        socket.on('audience_avatar_updated', ({ ownerId, avatar }) => {
            setChats(prev => prev.map(chat => {
                if (chat.isGroup || !chat.participants?.some(participant => participant.id === ownerId)) return chat;
                return {
                    ...chat,
                    avatar,
                    participants: chat.participants.map(participant => participant.id === ownerId
                        ? { ...participant, avatar }
                        : participant)
                };
            }));
            setActiveChat(prev => {
                if (!prev || prev.isGroup || !prev.participants?.some(participant => participant.id === ownerId)) return prev;
                return {
                    ...prev,
                    avatar,
                    participants: prev.participants.map(participant => participant.id === ownerId
                        ? { ...participant, avatar }
                        : participant)
                };
            });
        });


        socket.on('new_notification', (data) => {
            // Normalize the payload into the same shape as the REST API returns
            const normalized = {
                id: data.id,
                type: data.type,
                content: data.content,
                targetId: data.targetId,
                postPreview: data.postPreview || null,
                isRead: false,
                createdAt: data.createdAt,
                sender: data.sender || {
                    id: null,
                    username: data.senderName || 'Someone',
                    avatar: data.senderAvatar || null,
                }
            };
            setNotifications(prev => [normalized, ...prev]);
            setUnreadCount(count => count + 1);
        });

        socket.on('live_location_update', ({ chatId, userId, lat, lng }) => {
            if (activeChatRef.current?.id === chatId) {
                // Update specific message or show on map
                setMessages(prev => prev.map(m => 
                    m.type === 'live_location' && m.senderId === userId 
                    ? { ...m, content: JSON.stringify({ lat, lng }) } 
                    : m
                ));
            }
        });

        return () => {
            socket.off('connect');
            socket.off('poll_vote_update');
            socket.off('receive_message');
            socket.off('incoming_call');
            socket.off('ring_status');
            socket.off('peer_ringing');
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
        };
    }, [socket, user, publicKey, fetchChats, decryptMessageForCurrentUser, processQueue]);

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
            } catch (err) {
                console.error(err);
            }
        };
        fetchMessages();
        return () => { cancelled = true; };
    }, [activeChat?.id, token, socket, privateKey, user?.id, decryptMessagesForCurrentUser]);

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

    const handleSendMessage = async (text, type = 'text', replyMsg = null, ttl = 0, assetId = null) => {
        ttl = Number(ttl || 0);
        if (!activeChat?.id || !user?.id) {
            console.warn('Message send skipped because the chat session is not ready.');
            return;
        }
        const participants = Array.isArray(activeChat.participants)
            ? activeChat.participants.filter(participant => participant?.id)
            : [];
        if (participants.length === 0) {
            alert('Chat information is still loading. Please try again in a moment.');
            return;
        }

        // Optimistic UI: show message instantly before encryption/server round trip
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

        // Update chat list preview immediately
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
            setMessages(prev => prev.map(message => message.id === tempId
                ? { ...message, status: 'failed' }
                : message));
            alert("Encryption keys are still loading. Please try again in a moment.");
            return;
        }

        // Encrypt and send in background
        let encryptedContent = null;
        try {
            const recipientPublicKeys = {};
            for (const participant of participants) {
                const participantPublicKey = participant.id === user.id
                    ? publicKey
                    : participant.publicKey;
                if (!participantPublicKey) throw new Error('A participant encryption key is unavailable');
                recipientPublicKeys[participant.id] = participantPublicKey;
            }

            encryptedContent = await encryptForRecipients(recipientPublicKeys, text);

            if (!navigator.onLine || !socket || !socket.connected) {
                enqueueOfflineMessage(user.id, activeChat.id, encryptedContent, type, replyMsg, ttl, tempId, assetId, null, snapMode);
                setMessages(prev => prev.map(message => message.id === tempId
                    ? { ...message, status: 'queued' }
                    : message));
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

    const handleUpload = async (file) => {
        if (!token) { logout(); return; }

        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('File is too large (Max 100MB)');
            return;
        }

        const category = getFileCategory(file);
        const originalSize = file.size;
        let fileToUpload = file;
        const sendHd = localStorage.getItem('hd_media') === '1';
        const dataSaver = localStorage.getItem('data_saver') === '1';

        // ── COMPRESSION STEP ──
        try {
            if (sendHd && (category === 'image' || category === 'video')) {
                setUploadProgress({ fileName: file.name, stage: 'HD original selected. Uploading…', percent: 5, originalSize, compressedSize: originalSize });
            } else if (category === 'image') {
                setUploadProgress({ fileName: file.name, stage: 'Compressing image...', percent: 10, originalSize, compressedSize: null });
                fileToUpload = await compressImage(file, dataSaver
                    ? { maxWidth: 960, maxHeight: 960, quality: 0.62 }
                    : undefined);
                setUploadProgress(prev => ({
                    ...prev,
                    stage: 'Image compressed! Uploading...',
                    percent: 30,
                    compressedSize: fileToUpload.size
                }));
            } else if (category === 'video') {
                setUploadProgress({ fileName: file.name, stage: 'Compressing video...', percent: 5, originalSize, compressedSize: null });
                fileToUpload = await compressVideo(file, {
                    videoBitsPerSecond: dataSaver ? 650000 : 1200000,
                    onProgress: (p) => setUploadProgress(prev => ({
                        ...prev,
                        stage: `Compressing video... ${Math.round(p)}%`,
                        percent: Math.round(p * 0.5) // compression = 0-50% of progress bar
                    }))
                });
                setUploadProgress(prev => ({
                    ...prev,
                    stage: 'Video compressed! Uploading...',
                    percent: 55,
                    compressedSize: fileToUpload.size
                }));
            } else {
                // Audio/document — upload directly with progress
                setUploadProgress({ fileName: file.name, stage: 'Preparing upload...', percent: 5, originalSize, compressedSize: null });
            }
        } catch (compressErr) {
            console.warn('Compression failed, using original:', compressErr);
            fileToUpload = file;
        }

        // ── UPLOAD STEP ──
        const formData = new FormData();
        formData.append('file', fileToUpload);
        try {
            const res = await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                },
                timeout: 3600000,
                onUploadProgress: (progressEvent) => {
                    const pct = progressEvent.total
                        ? Math.round((progressEvent.loaded / progressEvent.total) * 100)
                        : 50;
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
            let type = 'file';
            const isImage = file.type.startsWith('image/') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const isAudio = file.type.startsWith('audio/') || file.name.startsWith('voice-') || url.match(/\.(mp3|wav|m4a|aac|oga)$/i);
            const isVideo = !isAudio && (file.type.startsWith('video/') || url.match(/\.(mp4|webm|ogg|mov)$/i));

            if (isImage) type = 'image';
            else if (isAudio) type = 'audio';
            else if (isVideo) type = file.name.startsWith('video-note-') ? 'video_note' : 'video';

            setUploadProgress(null);
            handleSendMessage(url, type, null, disappearingTtl, res.data.assetId);
        } catch (err) {
            setUploadProgress(null);
            console.error(err);
            const msg = err.response?.data?.error || err.response?.statusText || err.message;
            alert('Upload failed: ' + msg);
        }
    };

    const handleSearchUser = async (e) => {
        e.preventDefault();
        setSearchError('');
        setSearchedUser(null);

        const query = searchQuery.trim();
        const isHandleSearch = query.startsWith('@');
        const phoneDigits = query.replace(/\D/g, '');
        const isPhoneSearch = !isHandleSearch && phoneDigits.length > 0 && phoneDigits.length === query.replace(/\s/g, '').length;

        if (!query) {
            setSearchError('Enter a phone number, @handle, or name');
            return;
        }

        if (isPhoneSearch && phoneDigits.length !== 10) {
            setSearchError('Phone number must be exactly 10 digits');
            return;
        }

        const searchPayload = isPhoneSearch ? phoneDigits : query;

        try {
            const res = await axios.post('/api/user/search', { query: searchPayload }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.error) {
                setSearchError(res.data.error);
            } else {
                setSearchedUser(res.data);
            }
        } catch (err) {
            setSearchError(err.response?.data?.error || "User not found");
        }
    };

    const requestCallPermissions = async (type = 'video') => {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            alert('Calls need camera/microphone access in a secure HTTPS browser window.');
            return false;
        }

        try {
            const permissionStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: type === 'voice' ? false : {
                    facingMode: 'user',
                    width: { ideal: 960, max: 1280 },
                    height: { ideal: 540, max: 720 },
                    frameRate: { ideal: 24, max: 30 }
                }
            });
            return permissionStream;
        } catch (err) {
            const device = type === 'voice' ? 'microphone' : 'camera and microphone';
            if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
                alert(`Please allow ${device} access in your browser settings, then try the call again.`);
            } else if (err?.name === 'NotFoundError') {
                alert(`No usable ${device} was found on this device.`);
            } else {
                alert(`Could not access the ${device}. Close other apps using them and try again.`);
            }
            return null;
        }
    };

    const startCallForChat = async (chat, type = 'video') => {
        if (callStartInFlightRef.current || showCallModalRef.current) return;
        if (!chat?.id || !user?.id || !socket) {
            alert('Call information is still loading. Please try again in a moment.');
            return;
        }
        const participants = Array.isArray(chat.participants)
            ? chat.participants.filter(participant => participant?.id)
            : [];
        if (participants.length === 0) {
            alert('This chat has no available call participants.');
            return;
        }
        callStartInFlightRef.current = true;
        try {
            const preparedStream = await requestCallPermissions(type);
            if (!preparedStream) return;
            preparedCallStreamRef.current?.getTracks().forEach(track => track.stop());
            preparedCallStreamRef.current = preparedStream;
            setActiveChat(chat);
            setCallType(type);
            socket.emit('notify_ring', {
                chatId: chat.id,
                callerName: user.username || 'CHEETCHAT user',
                callerId: user.id,
                participants: participants.map(participant => participant.id),
                callType: type
            });
            setShowCallModal(true);
        } finally {
            callStartInFlightRef.current = false;
        }
    };

    const startCall = async (type = 'video') => {
        await startCallForChat(activeChat, type);
    };

    const handleDeleteChat = (chatId) => {
        setChatToDelete(chatId);
    };

    const handleDeleteChatConfirm = async (chatId, option) => {
        try {
            await axios.delete(`/api/chats/${chatId}?option=${option}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChat?.id === chatId) {
                setActiveChat(null);
                localStorage.removeItem('activeChatId');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setChatToDelete(null);
        }
    };

    const handleDeleteMessage = (message) => {
        setMsgToDelete(message);
    };

    const handleDeleteMessageConfirm = async (messageId, option) => {
        try {
            const res = await axios.delete(`/api/messages/${messageId}?option=${option}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (option === 'everyone') {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '', type: 'deleted', deletedAt: res.data.deletedAt } : m));
            } else {
                setMessages(prev => prev.filter(m => m.id !== messageId));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setMsgToDelete(null);
        }
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
        try {
            await navigator.clipboard.writeText(message.content || '');
        } catch {
            alert('Could not copy message');
        }
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
        } catch (err) {
            console.error(err);
            alert('Could not edit message');
        }
    };

    const handleReactMessage = async (message, emoji) => {
        try {
            const res = await axios.post(`/api/messages/${message.id}/react`, { emoji }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const reactionsStr = res.data.reactions;
            setMessages(prev => prev.map(m => String(m.id) === String(message.id) ? { ...m, reactions: reactionsStr } : m));
        } catch (err) { console.error(err); }
    };

    const handlePinMessage = async (message) => {
        try {
            const res = await axios.post(`/api/messages/${message.id}/pin`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
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
                recipientPublicKeys[participant.id] = participantPublicKey;
            }
            encryptedContent = await encryptForRecipients(recipientPublicKeys, forwardMessage.content);
            if (!navigator.onLine || !socket?.connected) {
                enqueueOfflineMessage(
                    user.id, targetChat.id, encryptedContent,
                    forwardMessage.type || 'text', null, 0, clientMessageId
                );
                setForwardMessage(null);
                alert('Network unavailable. The share is queued and will send when you reconnect.');
                return;
            }
            await emitWithAcknowledgement(socket, 'send_message', {
                chatId: targetChat.id,
                clientMessageId,
                content: encryptedContent,
                type: forwardMessage.type || 'text',
                ttl: 0,
                replyToId: null,
                replyContent: null,
                replySenderName: null
            });
            setForwardMessage(null);
        } catch (err) {
            console.error(err);
            if (err.retryable !== false && encryptedContent) {
                enqueueOfflineMessage(
                    user.id, targetChat.id, encryptedContent,
                    forwardMessage.type || 'text', null, 0, clientMessageId
                );
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
        setShowReels(false);
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
        setShowSocial(false);
        setForwardMessage({
            content: `${caption ? `${caption}\n` : ''}${postUrl}`,
            type: 'text',
            _shareSource: 'social',
        });
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

    const acceptCall = async () => {
        if (incomingCall) {
            const incomingType = incomingCall.callType || 'video';
            const preparedStream = await requestCallPermissions(incomingType);
            if (!preparedStream) return;
            preparedCallStreamRef.current?.getTracks().forEach(track => track.stop());
            preparedCallStreamRef.current = preparedStream;
            let chat = chats.find(c => c.id === incomingCall.chatId);
            if (!chat) {
                const updatedChats = await fetchChats();
                chat = updatedChats.find(c => c.id === incomingCall.chatId);
            }
            if (chat) {
                setActiveChat(chat);
                setCallType(incomingType);
                setShowCallModal(true);
            } else {
                alert("Could not load chat information for this call.");
            }
            setIncomingCall(null);
        }
    };

    const rejectCall = () => {
        setIncomingCall(null);
    };

    const startLiveLocation = (chatId) => {
        if (liveLocationSharing) stopLiveLocation();

        const expiry = Date.now() + 30 * 60 * 1000;
        const intervalId = setInterval(() => {
            if (Date.now() > expiry) {
                stopLiveLocation();
                return;
            }
            navigator.geolocation.getCurrentPosition((pos) => {
                socket.emit('live_location_update', {
                    chatId,
                    userId: user.id,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
                setTimeLeft(Math.max(0, Math.round((expiry - Date.now()) / 1000)));
            });
        }, 10000);

        setLiveLocationSharing({ chatId, expiry, intervalId });
        // Initial send
        navigator.geolocation.getCurrentPosition((pos) => {
            handleSendMessage(JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }), 'live_location');
        });
    };

    const stopLiveLocation = () => {
        if (liveLocationSharing?.intervalId) {
            clearInterval(liveLocationSharing.intervalId);
        }
        setLiveLocationSharing(null);
        setTimeLeft(null);
    };

    const handleTranslate = useCallback(async (text, targetLang, sourceLang = 'auto') => {
        if (!token) return '';
        try {
            const res = await axios.post('/api/translate', {
                text,
                target_lang: targetLang,
                source_lang: sourceLang
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.translatedText;
        } catch (err) {
            console.error("Translation error", err);
            throw err;
        }
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
            !chat.isGroup &&
            chat.participants?.some(participant => participant.id === searchedUser.id)
        );

        if (existingChat) {
            setActiveChat(existingChat);
            setShowSearchModal(false);
            setSearchQuery('');
            setSearchedUser(null);
            return;
        }

        try {
            const res = await axios.post('/api/chats/create', {
                participants: [user.id, searchedUser.id],
                isGroup: false
            }, {
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
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
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
                ? { ...chat, myAvatarForContact: res.data.avatar, hasCustomAvatarForContact: true }
                : chat));
            setActiveChat(prev => prev ? { ...prev, myAvatarForContact: res.data.avatar, hasCustomAvatarForContact: true } : prev);
        } catch (err) {
            alert(err.response?.data?.error || 'Could not set contact-specific DP.');
        }
    };

    const resetContactDp = async (contactId) => {
        if (!contactId) return;
        try {
            const res = await axios.delete(`/api/user/contact-avatar/${contactId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setChats(prev => prev.map(chat => chat.id === activeChatRef.current?.id
                ? { ...chat, myAvatarForContact: res.data.avatar || user?.avatar, hasCustomAvatarForContact: false }
                : chat));
            setActiveChat(prev => prev ? { ...prev, myAvatarForContact: res.data.avatar || user?.avatar, hasCustomAvatarForContact: false } : prev);
        } catch (err) {
            alert(err.response?.data?.error || 'Could not restore default DP.');
        }
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

        if (isToday) {
            return `last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        return `last seen ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const getChatStatus = (chat) => {
        const typers = Object.values(typingUsers[chat.id] || {});
        if (typers.length > 0) return `${typers.join(', ')} typing...`;
        if (chat.isGroup) {
            return `${chat.participants?.length || 0} members • ${chat.isPublic ? 'Public' : 'Private'}`;
        }
        const otherParticipant = getOtherParticipant(chat);
        if (!otherParticipant) return "Tap to open chat";
        if (otherParticipant.isOnline) return "Online";
        if (localStorage.getItem('hide_last_seen') === '1') return "Last seen hidden";
        return formatLastSeen(otherParticipant.lastSeen);
    };

    const openNotifications = () => {
        setShowNotifications(prev => !prev);
        setShowSearchModal(false);
        setShowSettings(false);
        setUnreadCount(0);
        handleMarkAllRead();
    };

    const hideAppNavForFeature = () => {
        setShowNotifications(false);
        setShowSearchModal(false);
        setShowSettings(false);
        setShowSmartSpace(false);
    };

    const navItems = [
        {
            label: 'Chats',
            icon: ChatBubbleLeftRightIcon,
            active: !showSocial && !showReels && !showPodlive,
            action: () => {
                hideAppNavForFeature();
                setShowReels(false);
                setShowSocial(false);
                setShowPodlive(false);
                setActiveChat(null);
                localStorage.removeItem('activeChatId');
            }
        },
        { label: 'Reels', icon: PlayIcon, active: showReels, action: () => { hideAppNavForFeature(); setShowSocial(false); setShowPodlive(false); setShowReels(true); setShowAiChat(false); } },
        { label: 'Social', icon: PhotoIcon, active: showSocial, action: () => { hideAppNavForFeature(); setShowReels(false); setShowPodlive(false); setShowSocial(true); setShowAiChat(false); } },
        { label: 'PodLive', icon: MicrophoneIcon, active: showPodlive, action: () => { hideAppNavForFeature(); setShowReels(false); setShowSocial(false); setShowPodlive(true); setShowAiChat(false); } },
        { label: 'AI', icon: SparklesIcon, active: showAiChat, action: () => { hideAppNavForFeature(); setShowReels(false); setShowSocial(false); setShowPodlive(false); setShowAiChat(true); } },
        { label: 'Notify', icon: BellIcon, active: showNotifications, action: openNotifications, badge: unreadCount },
        { label: 'New', icon: PlusIcon, active: showSearchModal, action: () => { setShowNotifications(false); setShowSettings(false); setShowSearchModal(true); } },
        { label: 'Settings', icon: Cog6ToothIcon, active: showSettings, action: () => { setShowNotifications(false); setShowSearchModal(false); setShowSettings(true); } }
    ];

    const featureOverlayOpen = showSearchModal || showNotifications || showSettings || showCallModal || incomingCall;
    const appNavHidden = featureOverlayOpen || Boolean(activeChat);
    const chatBackground = wallpaper === 'dots'
        ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0), #0b141a'
        : wallpaper === 'emerald'
            ? 'linear-gradient(135deg, #06251f, #111b21 55%, #17212b)'
            : wallpaper === 'white'
                ? '#ffffff'
                : wallpaper === 'sunset' ? 'linear-gradient(145deg, #431407, #9a3412 48%, #701a75)'
                : wallpaper === 'ocean' ? 'linear-gradient(145deg, #082f49, #0e7490 48%, #164e63)'
                : wallpaper === 'lavender' ? 'linear-gradient(145deg, #312e81, #6d28d9 52%, #4c1d95)'
                : wallpaper === 'rose' ? 'linear-gradient(145deg, #4c0519, #9f1239 52%, #831843)'
                : wallpaper === 'sand' ? 'linear-gradient(145deg, #78350f, #a16207 52%, #713f12)'
                : wallpaper === 'aurora' ? 'linear-gradient(135deg, #042f2e, #065f46 34%, #312e81 68%, #4c1d95)'
                : 'linear-gradient(to bottom, #0b141a, #0d1b22)';

    useEffect(() => {
        if (!appNavHidden) setNavPeekOpen(false);
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
            {appLocked && <AppLockOverlay error={unlockError} onPinChange={setUnlockPin} onSubmit={unlockApp} pin={unlockPin} />}
            {!isOnline && <OfflineBanner />}
            {editingMessage && <EditMessageModal onCancel={() => setEditingMessage(null)} onChange={setEditText} onSubmit={submitEditMessage} text={editText} />}
            {forwardMessage && <ForwardMessageModal activeChatId={visibleActiveChat?.id} chats={chats} message={forwardMessage} onClose={() => setForwardMessage(null)} onForward={handleForwardToChat} />}


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
                                                <p className="text-xs text-gray-500">{searchedUser.phone}</p>
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

            {(appNavHidden || isMobile) && !navPeekOpen && (
                <button
                    onClick={() => setNavPeekOpen(true)}
                    className="fixed left-0 top-1/2 z-[70] -translate-y-1/2 rounded-r-2xl border border-l-0 border-gray-700 bg-[#111b21]/95 px-1.5 py-6 text-gray-300 shadow-2xl hover:text-white active:scale-95"
                    title="Show menu"
                >
                    <EllipsisVerticalIcon className="w-5 h-5" />
                </button>
            )}

            {navPeekOpen && (
                <button
                    aria-label="Close menu"
                    onClick={() => setNavPeekOpen(false)}
                    className="fixed inset-0 z-[60] bg-black/40"
                />
            )}

            {/* WhatsApp-style side navigation */}
            <aside className={navPeekOpen
                ? "fixed inset-y-0 left-0 z-[80] shadow-2xl flex w-[68px] md:w-[78px] xl:w-[236px] flex-col border-r border-gray-800 bg-[#080808] px-2 md:px-3 py-4 md:py-5 shrink-0"
                : `hidden md:${!appNavHidden ? 'flex' : 'hidden'} md:relative w-[68px] md:w-[78px] xl:w-[236px] flex-col border-r border-gray-800 bg-[#080808] px-2 md:px-3 py-4 md:py-5 shrink-0`
            }>
                <div className="h-12 px-2 flex items-center">
                    <img src="/cheetchat-logo.png" alt="CHEETCHAT" className="h-9 w-9 rounded-xl object-cover" />
                    <span className="ml-2 hidden xl:block text-xl font-black tracking-tight">CHEETCHAT</span>
                </div>
                <nav className="mt-7 flex flex-col gap-1">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.label}
                                onClick={() => {
                                    item.action();
                                    setNavPeekOpen(false);
                                }}
                                className={`relative flex items-center justify-center xl:justify-start gap-4 rounded-xl px-3 py-3 text-left transition-colors ${item.active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
                                title={item.label}
                            >
                                <span className="relative">
                                    <Icon className="w-7 h-7" />
                                    {item.badge > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-center font-bold text-white">
                                            {item.badge > 9 ? '9+' : item.badge}
                                        </span>
                                    )}
                                </span>
                                <span className="hidden xl:inline text-sm font-semibold">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
                <div className="mt-auto flex items-center gap-3 rounded-xl px-2 py-3">
                    <AvatarZoom src={user?.avatar} name={user?.username} size="w-10 h-10" />
                    <div className="hidden xl:block min-w-0">
                        <p className="text-sm font-bold truncate">{user?.username}</p>
                        <p className="text-xs text-green-500">Online</p>
                    </div>
                </div>
            </aside>

            {/* Sidebar */}
            <div className={`h-full min-h-0 w-full overflow-hidden md:w-[360px] lg:w-[390px] border-r border-gray-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
                {/* Header */}
                <div className="p-4 bg-signal-secondary flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                        <div className="relative group cursor-pointer" title="Change profile photo">
                            <AvatarZoom src={user?.avatar} name={user?.username} size="w-10 h-10" />
                            <div
                                className="absolute inset-0 hidden group-hover:flex flex-col items-center justify-center rounded-full bg-black/70 z-10 cursor-pointer gap-0.5"
                            >
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
                            onClick={() => {
                                setShowNotifications(false);
                                setShowSearchModal(false);
                                setShowSettings(false);
                                setShowSearchModal(true);
                            }} 
                            className="p-2 hover:bg-gray-700/55 rounded-full text-signal-accent transition-colors" 
                            title="New Chat"
                        >
                            <PlusIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* ─── WhatsApp-style Sidebar Search ─── */}
                <div className="px-3 py-2 bg-[#111b21] flex items-center gap-2">
                    <div className="relative flex-1 flex items-center">
                        {/* Search icon */}
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

                        {/* Clear button */}
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

                        {/* Emoji button */}
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

                {/* Stories stay above chats on desktop; mobile gets a dedicated WhatsApp-style tab. */}
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

                {/* Phone navigation: familiar WhatsApp information architecture. */}
                <nav className="md:hidden grid grid-cols-4 border-t border-white/10 bg-[#111b21] px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1">
                    {[
                        { id: 'chats', label: 'Chats', icon: '◉', badge: totalUnreadMessages },
                        { id: 'stories', label: 'Stories', icon: '◎' },
                        { id: 'groups', label: 'Groups', icon: '👥' },
                        { id: 'calls', label: 'Calls', icon: '☎' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => { setMobileHomeTab(tab.id); setShowArchive(false); }}
                            className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition ${
                                mobileHomeTab === tab.id ? 'text-[#25d366]' : 'text-gray-400'
                            }`}
                        >
                            <span className={`relative text-xl leading-5 ${mobileHomeTab === tab.id ? 'rounded-full bg-[#25d366]/15 px-4 py-1' : 'py-1'}`}>
                                {tab.icon}
                                {tab.badge > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[9px] font-black text-[#07150f]">
                                        {tab.badge > 99 ? '99+' : tab.badge}
                                    </span>
                                )}
                            </span>
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {/* Nickname Edit Modal */}
                {editNicknameChat && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setEditNicknameChat(null)}>
                        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f2c34] p-6 text-white shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-bold mb-4">Edit Nickname</h3>
                            <input
                                type="text"
                                value={nicknameInput}
                                onChange={(e) => setNicknameInput(e.target.value)}
                                placeholder="Enter custom name..."
                                className="w-full bg-[#202c33] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-[#00a884] outline-none mb-4"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        if (nicknameInput.trim()) {
                                            saveNickname(editNicknameChat.id, nicknameInput.trim());
                                        }
                                        setEditNicknameChat(null);
                                        setNicknameInput('');
                                    }}
                                    className="flex-1 rounded-xl bg-[#00a884] hover:bg-[#008f72] py-3 text-sm font-semibold transition"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        setEditNicknameChat(null);
                                        setNicknameInput('');
                                    }}
                                    className="flex-1 rounded-xl bg-white/10 hover:bg-white/15 py-3 text-sm font-semibold transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Chat Room */}
            {visibleActiveChat ? (
                <div className={`relative h-full min-h-0 flex-1 flex-col overflow-hidden bg-black/50 ${activeChat ? 'flex' : 'hidden md:flex'}`}>
                    {showChatDraw && <DrawStudio inline onClose={() => setShowChatDraw(false)} onSendDrawing={drawing => { handleSendMessage(JSON.stringify(drawing), 'drawing', null, disappearingTtl); setShowChatDraw(false); }} />}

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

                    {/* Pinned Message Banner — WhatsApp style */}
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
                                <p className={`text-xs ${getOtherParticipant(visibleActiveChat)?.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                                    {getChatStatus(visibleActiveChat)}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 text-signal-accent items-center relative">
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
                                            {/* Translate toggle */}
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
                                            {/* Mute toggle */}
                                            <button
                                                onClick={() => { toggleMute(visibleActiveChat.id); setShowTopDropdown(false); }}
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <span>{mutedChats.includes(visibleActiveChat.id) ? '🔔' : '🔕'}</span>
                                                <span>{mutedChats.includes(visibleActiveChat.id) ? 'Unmute Chat' : 'Mute Chat'}</span>
                                            </button>
                                            {/* Pin chat */}
                                            <button
                                                onClick={() => { togglePinChat(visibleActiveChat.id); setShowTopDropdown(false); }}
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <span>📌</span>
                                                <span>{pinnedChats.includes(visibleActiveChat.id) ? 'Unpin Chat' : 'Pin Chat'}</span>
                                            </button>
                                            {/* Archive chat */}
                                            <button
                                                onClick={() => { toggleArchive(visibleActiveChat.id); setActiveChat(null); setShowTopDropdown(false); }}
                                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-200 hover:bg-white/10"
                                            >
                                                <span>📦</span>
                                                <span>Archive Chat</span>
                                            </button>
                                            {/* Nickname */}
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
                                                    <div className="border-t border-white/5 my-1"></div>
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

                    {/* Info Panel */}
                    {showInfoPanel && (() => {
                        if (visibleActiveChat.isGroup) {
                            const isAdmin = visibleActiveChat.groupAdminId === user?.id;
                            return (
                                <div className="absolute inset-0 z-40 bg-black/70 flex justify-end" onClick={() => setShowInfoPanel(false)}>
                                    <div className="w-80 bg-[#111b21] h-full flex flex-col shadow-2xl animate-slide-left" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-3 p-4 border-b border-gray-800">
                                            <button onClick={() => setShowInfoPanel(false)} className="text-gray-400 hover:text-white">
                                                <XMarkIcon className="w-6 h-6" />
                                            </button>
                                            <h2 className="text-white font-bold text-lg">Group Info</h2>
                                        </div>
                                        
                                        <div className="flex flex-col items-center py-6 gap-2 border-b border-gray-800">
                                            <UserAvatar
                                                src={visibleActiveChat.avatar}
                                                name={visibleActiveChat.name}
                                                className="w-24 h-24 rounded-full object-cover border-2 border-gray-700 bg-[#202c33]"
                                                alt=""
                                            />
                                            <h3 className="text-white font-bold text-xl px-4 text-center break-words">{visibleActiveChat.name}</h3>
                                            <p className="text-gray-400 text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 uppercase tracking-wider">
                                                {visibleActiveChat.isPublic ? 'Public Group' : 'Private Group'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {visibleActiveChat.participants?.length || 0} members
                                            </p>
                                        </div>

                                        <div className="flex-1 overflow-y-auto flex flex-col min-h-0" style={{ scrollbarWidth: 'thin' }}>
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
                                            {/* Admin controls */}
                                            {isAdmin && (
                                                <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800 bg-white/5">
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">Mute Group</p>
                                                        <p className="text-xs text-gray-400">Only admin can send messages</p>
                                                    </div>
                                                    <button
                                                        onClick={handleToggleMuteGroup}
                                                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${visibleActiveChat.isChatDisabled ? 'bg-signal-accent' : 'bg-gray-600'}`}
                                                    >
                                                        <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow ${visibleActiveChat.isChatDisabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Join requests queue */}
                                            {isAdmin && groupRequests.length > 0 && (
                                                <div className="border-b border-gray-800 py-3 bg-signal-accent/5">
                                                    <h4 className="text-xs font-bold text-signal-accent uppercase px-4 mb-2 tracking-wider">Join Requests ({groupRequests.length})</h4>
                                                    <div className="max-h-48 overflow-y-auto px-4 space-y-2">
                                                        {groupRequests.map(req => (
                                                            <div key={req.id} className="flex items-center justify-between py-1.5 bg-[#1f2c34] rounded-lg px-2.5 border border-white/5 shadow-sm">
                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                    <img src={req.avatar} className="w-8 h-8 rounded-full flex-shrink-0" alt="" />
                                                                    <span className="text-xs font-semibold text-white truncate pr-1">{req.username}</span>
                                                                </div>
                                                                <div className="flex gap-1.5 flex-shrink-0">
                                                                    <button 
                                                                        onClick={() => handleRespondRequest(req.id, 'approve')}
                                                                        className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors active:scale-95 shadow-md"
                                                                    >
                                                                        Approve
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRespondRequest(req.id, 'reject')}
                                                                        className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors active:scale-95 shadow-md"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Group members */}
                                            <div className="py-3 flex-1 flex flex-col min-h-0">
                                                <h4 className="text-xs font-bold text-gray-400 uppercase px-4 mb-2 tracking-wider">Members</h4>
                                                <div className="flex-1 space-y-3 px-4 overflow-y-auto">
                                                    {visibleActiveChat.participants?.map(p => (
                                                        <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-800/30 last:border-b-0">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <img src={p.avatar} className="w-8 h-8 rounded-full flex-shrink-0" alt="" />
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-sm font-semibold text-white truncate">{p.username}</span>
                                                                    {p.id === visibleActiveChat.groupAdminId && (
                                                                        <span className="text-[10px] text-signal-accent font-bold">Group Admin</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {p.id === user?.id ? (
                                                                <span className="text-xs text-gray-500 italic flex-shrink-0">You</span>
                                                            ) : p.isOnline ? (
                                                                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Online" />
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-3 border-t border-gray-800 bg-[#111b21]">
                                            <button
                                                onClick={() => { setShowInfoPanel(false); handleDeleteChat(visibleActiveChat.id); }}
                                                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors border border-red-500/20 active:scale-95 font-bold"
                                            >
                                                <TrashIcon className="w-5 h-5" />
                                                {isAdmin ? "Delete Group" : "Leave Group"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
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
                                        <h3 className="text-white font-bold text-xl">{visibleActiveChat.name}</h3>
                                        {other && <p className="text-gray-400 text-sm">📞 {other.phone}</p>}
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
                                                <div className="flex items-center justify-between gap-2"><p className="font-semibold text-white">{contactBusinessInfo.business.businessName}</p><span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[9px] font-bold uppercase text-emerald-300">Business</span></div>
                                                <p className="mt-1 text-xs text-emerald-300">{contactBusinessInfo.business.category}</p>
                                                <p className="mt-2 text-xs leading-5 text-gray-400">{contactBusinessInfo.business.description}</p>
                                                {contactBusinessInfo.business.openingHours && <p className="mt-2 text-[11px] text-gray-400">🕘 {contactBusinessInfo.business.openingHours}</p>}
                                                {contactBusinessInfo.business.address && <p className="mt-1 text-[11px] text-gray-400">📍 {contactBusinessInfo.business.address}</p>}
                                                {!!contactBusinessInfo.products?.length && <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Catalog ({contactBusinessInfo.products.length})</p>}
                                                <div className="mt-2 space-y-2">
                                                    {contactBusinessInfo.products?.map(product => <div key={product.id} className="flex items-center gap-2 rounded-lg bg-black/20 p-2">{product.imageUrl && <img src={product.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />}<div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{product.name}</p><p className="text-[11px] text-emerald-300">₹{Number(product.price).toFixed(2)} · {product.inStock ? 'In stock' : 'Out of stock'}</p></div></div>)}
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
                    })()}

                    {/* Messages Area - WhatsApp style background */}
                    <div
                        ref={messagesContainerRef}
                        onScroll={event => {
                            const element = event.currentTarget;
                            const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                            userScrolledUpRef.current = distanceFromBottom > 120;
                        }}
                        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-0.5 ${localStorage.getItem('animated_theme') === '1' ? 'animated-chat-wallpaper' : ''}`}
                        style={{ background: chatBackground, backgroundSize: wallpaper === 'dots' ? '18px 18px' : undefined }}
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
                        {messages.filter(msg => !messageSearchQuery || `${msg.content || ''} ${msg.type || ''}`.toLowerCase().includes(messageSearchQuery.toLowerCase())).map((msg, idx, shownMessages) => {
                            const prevMsg = messages[idx - 1];
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
                                    <div ref={el => { if (msg.id) messageRefsMap.current[msg.id] = el; }}>
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
                                            showTranslateBtn={showTranslateEnabled}
                                            onAnnotate={setDrawSource}
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
                        onStartLiveLocation={() => startLiveLocation(visibleActiveChat.id)}
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
                        payeeId={getOtherParticipant(visibleActiveChat)?.id}
                        payeeName={getOtherParticipant(visibleActiveChat)?.username || visibleActiveChat.name}
                        onSchedule={scheduleMessage}
                        token={token}
                        drawSource={drawSource}
                        onDrawSourceConsumed={() => setDrawSource(null)}
                        onOpenDraw={() => setShowChatDraw(true)}
                    />
                </div>
            ) : (
                <div className="hidden md:flex flex-1 items-center justify-center flex-col text-gray-500">
                    <h2 className="text-2xl font-bold mb-2">Welcome to CHEETCHAT</h2>
                    <p>Select a chat or click + to start messaging.</p>
                </div>
            )}
            {/* Heavy feature screens load only when opened, keeping chat startup fast. */}
            {showReels && <div className="fixed inset-0 z-50 bg-black">
                <React.Suspense fallback={<FeatureLoader />}>
                <Reels
                    active={showReels && !incomingCall && !showCallModal}
                    onBack={() => setShowReels(false)} 
                    onShareToChat={shareReelToChat}
                />
                </React.Suspense>
            </div>}

            {/* Social Overlay */}
            {showSocial && <div className="fixed inset-0 z-50 bg-[#0b0f14]">
                <React.Suspense fallback={<FeatureLoader />}>
                <Social
                    active={showSocial && !incomingCall && !showCallModal}
                    onBack={() => { setShowSocial(false); setSocialDeepLink(null); }}
                    deepLink={socialDeepLink}
                    onDeepLinkConsumed={() => setSocialDeepLink(null)}
                    onShareToChat={shareSocialPostToChat}
                />
                </React.Suspense>
            </div>}

            {/* PodLive Overlay */}
            {showPodlive && <div className="fixed inset-0 z-50 bg-[#0b0f19]">
                <React.Suspense fallback={<FeatureLoader />}>
                <PodLiveView
                    active={showPodlive && !incomingCall && !showCallModal}
                    onBack={() => setShowPodlive(false)}
                />
                </React.Suspense>
            </div>}

            {showSettings && <React.Suspense fallback={<FeatureLoader />}><SettingsModal user={user} token={token} onClose={() => setShowSettings(false)} onLogout={logout} onUserUpdate={updateUser} theme={theme} wallpaper={wallpaper} onThemeChange={setTheme} onWallpaperChange={setWallpaper} onOpenSmartSpace={() => { setShowSettings(false); setShowSmartSpace(true); }} smartSpaceButtonEnabled={smartSpaceButtonEnabled} onSmartSpaceButtonChange={(enabled) => { setSmartSpaceButtonEnabled(enabled); localStorage.setItem('smart_space_button_enabled', enabled ? '1' : '0'); }} /></React.Suspense>}

            {/* AI Chat Overlay */}
            <div className={`fixed inset-0 z-50 bg-[#0b141a] transition-opacity duration-200 ${showAiChat ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                {showAiChat && (
                    <React.Suspense fallback={<FeatureLoader />}>
                    <AiChat
                        onBack={() => setShowAiChat(false)}
                        onClose={() => setShowAiChat(false)}
                        onActionCall={async (contactName) => {
                            // 1. Search in existing chats
                            let targetChat = chats.find(c => {
                                if (c.isGroup) {
                                    return c.name && c.name.toLowerCase().includes(contactName.toLowerCase());
                                } else {
                                    const other = getOtherParticipant(c);
                                    return other && (
                                        other.username.toLowerCase().includes(contactName.toLowerCase()) ||
                                        (other.platform_id && other.platform_id.toLowerCase().includes(contactName.toLowerCase()))
                                    );
                                }
                            });

                            if (targetChat) {
                                setShowAiChat(false);
                                startCallForChat(targetChat, 'video');
                                return;
                            }

                            // 2. Search database and auto-create chat
                            try {
                                const res = await axios.post('/api/user/search', { query: contactName }, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                if (res.data && res.data.id) {
                                    const searchedUserObj = res.data;
                                    const createRes = await axios.post('/api/chats/create', {
                                        participants: [user.id, searchedUserObj.id],
                                        isGroup: false
                                    }, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });

                                    const updatedChats = await fetchChats();
                                    const newChat = updatedChats.find(chat => chat.id === createRes.data.id);
                                    if (newChat) {
                                        setShowAiChat(false);
                                        startCallForChat(newChat, 'video');
                                    } else {
                                        alert(`Could not start call with ${contactName}.`);
                                    }
                                } else {
                                    alert(`Contact "${contactName}" not found.`);
                                }
                            } catch (err) {
                                console.error("AI trigger call search error:", err);
                                alert(`Contact "${contactName}" not found.`);
                            }
                        }}
                    />
                    </React.Suspense>
                )}
            </div>
            <div className={`fixed inset-0 z-50 bg-[#07110f] transition-opacity duration-200 ${showSmartSpace ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                {showSmartSpace && (
                    <React.Suspense fallback={<FeatureLoader />}>
                    <AiSmartSpace
                        chats={chats}
                        token={token}
                        onClose={() => setShowSmartSpace(false)}
                        onOpenChat={(chat) => { setActiveChat(chat); setShowSmartSpace(false); }}
                    />
                    </React.Suspense>
                )}
            </div>
            {showNotifications && (
                <React.Suspense fallback={<FeatureLoader />}>
                <NotificationPanel
                    notifications={notifications}
                    onClose={() => setShowNotifications(false)}
                    onMarkRead={handleMarkSingleRead}
                    onMarkAllRead={handleMarkAllRead}
                    onNavigate={handleNotificationNavigate}
                />
                </React.Suspense>
            )}

            {incomingCall && (
                <IncomingCallModal
                    callerName={incomingCall.callerName}
                    callType={incomingCall.callType}
                    onAccept={acceptCall}
                    onReject={rejectCall}
                    playSound={localStorage.getItem('call_sounds') !== '0'}
                />
            )}

            {/* ── Upload Progress Modal (WhatsApp-style compression indicator) ── */}
            {uploadProgress && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center pb-8 px-4 pointer-events-none">
                    <div className="w-full max-w-sm bg-[#1f2c34] border border-white/10 rounded-2xl p-4 shadow-2xl pointer-events-auto animate-slide-up">
                        {/* Header */}
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
                        {/* Progress bar */}
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                            <div
                                className="h-full bg-gradient-to-r from-[#25d366] to-[#00c896] rounded-full transition-all duration-500"
                                style={{ width: `${uploadProgress.percent}%` }}
                            />
                        </div>
                        {/* Size info */}
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

            {showCallModal && (
                <VideoCallModal 
                    activeChat={activeChat} 
                    onClose={() => setShowCallModal(false)} 
                    callType={callType} 
                    initialRingStatus={callRingState[activeChat?.id] || 'calling'}
                    token={token}
                    preparedStream={preparedCallStreamRef.current}
                    onPreparedStreamConsumed={() => { preparedCallStreamRef.current = null; }}
                    onTransitionCall={async (newChatId) => {
                        const updatedChats = await fetchChats();
                        const newChatObj = updatedChats.find(c => c.id === newChatId);
                        if (newChatObj) {
                            setActiveChat(newChatObj);
                        }
                    }}
                />
            )}
            
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
                            {/* Preview Message content */}
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

            {/* Deletion confirmation modals */}
            {msgToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setMsgToDelete(null)}>
                    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f2c34] p-6 text-white shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2">Delete message?</h3>
                        <p className="text-sm text-gray-400 mb-6">This action cannot be undone.</p>
                        <div className="flex flex-col gap-2">
                            {msgToDelete.senderId === user.id && (
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

            <DeleteChatModal
                chat={chatToDelete ? { ...chats.find(chat => chat.id === chatToDelete), currentUserId: user.id } : null}
                onClose={() => setChatToDelete(null)}
                onConfirm={scope => handleDeleteChatConfirm(chatToDelete, scope)}
            />

        </div>
    );
};

export default Home;
