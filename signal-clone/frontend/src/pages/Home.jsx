import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ContactList from '../components/ContactList';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import IncomingCallModal from '../components/IncomingCallModal';
import VideoCallModal from '../components/VideoCall';
import { ArrowLeftIcon, PhoneIcon, VideoCameraIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useEncryption } from '../hooks/useEncryption';
import { decryptEnvelope, encryptForRecipients, isEncryptedPayload } from '../utils/encryption';

const Home = () => {
    const { user, token, logout, updateUser } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);
    const { privateKey, publicKey } = useEncryption(user, token);

    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingChats, setLoadingChats] = useState(true);
    const [showCallModal, setShowCallModal] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null); // { chatId, callerName, callerId }

    // Search Modal States
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchPhone, setSearchPhone] = useState('');
    const [searchedUser, setSearchedUser] = useState(null);
    const [searchError, setSearchError] = useState('');

    // Non-Encrypted Ref
    const messagesEndRef = useRef(null);
    const avatarInputRef = useRef(null);

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

        return {
            ...message,
            encryptedContent: isEncryptedPayload(message.content),
            content: await decryptEnvelope(privateKey, user.id, message.content)
        };
    }, [privateKey, user]);

    const decryptMessagesForCurrentUser = useCallback(async (incomingMessages) => {
        return Promise.all(incomingMessages.map(decryptMessageForCurrentUser));
    }, [decryptMessageForCurrentUser]);

    useEffect(() => {
        if (token) fetchChats({ restoreActive: true });
    }, [token, fetchChats]);

    // Persist active chat logic
    useEffect(() => {
        if (activeChat) {
            localStorage.setItem('activeChatId', activeChat.id);
        }
    }, [activeChat]);

    useEffect(() => {
        if (!socket) return;

        if (user) {
            socket.emit('join_room', { room: 'global', userId: user.id });
        }

        // Listen for Incoming Call Ring
        socket.on('incoming_call', (data) => {
            // data: { chatId, callerName, callerId }
            // Only show if not already in a call
            if (!showCallModal) {
                setIncomingCall(data);
            }
        });

        socket.on('receive_message', async (newMsg) => {
            const readableMsg = await decryptMessageForCurrentUser(newMsg);

            if (activeChat && readableMsg.chatId === activeChat.id) {
                // Direct message content, no decryption
                setMessages(prev => {
                    if (prev.some(message => message.id === readableMsg.id)) return prev;
                    return [...prev, readableMsg];
                });
                scrollToBottom();
            }

            if (!chats.some(chat => chat.id === readableMsg.chatId)) {
                fetchChats();
                return;
            }

            setChats(prev => prev.map(c => {
                if (c.id === readableMsg.chatId) {
                    return { ...c, lastMessage: { ...c.lastMessage, content: readableMsg.type === 'text' ? readableMsg.content : readableMsg.type, timestamp: readableMsg.timestamp } };
                }
                return c;
            }));
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

        return () => {
            socket.off('receive_message');
            socket.off('incoming_call');
            socket.off('presence_update');
            socket.off('user_profile_updated');
        };
    }, [socket, activeChat, showCallModal, chats, fetchChats, decryptMessageForCurrentUser]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat) return;
            try {
                const res = await axios.get(`/api/chats/${activeChat.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                setMessages(await decryptMessagesForCurrentUser(res.data));
                scrollToBottom();

                socket?.emit('join_room', { room: activeChat.id });
            } catch (err) {
                console.error(err);
            }
        };
        fetchMessages();
    }, [activeChat, token, socket, decryptMessagesForCurrentUser]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async (text, type = 'text') => {
        if (!activeChat || !socket) return;

        if (!privateKey || !publicKey) {
            alert("Encryption keys are still loading. Please try again in a moment.");
            return;
        }

        const recipientPublicKeys = {};
        for (const participant of activeChat.participants) {
            const participantPublicKey = participant.id === user.id
                ? publicKey
                : participant.publicKey;

            if (!participantPublicKey) {
                alert(`${participant.username} does not have an encryption key yet. Ask them to login once, then try again.`);
                return;
            }

            recipientPublicKeys[participant.id] = participantPublicKey;
        }

        const encryptedContent = await encryptForRecipients(recipientPublicKeys, text);

        socket.emit('send_message', {
            chatId: activeChat.id,
            senderId: user.id,
            content: encryptedContent,
            type,
            ttl: 0
        });
    };

    const handleUpload = async (file) => {
        const maxSize = 5 * 1024 * 1024 * 1024;
        if (file.size > maxSize) {
            alert("File is too large (Max 5GB)");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                },
                timeout: 3600000,
            });

            const url = res.data.url;
            let type = 'file';
            if (file.type.startsWith('image/') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) type = 'image';
            else if (file.type.startsWith('audio/') || url.match(/\.(mp3|wav|m4a|aac|oga)$/i)) type = 'audio';
            else if (file.type.startsWith('video/') || url.match(/\.(mp4|webm|ogg)$/i)) type = 'video';

            handleSendMessage(url, type);
        } catch (err) {
            console.error(err);
            alert("Upload failed: " + (err.response?.statusText || err.message));
        }
    };

    const handleSearchUser = async (e) => {
        e.preventDefault();
        setSearchError('');
        setSearchedUser(null);

        try {
            const res = await axios.post('/api/user/search', { phone: searchPhone.trim() });
            if (res.data.error) {
                setSearchError(res.data.error);
            } else {
                setSearchedUser(res.data);
            }
        } catch (err) {
            setSearchError(err.response?.data?.error || "User not found");
        }
    };

    const startVideoCall = () => {
        if (!activeChat || !socket) return;

        // Notify others
        socket.emit('notify_ring', {
            chatId: activeChat.id,
            callerName: user.username,
            callerId: user.id,
            participants: activeChat.participants.map(p => p.id)
        });

        setShowCallModal(true);
    };

    const acceptCall = () => {
        // incomingCall: { chatId, callerName, callerId }
        // We might need to switch active chat to the calling chat if different
        if (incomingCall) {
            const chat = chats.find(c => c.id === incomingCall.chatId);
            if (chat) {
                setActiveChat(chat);
                setShowCallModal(true);
            }
            setIncomingCall(null);
        }
    };

    const rejectCall = () => {
        setIncomingCall(null);
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
            setSearchPhone('');
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
            setSearchPhone('');
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
        const otherParticipant = getOtherParticipant(chat);
        if (!otherParticipant) return "Tap to open chat";
        if (otherParticipant.isOnline) return "Online";
        return formatLastSeen(otherParticipant.lastSeen);
    };

    const visibleActiveChat = activeChat
        ? chats.find(chat => chat.id === activeChat.id) || activeChat
        : null;

    return (
        <div className="flex h-[100dvh] bg-signal-bg overflow-hidden text-gray-100 font-sans relative">
            {incomingCall && (
                <IncomingCallModal
                    callerName={incomingCall.callerName}
                    onAccept={acceptCall}
                    onReject={rejectCall}
                />
            )}

            {showCallModal && <VideoCallModal activeChat={activeChat} onClose={() => setShowCallModal(false)} />}


            {showSearchModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-signal-secondary w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">New Chat</h2>
                            <button onClick={() => setShowSearchModal(false)} className="text-gray-400 hover:text-white">Close</button>
                        </div>

                        <form onSubmit={handleSearchUser} className="mb-4">
                            <label className="block text-xs text-gray-400 mb-1 ml-1">PHONE NUMBER</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={searchPhone}
                                    onChange={(e) => setSearchPhone(e.target.value)}
                                    placeholder="e.g. 9876543210"
                                    className="flex-1 bg-signal-input border-none rounded-lg px-4 py-2 focus:ring-1 focus:ring-signal-accent outline-none text-white"
                                    autoFocus
                                />
                                <button type="submit" className="bg-signal-input hover:bg-gray-700 text-white px-4 rounded-lg font-bold">
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
                                        <img src={searchedUser.avatar} className="w-12 h-12 rounded-full" alt="" />
                                        {/* Simple online simulation logic - In real app, check socket status map */}
                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-gray-500 rounded-full border-2 border-signal-input"></div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold">{searchedUser.username}</h3>
                                        <p className="text-xs text-gray-400">Found</p>
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
                </div>
            )}

            {/* Sidebar */}
            <div className={`w-full md:w-1/3 lg:w-1/4 border-r border-gray-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
                {/* Header */}
                <div className="p-4 bg-signal-secondary flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            className="relative group"
                            title="Change profile photo"
                        >
                            <img src={user?.avatar} alt="me" className="w-10 h-10 rounded-full object-cover" />
                            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center rounded-full bg-black/60 text-[10px] text-white">
                                Edit
                            </span>
                        </button>
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
                        <button onClick={() => setShowSearchModal(true)} className="p-2 hover:bg-gray-700 rounded-full" title="New Chat">
                            <PlusIcon className="w-6 h-6" />
                        </button>
                        <button onClick={logout} className="p-2 text-red-400 hover:bg-gray-700 rounded-full text-xs">
                            Logout
                        </button>
                    </div>
                </div>

                {/* Contacts */}
                <ContactList
                    chats={chats}
                    activeChat={activeChat}
                    onSelectChat={setActiveChat}
                    loading={loadingChats}
                />
            </div>

            {/* Chat Room */}
            {visibleActiveChat ? (
                <div className={`flex-1 flex flex-col h-full bg-black/50 ${activeChat ? 'flex' : 'hidden md:flex'}`}>
                    {/* Chat Header */}
                    <div className="h-16 bg-signal-bg border-b border-gray-800 flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setActiveChat(null); localStorage.removeItem('activeChatId'); }} className="md:hidden p-2 -ml-2">
                                <ArrowLeftIcon className="w-6 h-6 text-gray-300" />
                            </button>
                            <img
                                src={visibleActiveChat.avatar || `https://ui-avatars.com/api/?name=${visibleActiveChat.name}`}
                                className="w-10 h-10 rounded-full"
                                alt=""
                            />
                            <div>
                                <h3 className="font-bold text-sm md:text-base">{visibleActiveChat.name}</h3>
                                <p className={`text-xs ${getOtherParticipant(visibleActiveChat)?.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                                    {getChatStatus(visibleActiveChat)}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-4 text-signal-accent">
                            <button onClick={startVideoCall}><PhoneIcon className="w-6 h-6" /></button>
                            <button onClick={startVideoCall}><VideoCameraIcon className="w-6 h-6" /></button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://adrianh.com/assets/images/signal-bg.png')] bg-repeat bg-contain bg-opacity-5">
                        {messages.map((msg, idx) => (
                            <ChatBubble
                                key={idx}
                                message={msg}
                                isOwn={msg.senderId === user.id}
                                senderName={visibleActiveChat.participants.find(p => p.id === msg.senderId)?.username}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <MessageInput onSend={handleSendMessage} onUpload={handleUpload} />
                </div>
            ) : (
                <div className="hidden md:flex flex-1 items-center justify-center flex-col text-gray-500">
                    <h2 className="text-2xl font-bold mb-2">Welcome to Signal Clone</h2>
                    <p>Select a chat or click + to start messaging.</p>
                </div>
            )}
        </div>
    );
};

export default Home;
