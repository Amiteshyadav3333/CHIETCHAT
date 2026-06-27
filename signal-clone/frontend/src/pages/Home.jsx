import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ContactList from '../components/ContactList';
import ChatBubble, { DateSeparator } from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import IncomingCallModal from '../components/IncomingCallModal';
import VideoCallModal from '../components/VideoCall';
import AvatarZoom from '../components/AvatarZoom';
import StatusSection from '../components/StatusSection';
import { ArrowLeftIcon, PhoneIcon, VideoCameraIcon, PlusIcon, EllipsisVerticalIcon, XMarkIcon, TrashIcon, NoSymbolIcon, PlayIcon, Cog6ToothIcon, BellIcon, MapPinIcon, PhotoIcon, ChatBubbleLeftRightIcon, InformationCircleIcon, ClipboardDocumentIcon, ForwardIcon, PencilSquareIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import SettingsModal from '../components/SettingsModal';
import NotificationPanel from '../components/NotificationPanel';
import { useEncryption } from '../hooks/useEncryption';
import Reels from './Reels';
import Social from './Social';
import PodLiveView from './PodLiveView';
import { decryptEnvelope, encryptForRecipients, isEncryptedPayload } from '../utils/encryption';
import { compressImage, compressVideo, getFileCategory, formatFileSize } from '../utils/mediaCompressor';
import { getOfflineQueue, enqueueOfflineMessage, dequeueOfflineMessage, processOfflineQueue } from '../utils/offlineQueue';

const Home = () => {
    const { user, token, logout, updateUser } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);
    const { privateKey, publicKey } = useEncryption(user, token);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingChats, setLoadingChats] = useState(true);
    const [showCallModal, setShowCallModal] = useState(false);
    const [callType, setCallType] = useState('video');
    const [incomingCall, setIncomingCall] = useState(null);
    const [callRingState, setCallRingState] = useState({});
    const [replyTo, setReplyTo] = useState(null);
    const [showInfoPanel, setShowInfoPanel] = useState(false);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showReels, setShowReels] = useState(() => localStorage.getItem('activeView') === 'reels');
    const [showSocial, setShowSocial] = useState(() => localStorage.getItem('activeView') === 'social');
    const [showPodlive, setShowPodlive] = useState(() => localStorage.getItem('activeView') === 'podlive');
    const [socialDeepLink, setSocialDeepLink] = useState(null); // { type: 'post'|'profile', id }
    const [showSettings, setShowSettings] = useState(() => localStorage.getItem('activeView') === 'settings');
    const [navPeekOpen, setNavPeekOpen] = useState(false);
    const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

    useEffect(() => {
        setShowBioBanner(true);
    }, [activeChat]);
    const [theme, setTheme] = useState(() => localStorage.getItem('chat_theme') || 'dark');
    const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('chat_wallpaper') || 'white');
    const [disappearingTtl, setDisappearingTtl] = useState(0);
    const [showTopDropdown, setShowTopDropdown] = useState(false);
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

    const filteredChats = chats.filter(chat => 
        chat.name?.toLowerCase().includes(sidebarSearchQuery.toLowerCase())
    );

    // Non-Encrypted Ref
    const messagesEndRef = useRef(null);
    const avatarInputRef = useRef(null);
    const activeChatRef = useRef(activeChat);
    const chatsRef = useRef(chats);
    const showCallModalRef = useRef(showCallModal);
    const messageRefsMap = useRef({});

    useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
    useEffect(() => { chatsRef.current = chats; }, [chats]);
    useEffect(() => { showCallModalRef.current = showCallModal; }, [showCallModal]);
    useEffect(() => { localStorage.setItem('chat_theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('chat_wallpaper', wallpaper); }, [wallpaper]);

    const processQueue = useCallback(async () => {
        if (!navigator.onLine || !socket || !socket.connected || !publicKey) return;
        await processOfflineQueue(async (msg) => {
            const chat = chatsRef.current.find(c => c.id === msg.chatId);
            if (!chat) return;

            const recipientPublicKeys = {};
            for (const participant of chat.participants) {
                const participantPublicKey = participant.id === user.id
                    ? publicKey
                    : participant.publicKey;
                if (!participantPublicKey) continue;
                recipientPublicKeys[participant.id] = participantPublicKey;
            }

            const encryptedContent = await encryptForRecipients(recipientPublicKeys, msg.content);

            socket.emit('send_message', {
                chatId: msg.chatId,
                senderId: user.id,
                content: encryptedContent,
                type: msg.type,
                ttl: msg.disappearingTtl,
                replyToId: msg.replyTo?.id || null,
                replyContent: msg.replyTo ? (msg.replyTo.type !== 'text' ? msg.replyTo.type : msg.replyTo.content) : null,
                replySenderName: msg.replyTo?.senderName || null
            });
        });
    }, [socket, publicKey, user]);

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
        const view = showReels ? 'reels' : showSocial ? 'social' : showPodlive ? 'podlive' : showSettings ? 'settings' : 'chats';
        localStorage.setItem('activeView', view);
    }, [showReels, showSocial, showPodlive, showSettings]);

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
        }
    }, [activeChat]);

    useEffect(() => {
        if (activeChat) {
            const stored = localStorage.getItem(`chat_translation_lang_${activeChat.id}`) || '';
            setChatTranslationLang(stored);
            setDisappearingTtl(Number(localStorage.getItem(`chat_disappearing_ttl_${activeChat.id}`) || 0));
        } else {
            setChatTranslationLang('');
            setDisappearingTtl(0);
        }
    }, [activeChat?.id]);

    const updateDisappearingTtl = (value) => {
        const ttl = Number(value);
        setDisappearingTtl(ttl);
        if (visibleActiveChat) localStorage.setItem(`chat_disappearing_ttl_${visibleActiveChat.id}`, String(ttl));
    };

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

        socket.on('peer_ringing', (data) => {
            setCallRingState(prev => ({ ...prev, [data.chatId]: 'ringing' }));
        });

        socket.on('receive_message', async (newMsg) => {
            const readableMsg = await decryptMessageForCurrentUser(newMsg);

            if (activeChatRef.current && readableMsg.chatId === activeChatRef.current.id) {
                setMessages(prev => {
                    // Replace optimistic message from same sender, or skip if already exists
                    if (readableMsg.senderId === user.id) {
                        const hasOptimistic = prev.some(m => m._isOptimistic && m.senderId === user.id && m.chatId === readableMsg.chatId);
                        if (hasOptimistic) {
                            // Replace the oldest optimistic msg from this user
                            let replaced = false;
                            return prev.map(m => {
                                if (!replaced && m._isOptimistic && m.senderId === user.id && m.chatId === readableMsg.chatId) {
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
                scrollToBottom();
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
                return [targetChat, ...updatedChats];
            });
        });

        socket.on('message_status_update', ({ messageId, chatId, status, readAt, deliveredAt }) => {
            if (activeChatRef.current && chatId === activeChatRef.current.id) {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status, readAt: readAt || m.readAt, deliveredAt: deliveredAt || m.deliveredAt } : m));
            }
        });

        socket.on('message_edited', async ({ id, chatId, content, editedAt }) => {
            if (activeChatRef.current?.id === chatId) {
                const readableContent = isEncryptedPayload(content) && privateKey && user
                    ? await decryptEnvelope(privateKey, user.id, content)
                    : content;
                setMessages(prev => prev.map(m => m.id === id ? { ...m, content: readableContent, editedAt } : m));
            }
        });

        socket.on('message_deleted', ({ id, chatId, deletedAt }) => {
            if (activeChatRef.current?.id === chatId) {
                setMessages(prev => prev.map(m => m.id === id ? { ...m, content: '', type: 'deleted', deletedAt } : m));
            }
        });

        socket.on('chat_deleted', ({ chatId }) => {
            setChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChatRef.current?.id === chatId) {
                setActiveChat(null);
                localStorage.removeItem('activeChatId');
            }
        });

        socket.on('message_reaction_update', ({ id, chatId, reactions }) => {
            if (activeChatRef.current?.id === chatId) {
                setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m));
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
            socket.off('message_status_update');
            socket.off('message_edited');
            socket.off('message_deleted');
            socket.off('chat_deleted');
            socket.off('message_reaction_update');
            socket.off('message_pin_update');
            socket.off('typing_update');
        };
    }, [socket, user, fetchChats, decryptMessageForCurrentUser, processQueue]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat || !privateKey) return;
            try {
                const res = await axios.get(`/api/chats/${activeChat.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                setMessages(await decryptMessagesForCurrentUser(res.data));
                scrollToBottom();

                socket?.emit('join_room', { room: activeChat.id });
                socket?.emit('mark_read', { chatId: activeChat.id });
            } catch (err) {
                console.error(err);
            }
        };
        fetchMessages();
    }, [activeChat?.id, token, socket, privateKey]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (messages.length > 0) {
            scrollToBottom();
            const timer = setTimeout(() => {
                scrollToBottom();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [messages]);

    const handleSendMessage = async (text, type = 'text', replyMsg = null, ttl = 0) => {
        if (!activeChat) return;

        // Optimistic UI: show message instantly before encryption/server round trip
        const tempId = `temp_${Date.now()}_${Math.random()}`;
        const optimisticMsg = {
            id: tempId,
            chatId: activeChat.id,
            senderId: user.id,
            senderName: user.username,
            content: type === 'text' ? text : type,
            type,
            status: 'sending',
            timestamp: new Date().toISOString(),
            replyToId: replyMsg?.id || null,
            replyContent: replyMsg ? (replyMsg.type !== 'text' ? replyMsg.type : replyMsg.content) : null,
            replySenderName: replyMsg?.senderName || null,
            reactions: {},
            isPinned: false,
            _isOptimistic: true
        };
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

        // Offline check
        if (!navigator.onLine || !socket || !socket.connected) {
            enqueueOfflineMessage(activeChat.id, text, type, replyMsg, ttl);
            return;
        }

        if (!privateKey || !publicKey) {
            alert("Encryption keys are still loading. Please try again in a moment.");
            return;
        }

        // Encrypt and send in background
        try {
            const recipientPublicKeys = {};
            for (const participant of activeChat.participants) {
                const participantPublicKey = participant.id === user.id
                    ? publicKey
                    : participant.publicKey;
                if (!participantPublicKey) return;
                recipientPublicKeys[participant.id] = participantPublicKey;
            }

            const encryptedContent = await encryptForRecipients(recipientPublicKeys, text);

            socket.emit('send_message', {
                chatId: activeChat.id,
                senderId: user.id,
                content: encryptedContent,
                type,
                ttl,
                replyToId: replyMsg?.id || null,
                replyContent: replyMsg ? (replyMsg.type !== 'text' ? replyMsg.type : replyMsg.content) : null,
                replySenderName: replyMsg?.senderName || null
            });
        } catch (err) {
            // Mark as failed if encryption/send fails
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
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

        // ── COMPRESSION STEP ──
        try {
            if (category === 'image') {
                setUploadProgress({ fileName: file.name, stage: 'Compressing image...', percent: 10, originalSize, compressedSize: null });
                fileToUpload = await compressImage(file);
                setUploadProgress(prev => ({
                    ...prev,
                    stage: 'Image compressed! Uploading...',
                    percent: 30,
                    compressedSize: fileToUpload.size
                }));
            } else if (category === 'video') {
                setUploadProgress({ fileName: file.name, stage: 'Compressing video...', percent: 5, originalSize, compressedSize: null });
                fileToUpload = await compressVideo(file, {
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
            else if (isVideo) type = 'video';

            setUploadProgress(null);
            handleSendMessage(url, type, null, disappearingTtl);
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

    const startCall = (type = 'video') => {
        if (!activeChat || !socket) return;
        setCallType(type);
        socket.emit('notify_ring', {
            chatId: activeChat.id,
            callerName: user.username,
            callerId: user.id,
            participants: activeChat.participants.map(p => p.id),
            callType: type
        });
        setShowCallModal(true);
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
            setMessages(prev => prev.map(m => m.id === message.id ? { ...m, reactions: res.data.reactions } : m));
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
        if (!forwardMessage || !socket) return;
        try {
            const recipientPublicKeys = {};
            for (const participant of targetChat.participants) {
                const participantPublicKey = participant.id === user.id ? publicKey : participant.publicKey;
                if (!participantPublicKey) return alert(`${participant.username} does not have an encryption key yet.`);
                recipientPublicKeys[participant.id] = participantPublicKey;
            }
            const encryptedContent = await encryptForRecipients(recipientPublicKeys, forwardMessage.content);
            socket.emit('send_message', {
                chatId: targetChat.id,
                senderId: user.id,
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
            alert('Could not forward message');
        }
    };

    const handleTyping = (isTyping) => {
        if (!socket || !visibleActiveChat) return;
        socket.emit('typing', { chatId: visibleActiveChat.id, isTyping });
    };

    const acceptCall = async () => {
        if (incomingCall) {
            let chat = chats.find(c => c.id === incomingCall.chatId);
            if (!chat) {
                const updatedChats = await fetchChats();
                chat = updatedChats.find(c => c.id === incomingCall.chatId);
            }
            if (chat) {
                setActiveChat(chat);
                setCallType(incomingCall.callType || 'video');
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

    const getOtherParticipant = (chat) => {
        if (!chat || chat.isGroup) return null;
        return chat.participants.find(participant => participant.id !== user?.id) || null;
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
        { label: 'Reels', icon: PlayIcon, active: showReels, action: () => { hideAppNavForFeature(); setShowSocial(false); setShowPodlive(false); setShowReels(true); } },
        { label: 'Social', icon: PhotoIcon, active: showSocial, action: () => { hideAppNavForFeature(); setShowReels(false); setShowPodlive(false); setShowSocial(true); } },
        { label: 'PodLive', icon: MicrophoneIcon, active: showPodlive, action: () => { hideAppNavForFeature(); setShowReels(false); setShowSocial(false); setShowPodlive(true); } },
        { label: 'Notify', icon: BellIcon, active: showNotifications, action: openNotifications, badge: unreadCount },
        { label: 'New', icon: PlusIcon, active: showSearchModal, action: () => { setShowNotifications(false); setShowSettings(false); setShowSearchModal(true); } },
        { label: 'Settings', icon: Cog6ToothIcon, active: showSettings, action: () => { setShowNotifications(false); setShowSearchModal(false); setShowSettings(true); } }
    ];

    const featureOverlayOpen = showSearchModal || showNotifications || showSettings || showCallModal || incomingCall;
    const appNavHidden = featureOverlayOpen || Boolean(activeChat);
    const appNavVisible = !appNavHidden || navPeekOpen;
    const chatBackground = wallpaper === 'dots'
        ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0), #0b141a'
        : wallpaper === 'emerald'
            ? 'linear-gradient(135deg, #06251f, #111b21 55%, #17212b)'
            : wallpaper === 'white'
                ? '#ffffff'
                : 'linear-gradient(to bottom, #0b141a, #0d1b22)';

    useEffect(() => {
        if (!appNavHidden) setNavPeekOpen(false);
    }, [appNavHidden]);

    return (
        <div className="flex h-[100dvh] bg-signal-bg overflow-hidden text-gray-100 font-sans relative">
            {!isOnline && (
                <div className="absolute top-0 left-0 right-0 z-[100] bg-amber-600/90 text-white text-xs text-center py-1.5 px-4 font-bold flex items-center justify-center gap-2 animate-fade-in shadow-md">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                    Offline mode. Messages will be queued and sent automatically when connection is restored.
                </div>
            )}
            {editingMessage && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
                    <form onSubmit={submitEditMessage} className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#111b21] p-4 shadow-2xl">
                        <h3 className="mb-3 text-lg font-bold text-white">Edit message</h3>
                        <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="h-28 w-full resize-none rounded-xl bg-[#202c33] p-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-signal-accent"
                            autoFocus
                        />
                        <div className="mt-3 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingMessage(null)} className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10">Cancel</button>
                            <button type="submit" className="rounded-lg bg-signal-accent px-4 py-2 text-sm font-bold text-white">Save</button>
                        </div>
                    </form>
                </div>
            )}

            {forwardMessage && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#111b21] p-4 shadow-2xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Forward to</h3>
                            <button onClick={() => setForwardMessage(null)} className="text-gray-400 hover:text-white">Close</button>
                        </div>
                        <div className="max-h-80 space-y-2 overflow-y-auto">
                            {chats.filter(c => c.id !== visibleActiveChat?.id).map(chat => (
                                <button key={chat.id} onClick={() => handleForwardToChat(chat)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/10">
                                    <AvatarZoom src={chat.avatar || null} name={chat.name} size="w-10 h-10" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{chat.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
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
                    <span className="hidden xl:block text-xl font-black tracking-tight">CHEETCHAT</span>
                    <span className="xl:hidden w-9 h-9 rounded-xl bg-signal-accent flex items-center justify-center font-black">C</span>
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
            <div className={`w-full md:w-[360px] lg:w-[390px] border-r border-gray-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
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

                {/* Sidebar Search Bar */}
                <div className="p-3 bg-signal-secondary border-b border-gray-800 flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={sidebarSearchQuery}
                            onChange={(e) => setSidebarSearchQuery(e.target.value)}
                            placeholder="Search or start new chat..."
                            className="w-full bg-signal-input border-none rounded-xl pl-10 pr-10 py-2 focus:ring-1 focus:ring-signal-accent outline-none text-white text-sm"
                        />
                        <span className="absolute left-3 top-2.5 text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.604 10.604Z" />
                            </svg>
                        </span>
                        {sidebarSearchQuery && (
                            <button
                                onClick={() => setSidebarSearchQuery('')}
                                className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Contacts */}
                <StatusSection user={user} token={token} />
                <ContactList
                    chats={filteredChats}
                    activeChat={activeChat}
                    onSelectChat={setActiveChat}
                    loading={loadingChats}
                />
            </div>

            {/* Chat Room */}
            {visibleActiveChat ? (
                <div className={`flex-1 flex flex-col h-full bg-black/50 relative ${activeChat ? 'flex' : 'hidden md:flex'}`}>

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
                        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setShowInfoPanel(true)}>
                            <button onClick={(e) => { e.stopPropagation(); setActiveChat(null); localStorage.removeItem('activeChatId'); }} className="md:hidden p-2 -ml-2">
                                <ArrowLeftIcon className="w-6 h-6 text-gray-300" />
                            </button>
                            <AvatarZoom
                                src={visibleActiveChat.avatar || null}
                                name={visibleActiveChat.name}
                                size="w-10 h-10"
                            />
                            <div className="min-w-0">
                                <h3 className="font-bold text-sm md:text-base truncate">{visibleActiveChat.name}</h3>
                                <p className={`text-xs ${getOtherParticipant(visibleActiveChat)?.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                                    {getChatStatus(visibleActiveChat)}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 text-signal-accent items-center relative">
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

                    {/* Info Panel */}
                    {showInfoPanel && (() => {
                        if (visibleActiveChat.isGroup) {
                            const isAdmin = visibleActiveChat.groupAdminId === user?.id;
                            const avatarUrl = visibleActiveChat.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(visibleActiveChat.name)}`;
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
                                            <img
                                                src={avatarUrl}
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
                                        <img
                                            src={visibleActiveChat.avatar || other?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=x'}
                                            className="w-24 h-24 rounded-full object-cover border-2 border-gray-700"
                                            alt=""
                                        />
                                        <h3 className="text-white font-bold text-xl">{visibleActiveChat.name}</h3>
                                        {other && <p className="text-gray-400 text-sm">📞 {other.phone}</p>}
                                        <p className={`text-xs ${other?.isOnline ? 'text-green-500' : 'text-gray-500'}`}>
                                            {other?.isOnline ? 'Online' : formatLastSeen(other?.lastSeen)}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-1 p-3">
                                        <ChatPreferences
                                            wallpaper={wallpaper}
                                            onWallpaperChange={setWallpaper}
                                            disappearingTtl={disappearingTtl}
                                            onDisappearingChange={updateDisappearingTtl}
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
                        );
                    })()}

                    {/* Messages Area - WhatsApp style background */}
                    <div
                        className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5"
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
                        {messages.map((msg, idx) => {
                            const prevMsg = messages[idx - 1];
                            const currDate = new Date(msg.timestamp).toDateString();
                            const prevDate = prevMsg ? new Date(prevMsg.timestamp).toDateString() : null;
                            const showDate = currDate !== prevDate;
                            const prevSenderId = prevMsg?.senderId;
                            const showAvatar = msg.senderId !== user.id && prevSenderId !== msg.senderId;
                            const sender = visibleActiveChat.participants.find(p => p.id === msg.senderId);
                            const replyData = (msg.replyToId || msg.replySenderName === 'Status') ? {
                                content: msg.replyContent,
                                type: msg.replyType || (msg.replySenderName === 'Status' ? 'status' : 'text'),
                                senderName: msg.replySenderName
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
                                            isLastMessage={idx === messages.length - 1}
                                            socket={socket}
                                            currentUserId={user.id}
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
                    />
                </div>
            ) : (
                <div className="hidden md:flex flex-1 items-center justify-center flex-col text-gray-500">
                    <h2 className="text-2xl font-bold mb-2">Welcome to CHEETCHAT</h2>
                    <p>Select a chat or click + to start messaging.</p>
                </div>
            )}
            {/* Reels Overlay */}
            <div className={`fixed inset-0 z-50 bg-black transition-opacity duration-200 ${showReels ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <Reels 
                    active={showReels && !incomingCall && !showCallModal}
                    onBack={() => setShowReels(false)} 
                    onShareToChat={(reel) => {
                        setShowReels(false);
                        // Open a picker or handle direct share logic
                        alert(`Sharing reel ${reel.id} to chat (Feature coming soon)`);
                    }}
                />
            </div>

            {/* Social Overlay */}
            <div className={`fixed inset-0 z-50 bg-[#0b0f14] transition-opacity duration-200 ${showSocial ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <Social
                    active={showSocial && !incomingCall && !showCallModal}
                    onBack={() => { setShowSocial(false); setSocialDeepLink(null); }}
                    deepLink={socialDeepLink}
                    onDeepLinkConsumed={() => setSocialDeepLink(null)}
                />
            </div>

            {/* PodLive Overlay */}
            <div className={`fixed inset-0 z-50 bg-[#0b0f19] transition-opacity duration-200 ${showPodlive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <PodLiveView
                    active={showPodlive && !incomingCall && !showCallModal}
                    onBack={() => setShowPodlive(false)}
                />
            </div>

            {showSettings && <SettingsModal user={user} token={token} onClose={() => setShowSettings(false)} onLogout={logout} onUserUpdate={updateUser} theme={theme} wallpaper={wallpaper} onThemeChange={setTheme} onWallpaperChange={setWallpaper} />}
            {showNotifications && (
                <NotificationPanel
                    notifications={notifications}
                    onClose={() => setShowNotifications(false)}
                    onMarkRead={handleMarkSingleRead}
                    onMarkAllRead={handleMarkAllRead}
                    onNavigate={handleNotificationNavigate}
                />
            )}

            {incomingCall && (
                <IncomingCallModal
                    callerName={incomingCall.callerName}
                    onAccept={acceptCall}
                    onReject={rejectCall}
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

            {chatToDelete && (() => {
                const chat = chats.find(c => c.id === chatToDelete);
                const isAdmin = chat?.isGroup && chat?.groupAdminId === user.id;
                const canDeleteForEveryone = !chat?.isGroup || isAdmin;
                return (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setChatToDelete(null)}>
                        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f2c34] p-6 text-white shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-bold mb-2">Delete chat?</h3>
                            <p className="text-sm text-gray-400 mb-6">Are you sure you want to delete this chat conversation?</p>
                            <div className="flex flex-col gap-2">
                                {canDeleteForEveryone && (
                                    <button 
                                        onClick={() => handleDeleteChatConfirm(chatToDelete, 'everyone')}
                                        className="w-full rounded-xl bg-red-600 hover:bg-red-500 py-3 text-sm font-semibold transition"
                                    >
                                        Delete for everyone
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleDeleteChatConfirm(chatToDelete, 'me')}
                                    className="w-full rounded-xl bg-white/10 hover:bg-white/15 py-3 text-sm font-semibold transition"
                                >
                                    Delete for me
                                </button>
                                <button 
                                    onClick={() => setChatToDelete(null)}
                                    className="w-full rounded-xl py-3 text-sm font-semibold text-gray-400 hover:text-white transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
};

const ChatPreferences = ({ wallpaper, onWallpaperChange, disappearingTtl, onDisappearingChange }) => (
    <div className="border-b border-gray-800 bg-[#111b21] px-4 py-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#00a884]">Chat settings</h4>
        <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-white">Disappearing messages</span>
            <select
                value={disappearingTtl}
                onChange={e => onDisappearingChange(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
            >
                <option value={0}>Off</option>
                <option value={60}>1 minute</option>
                <option value={3600}>1 hour</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
            </select>
            <span className="mt-1 block text-[11px] leading-4 text-gray-500">New messages will disappear after the selected time.</span>
        </label>
        <div>
            <span className="mb-2 block text-sm font-medium text-white">Chat wallpaper</span>
            <div className="grid grid-cols-4 gap-2">
                {[
                    ['white', 'White', 'bg-white'],
                    ['gradient', 'Dark', 'bg-[#0b141a]'],
                    ['dots', 'Dots', 'bg-gray-700'],
                    ['emerald', 'Green', 'bg-emerald-800'],
                ].map(([id, label, color]) => (
                    <button key={id} onClick={() => onWallpaperChange(id)} className={`rounded-lg border p-2 text-center ${wallpaper === id ? 'border-[#00a884]' : 'border-gray-700'}`}>
                        <span className={`mx-auto mb-1 block h-8 w-full rounded ${color}`} />
                        <span className="text-[10px] text-gray-300">{label}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export default Home;
