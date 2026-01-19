import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import ContactList from '../components/ContactList';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import VideoCallModal from '../components/VideoCall';
import { decryptMessage, encryptMessage, importPublicKey, generateKeys } from '../utils/encryption';
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

    // E2EE Keys
    const [myKeys, setMyKeys] = useState(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const init = async () => {
            // Load keys from storage if available
            const storedPriv = localStorage.getItem(`privKey_${user?.username}`);
            // We need to re-import them properly using hook logic or here
            // simplified for now: re-gen if missing in storage logic 
            // but for this MVP let's just generate new if not handled by hook
            const keys = await generateKeys();
            setMyKeys(keys);
        };
        if (user) init();
    }, [user]);

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
            // The modal will capture the event too via its own listener
        });

        socket.on('receive_message', async (newMsg) => {
            if (activeChat && newMsg.chatId === activeChat.id) {
                let content = newMsg.content;
                if (myKeys && newMsg.senderId !== user.id && newMsg.type === 'text') {
                    content = await decryptMessage(myKeys.privateKey, newMsg.content);
                }
                // If not text (image), content is url, don't decrypt

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
    }, [socket, activeChat, myKeys, user]);

    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat) return;
            try {
                const res = await axios.get(`/api/chats/${activeChat.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const decryptedMsgs = await Promise.all(res.data.map(async (msg) => {
                    if (msg.type !== 'text') return msg; // Images don't need decryption in this simple version

                    if (msg.senderId === user.id) {
                        return { ...msg, content: "🔒 Encrypted (History)" };
                    }
                    if (myKeys) {
                        try {
                            const decrypted = await decryptMessage(myKeys.privateKey, msg.content);
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
    }, [activeChat, token, myKeys, user, socket]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async (text, type = 'text') => {
        if (!activeChat) return;

        const otherParticipant = activeChat.participants.find(p => p.id !== user.id);
        const otherPubKeyString = otherParticipant?.publicKey;

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
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            handleSendMessage(res.data.url, 'image');
        } catch (err) {
            console.error(err);
            alert("Upload failed");
        }
    };

    const createChatByPhone = async () => {
        const phone = prompt("Enter User's Phone Number:");
        if (!phone) return;

        try {
            // Search user
            const userRes = await axios.post('/api/user/search', { phone });
            const foundUser = userRes.data;

            if (foundUser) {
                await axios.post('/api/chats/create', {
                    participants: [user.id, foundUser.id]
                });
                window.location.reload();
            }
        } catch (err) {
            alert(err.response?.data?.error || "User not found or error");
        }
    };

    return (
        <div className="flex h-screen bg-signal-bg overflow-hidden text-gray-100 font-sans">
            {showCallModal && <VideoCallModal activeChat={activeChat} onClose={() => setShowCallModal(false)} />}

            {/* Sidebar */}
            <div className={`w-full md:w-1/3 lg:w-1/4 border-r border-gray-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
                {/* Header */}
                <div className="p-4 bg-signal-secondary flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                        <img src={user?.avatar} alt="me" className="w-10 h-10 rounded-full" />
                        <h2 className="font-bold">{user?.username}</h2>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={createChatByPhone} className="p-2 hover:bg-gray-700 rounded-full">
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
