import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ContactList from '../components/ContactList';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import IncomingCallModal from '../components/IncomingCallModal';
import VideoCallModal from '../components/VideoCall';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PhoneIcon, VideoCameraIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';

const Home = () => {
    const { user, token, logout } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);
    const navigate = useNavigate();

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
            if (activeChat && newMsg.chatId === activeChat.id) {
                // Direct message content, no decryption
                setMessages(prev => [...prev, newMsg]);
                scrollToBottom();
            }

            setChats(prev => prev.map(c => {
                if (c.id === newMsg.chatId) {
                    return { ...c, lastMessage: { ...c.lastMessage, content: newMsg.type === 'text' ? newMsg.content : newMsg.type, timestamp: newMsg.timestamp } };
                }
                return c;
            }));
        });

        return () => {
            socket.off('receive_message');
            socket.off('incoming_call');
        };
    }, [socket, activeChat, showCallModal]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat) return;
            try {
                const res = await axios.get(`/api/chats/${activeChat.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                setMessages(res.data);
                scrollToBottom();

                socket.emit('join_room', { room: activeChat.id });
            } catch (err) {
                console.error(err);
            }
        };
        fetchMessages();
    }, [activeChat, token, socket]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async (text, type = 'text') => {
        if (!activeChat) return;

        // Send Plain Text
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
            content: text,
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
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 3600000,
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
        if (!activeChat) return;

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

    // ... (startChat)

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
