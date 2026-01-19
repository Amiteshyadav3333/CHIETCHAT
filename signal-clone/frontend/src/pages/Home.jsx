import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ContactList from '../components/ContactList';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import VideoCallModal from '../components/VideoCall';
import { decryptMessage, encryptMessage, importPublicKey } from '../utils/encryption';
import { useEncryption } from '../hooks/useEncryption';
import { ArrowLeftIcon, PhoneIcon, VideoCameraIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const Home = () => {
    const { user, token, logout } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);
    const navigate = useNavigate();

    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingChats, setLoadingChats] = useState(true);
    const [showCallModal, setShowCallModal] = useState(false);

    // E2EE Keys via Hook
    const { privateKey } = useEncryption(user, token);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const fetchChats = async () => {
            try {
                const res = await axios.get('/api/chats', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setChats(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingChats(false);
            }
        };
        if (token) fetchChats();
    }, [token]);

    useEffect(() => {
        if (!socket) return;

        // Listen for call requests to auto-show modal
        socket.on('call_made', (data) => {
            setShowCallModal(true);
        });

        socket.on('receive_message', async (newMsg) => {
            if (activeChat && newMsg.chatId === activeChat.id) {
                let content = newMsg.content;
                if (privateKey && newMsg.senderId !== user.id && newMsg.type === 'text') {
                    try {
                        content = await decryptMessage(privateKey, newMsg.content);
                    } catch (e) {
                        content = "⚠️ Decryption Error";
                    }
                }

                setMessages(prev => [...prev, { ...newMsg, content }]);
                scrollToBottom();
            }

            setChats(prev => prev.map(c => {
                if (c.id === newMsg.chatId) {
                    return { ...c, lastMessage: { ...c.lastMessage, content: 'New Message', timestamp: newMsg.timestamp } };
                }
                return c;
            }));
        });

        return () => {
            socket.off('receive_message');
            socket.off('call_made');
        };
    }, [socket, activeChat, privateKey, user]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat) return;
            try {
                const res = await axios.get(`/api/chats/${activeChat.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const decryptedMsgs = await Promise.all(res.data.map(async (msg) => {
                    if (msg.type !== 'text') return msg;

                    if (msg.senderId === user.id) {
                        // For own messages, we theoretically can't decrypt them if we didn't store self-encrypted version
                        // But usually we just show "You sent an encrypted message" or if we store plain text locally.
                        // For this simple clone, we will mark them.
                        // Improvement: If we want to read history, we should store a version encrypted with OUR public key too.
                        // But for now, keep existing behavior or just show content if it wasn't actually encrypted (backward compat)
                        // Actually, let's just show "Encrypted message" if we can't do anything, or try.
                        return { ...msg, content: "You (Encrypted)" };
                    }
                    if (privateKey) {
                        try {
                            const decrypted = await decryptMessage(privateKey, msg.content);
                            return { ...msg, content: decrypted };
                        } catch (e) {
                            return { ...msg, content: "🔒 Decryption Failed" };
                        }
                    }
                    return msg;
                }));

                setMessages(decryptedMsgs);
                scrollToBottom();

                socket.emit('join_room', { room: activeChat.id });
            } catch (err) {
                console.error(err);
            }
        };
        fetchMessages();
    }, [activeChat, token, privateKey, user, socket]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async (text, type = 'text') => {
        if (!activeChat) return;

        const otherParticipant = activeChat.participants.find(p => p.id !== user.id);

        // Fetch fresh public key for recipient to avoid decryption errors if they re-logged in
        let otherPubKeyString = otherParticipant?.publicKey;
        if (otherParticipant) {
            try {
                const keyRes = await axios.get(`/api/users/${otherParticipant.id}/key`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (keyRes.data.publicKey) {
                    otherPubKeyString = keyRes.data.publicKey;
                }
            } catch (e) {
                console.error("Failed to fetch fresh public key", e);
            }
        }

        let encryptedContent = text;

        if (otherPubKeyString && type === 'text') {
            try {
                const otherKey = await importPublicKey(otherPubKeyString);
                encryptedContent = await encryptMessage(otherKey, text);
            } catch (e) {
                console.error("Encryption failed, sending plain", e);
            }
        }

        const tempMsg = {
            id: Date.now(),
            senderId: user.id,
            content: text,
            type,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempMsg]);
        scrollToBottom();

        socket.emit('send_message', {
            chatId: activeChat.id,
            senderId: user.id,
            content: encryptedContent,
            type,
            ttl: 0
        });
    };

    const handleUpload = async (file) => {
        // 5GB limit check (roughly usually handled by server, but good for UI)
        // file.size is in bytes. 5GB = 5 * 1024 * 1024 * 1024
        const maxSize = 5 * 1024 * 1024 * 1024;
        if (file.size > maxSize) {
            alert("File is too large (Max 5GB)");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        try {
            // Set timeout to 0 (no timeout) or very large for big files
            const res = await axios.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 3600000,
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    console.log(`Upload Progress: ${percentCompleted}%`);
                }
            });

            const url = res.data.url;
            let type = 'file';
            if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) type = 'image';
            else if (url.match(/\.(mp4|webm|ogg)$/i)) type = 'video';

            handleSendMessage(url, type);
        } catch (err) {
            console.error(err);
            alert("Upload failed: " + (err.response?.statusText || err.message));
        }
    };

    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchPhone, setSearchPhone] = useState('');
    const [searchedUser, setSearchedUser] = useState(null);
    const [searchError, setSearchError] = useState('');

    const handleSearchUser = async (e) => {
        e.preventDefault();
        setSearchError('');
        setSearchedUser(null);

        try {
            const res = await axios.post('/api/user/search', { phone: searchPhone.trim() });
            setSearchedUser(res.data);
        } catch (err) {
            setSearchError(err.response?.data?.error || "User not found");
        }
    };

    const startChat = async () => {
        if (!searchedUser) return;
        try {
            await axios.post('/api/chats/create', {
                participants: [user.id, searchedUser.id]
            });
            setShowSearchModal(false);
            setSearchedUser(null);
            setSearchPhone('');
            // Refresh chats
            const res = await axios.get('/api/chats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setChats(res.data);
        } catch (err) {
            alert("Error creating chat");
        }
    };

    return (
        <div className="flex h-screen bg-signal-bg overflow-hidden text-gray-100 font-sans relative">
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
                        <img src={user?.avatar} alt="me" className="w-10 h-10 rounded-full" />
                        <h2 className="font-bold">{user?.username}</h2>
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
                />
            </div>

            {/* Chat Room */}
            {activeChat ? (
                <div className={`flex-1 flex flex-col h-full bg-black/50 ${activeChat ? 'flex' : 'hidden md:flex'}`}>
                    {/* Chat Header */}
                    <div className="h-16 bg-signal-bg border-b border-gray-800 flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setActiveChat(null)} className="md:hidden p-2 -ml-2">
                                <ArrowLeftIcon className="w-6 h-6 text-gray-300" />
                            </button>
                            <img
                                src={activeChat.avatar || `https://ui-avatars.com/api/?name=${activeChat.name}`}
                                className="w-10 h-10 rounded-full"
                                alt=""
                            />
                            <div>
                                <h3 className="font-bold text-sm md:text-base">{activeChat.name}</h3>
                                <p className="text-xs text-green-500">Connected</p>
                            </div>
                        </div>
                        <div className="flex gap-4 text-signal-accent">
                            <button onClick={() => setShowCallModal(true)}><PhoneIcon className="w-6 h-6" /></button>
                            <button onClick={() => setShowCallModal(true)}><VideoCameraIcon className="w-6 h-6" /></button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://adrianh.com/assets/images/signal-bg.png')] bg-repeat bg-contain bg-opacity-5">
                        {messages.map((msg, idx) => (
                            <ChatBubble
                                key={idx}
                                message={msg}
                                isOwn={msg.senderId === user.id}
                                senderName={activeChat.participants.find(p => p.id === msg.senderId)?.username}
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
