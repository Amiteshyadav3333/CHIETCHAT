import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    XMarkIcon, TrashIcon, SparklesIcon,
    PaperAirplaneIcon, StopIcon, MicrophoneIcon,
    PhotoIcon, HeartIcon, FaceSmileIcon
} from '@heroicons/react/24/solid';
import { ArrowLeftIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';

/* ─── Emoji quick picker ─── */
const EMOJIS = ['😊','😂','🥺','😍','🔥','💯','👀','🙏','❤️','😎','🤔','😭','✨','🥰','😅'];

/* ─── Markdown renderer (bold, code, inline code) ─── */
const renderMarkdown = (text) => {
    const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const code = part.slice(3, -3).replace(/^\w+\n/, '');
            return (
                <pre key={i} className="ai-code-block">
                    {code}
                </pre>
            );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="ai-inline-code">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
    });
};

/* ─── Typing dots ─── */
const TypingDots = () => (
    <div className="ai-typing-dots">
        <span /><span /><span />
    </div>
);

/* ─── Message bubble ─── */
const MessageBubble = ({ msg, botInfo }) => {
    const isUser = msg.role === 'user';
    const isImage = !!msg.imageUrl;

    return (
        <div className={`ai-msg-row ${isUser ? 'ai-msg-row--user' : 'ai-msg-row--bot'}`}>
            {!isUser && (
                <div className="ai-avatar-sm">
                    <img src={botInfo?.avatar} alt={botInfo?.name} />
                    <span className="ai-avatar-online" />
                </div>
            )}
            <div className={`ai-bubble ${isUser ? 'ai-bubble--user' : 'ai-bubble--bot'}`}>
                {isImage ? (
                    <>
                        <p className="ai-bubble-text">{msg.content}</p>
                        <img
                            src={msg.imageUrl}
                            alt="AI Generated"
                            className="ai-gen-img"
                            onClick={() => window.open(msg.imageUrl, '_blank')}
                        />
                    </>
                ) : (
                    <div className="ai-bubble-text">
                        {renderMarkdown(msg.content)}
                    </div>
                )}
                <span className="ai-bubble-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
};

/* ─── Main AiChat component ─── */
const AiChat = ({ onClose, onBack }) => {
    const { token, user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [botInfo, setBotInfo] = useState(null);
    const [streamingText, setStreamingText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [userGender, setUserGender] = useState('unknown');

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const abortRef = useRef(false);

    // Detect gender from user profile or localStorage
    useEffect(() => {
        const storedUser = user || JSON.parse(localStorage.getItem('user') || '{}');
        const g = storedUser?.gender || 'unknown';
        setUserGender(g);
    }, [user]);

    // Load bot info + message history
    useEffect(() => {
        axios.get('/api/ai/info', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                setBotInfo(r.data);
                const g = r.data.user_gender || 'unknown';
                setUserGender(g);
            })
            .catch(() => {});

        axios.get('/api/ai/memory', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (r.data.length > 0) {
                    setMessages(r.data.map((m, i) => ({
                        id: i,
                        role: m.role,
                        content: m.content,
                        timestamp: m.timestamp
                    })));
                } else {
                    // Will be set after botInfo loads
                    setMessages([]);
                }
            })
            .catch(() => {});
    }, [token]);

    // Set welcome message once botInfo is ready
    useEffect(() => {
        if (botInfo && messages.length === 0) {
            const isArjun = botInfo.name === 'Arjun';
            const welcome = isArjun
                ? `Hey! Main hoon **${botInfo.name}** 😎\n\nTeri koi bhi baat ho — personal, kuch seekhna ho, ya bas timepass — main hoon yahan!\n\nBata, kya chal raha hai? 🙌`
                : `Heyy! Main hoon **${botInfo.name}** ✨\n\nMujhse kuch bhi poochh sakte ho — koi bhi sawaal, dil ki baat, ya kuch naya seekhna ho!\n\nKya baat karni hai aaj? 😊`;
            setMessages([{
                id: 0,
                role: 'assistant',
                content: welcome,
                timestamp: new Date().toISOString()
            }]);
        }
    }, [botInfo]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    const sendMessage = async (text) => {
        if (!text.trim() || loading) return;
        setShowEmoji(false);
        const userMsg = {
            id: Date.now(), role: 'user',
            content: text, timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setStreamingText('');
        abortRef.current = false;

        // Image generation trigger
        const imgTriggers = ['generate image', 'create image', 'draw', 'image banao', 'photo banao', 'tasveer', 'image generate karo'];
        if (imgTriggers.some(t => text.toLowerCase().includes(t))) {
            try {
                const res = await axios.post('/api/ai/image',
                    { prompt: text },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: `Yeh rahi teri image! 🎨`,
                    imageUrl: res.data.url,
                    timestamp: new Date().toISOString()
                }]);
            } catch {
                setMessages(prev => [...prev, {
                    id: Date.now(), role: 'assistant',
                    content: "Arre yaar, image nahi ban payi. Ek baar aur try karo! 🙏",
                    timestamp: new Date().toISOString()
                }]);
            }
            setLoading(false);
            return;
        }

        const baseUrl = import.meta.env.VITE_API_URL || '';
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const streamUrl = `${cleanBaseUrl}/api/ai/chat/stream`;

        // Streaming chat
        try {
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ message: text, user_gender: userGender })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            while (true) {
                if (abortRef.current) break;
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;
                        try {
                            const obj = JSON.parse(data);
                            if (obj.token) {
                                fullText += obj.token;
                                setStreamingText(fullText);
                            }
                        } catch { }
                    }
                }
            }

            if (fullText) {
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: fullText,
                    timestamp: new Date().toISOString()
                }]);
            }
            setStreamingText('');
        } catch {
            setMessages(prev => [...prev, {
                id: Date.now(), role: 'assistant',
                content: "Yaar, kuch problem aa gayi. Thodi der baad try karo! 🙏",
                timestamp: new Date().toISOString()
            }]);
        }
        setLoading(false);
    };

    const handleStop = () => { abortRef.current = true; setLoading(false); };

    const handleClearMemory = async () => {
        if (!window.confirm('Poori conversation delete karein?')) return;
        await axios.delete('/api/ai/memory', { headers: { Authorization: `Bearer ${token}` } });
        const isArjun = botInfo?.name === 'Arjun';
        setMessages([{
            id: 0, role: 'assistant',
            content: isArjun
                ? "Fresh start! Bata, kya poochna tha? 😎"
                : "Okay, sab clear! Ab se naya shuru karte hain 🧹✨",
            timestamp: new Date().toISOString()
        }]);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            audioChunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                sendMessage("🎤 Voice message (transcription coming soon)");
            };
            mr.start();
            setIsRecording(true);
        } catch {
            alert('Microphone access chahiye. Please allow karo!');
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    // Quick prompt suggestions based on AI gender
    const quickPrompts = botInfo?.name === 'Arjun'
        ? ["Kya chal raha hai? 😎", "Koi mast joke sunao", "Life advice do", "Kuch motivate karo 💪", "Best movie recommend karo"]
        : ["Hii Aria! 👋", "Koi interesting baat batao ✨", "Mujhe motivate karo 💪", "Aaj boring lag raha hai", "Koi fun fact batao 🌟"];

    const isArjun = botInfo?.name === 'Arjun';

    return (
        <div className="ai-chat-root">
            <style>{`
                .ai-chat-root {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #0b141a;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    overflow: hidden;
                }

                /* ─── Header ─── */
                .ai-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: linear-gradient(135deg, #1a1f2e 0%, #202c33 100%);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    flex-shrink: 0;
                    position: relative;
                    z-index: 10;
                }
                .ai-header-avatar {
                    position: relative;
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    overflow: hidden;
                    border: 2px solid ${isArjun ? '#60a5fa' : '#c084fc'};
                    box-shadow: 0 0 12px ${isArjun ? 'rgba(96,165,250,0.4)' : 'rgba(192,132,252,0.4)'};
                    flex-shrink: 0;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                .ai-header-avatar:hover { transform: scale(1.05); }
                .ai-header-avatar img { width: 100%; height: 100%; object-fit: cover; }
                .ai-header-online {
                    position: absolute;
                    bottom: 1px; right: 1px;
                    width: 10px; height: 10px;
                    background: #22c55e;
                    border-radius: 50%;
                    border: 2px solid #1a1f2e;
                    animation: pulse-green 2s infinite;
                }
                @keyframes pulse-green {
                    0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
                    50% { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
                }
                .ai-header-info { flex: 1; min-width: 0; }
                .ai-header-name {
                    font-size: 15px;
                    font-weight: 700;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .ai-header-status {
                    font-size: 11px;
                    color: ${isArjun ? '#60a5fa' : '#c084fc'};
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 1px;
                }
                .ai-header-status-dot {
                    width: 6px; height: 6px;
                    background: #22c55e;
                    border-radius: 50%;
                    animation: pulse-green 2s infinite;
                }
                .ai-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .ai-icon-btn {
                    width: 36px; height: 36px;
                    border-radius: 50%;
                    border: none;
                    background: rgba(255,255,255,0.06);
                    color: #9ca3af;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ai-icon-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
                .ai-icon-btn--danger:hover { background: rgba(239,68,68,0.2); color: #f87171; }

                /* ─── Messages area ─── */
                .ai-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    scroll-behavior: smooth;
                    background: 
                        radial-gradient(ellipse at top left, rgba(139,92,246,0.06) 0%, transparent 50%),
                        radial-gradient(ellipse at bottom right, rgba(59,130,246,0.06) 0%, transparent 50%),
                        linear-gradient(180deg, #0b141a 0%, #0d1b22 100%);
                }
                .ai-messages::-webkit-scrollbar { width: 4px; }
                .ai-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

                /* ─── Quick prompts ─── */
                .ai-quick-prompts {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 8px;
                    animation: fadeInUp 0.4s ease;
                }
                .ai-quick-btn {
                    font-size: 12px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    border: 1px solid ${isArjun ? 'rgba(96,165,250,0.3)' : 'rgba(192,132,252,0.3)'};
                    background: ${isArjun ? 'rgba(96,165,250,0.1)' : 'rgba(192,132,252,0.1)'};
                    color: ${isArjun ? '#93c5fd' : '#d8b4fe'};
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                .ai-quick-btn:hover {
                    background: ${isArjun ? 'rgba(96,165,250,0.2)' : 'rgba(192,132,252,0.2)'};
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px ${isArjun ? 'rgba(96,165,250,0.2)' : 'rgba(192,132,252,0.2)'};
                }

                /* ─── Message rows ─── */
                .ai-msg-row {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                    animation: fadeInUp 0.3s ease;
                }
                .ai-msg-row--user { justify-content: flex-end; }
                .ai-msg-row--bot { justify-content: flex-start; }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* ─── Avatar small ─── */
                .ai-avatar-sm {
                    width: 28px; height: 28px;
                    border-radius: 50%;
                    overflow: hidden;
                    flex-shrink: 0;
                    border: 1.5px solid ${isArjun ? '#60a5fa' : '#c084fc'};
                    position: relative;
                }
                .ai-avatar-sm img { width: 100%; height: 100%; object-fit: cover; }
                .ai-avatar-online {
                    position: absolute;
                    bottom: 0; right: 0;
                    width: 7px; height: 7px;
                    background: #22c55e;
                    border-radius: 50%;
                    border: 1.5px solid #0b141a;
                }

                /* ─── Bubbles ─── */
                .ai-bubble {
                    max-width: 78%;
                    padding: 10px 14px;
                    border-radius: 18px;
                    font-size: 14.5px;
                    line-height: 1.5;
                    word-break: break-word;
                    position: relative;
                    transition: transform 0.1s;
                }
                .ai-bubble:active { transform: scale(0.98); }

                .ai-bubble--bot {
                    background: linear-gradient(135deg, #1e2d36 0%, #202c33 100%);
                    color: #e5e7eb;
                    border-top-left-radius: 4px;
                    border: 1px solid ${isArjun ? 'rgba(96,165,250,0.15)' : 'rgba(192,132,252,0.15)'};
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                .ai-bubble--user {
                    background: linear-gradient(135deg, ${isArjun ? '#1d4ed8' : '#7c3aed'} 0%, ${isArjun ? '#2563eb' : '#6d28d9'} 100%);
                    color: #fff;
                    border-top-right-radius: 4px;
                    box-shadow: 0 2px 8px ${isArjun ? 'rgba(37,99,235,0.35)' : 'rgba(109,40,217,0.35)'};
                }

                .ai-bubble-text { white-space: pre-wrap; }
                .ai-bubble-time {
                    display: block;
                    font-size: 10px;
                    text-align: right;
                    margin-top: 4px;
                    opacity: 0.5;
                }

                /* ─── Code blocks ─── */
                .ai-code-block {
                    background: rgba(0,0,0,0.4);
                    border-radius: 8px;
                    padding: 10px;
                    font-size: 12px;
                    overflow-x: auto;
                    margin: 6px 0;
                    font-family: 'Fira Code', 'Consolas', monospace;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .ai-inline-code {
                    background: rgba(0,0,0,0.35);
                    padding: 1px 5px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-family: monospace;
                }

                /* ─── Generated image ─── */
                .ai-gen-img {
                    max-width: 240px;
                    width: 100%;
                    border-radius: 12px;
                    margin-top: 6px;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                .ai-gen-img:hover { transform: scale(1.02); }

                /* ─── Typing dots ─── */
                .ai-typing-dots {
                    display: flex;
                    gap: 4px;
                    align-items: center;
                    padding: 4px 2px;
                }
                .ai-typing-dots span {
                    width: 7px; height: 7px;
                    background: ${isArjun ? '#60a5fa' : '#c084fc'};
                    border-radius: 50%;
                    animation: bounce-dot 1.2s infinite ease-in-out;
                }
                .ai-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
                .ai-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
                @keyframes bounce-dot {
                    0%,80%,100% { transform: translateY(0); opacity: 0.5; }
                    40% { transform: translateY(-6px); opacity: 1; }
                }

                /* ─── Streaming cursor ─── */
                .ai-cursor {
                    display: inline-block;
                    width: 2px; height: 16px;
                    background: ${isArjun ? '#60a5fa' : '#c084fc'};
                    margin-left: 2px;
                    vertical-align: middle;
                    animation: blink 0.8s infinite;
                    border-radius: 1px;
                }
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

                /* ─── Input bar ─── */
                .ai-input-bar {
                    flex-shrink: 0;
                    background: linear-gradient(180deg, #1a2027 0%, #202c33 100%);
                    border-top: 1px solid rgba(255,255,255,0.06);
                    padding: 10px 12px;
                    position: relative;
                }
                .ai-input-row {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                    background: #2a3942;
                    border-radius: 24px;
                    padding: 6px 6px 6px 14px;
                    border: 1px solid transparent;
                    transition: border-color 0.2s;
                }
                .ai-input-row:focus-within {
                    border-color: ${isArjun ? 'rgba(96,165,250,0.35)' : 'rgba(192,132,252,0.35)'};
                    box-shadow: 0 0 0 2px ${isArjun ? 'rgba(96,165,250,0.08)' : 'rgba(192,132,252,0.08)'};
                }
                .ai-emoji-btn {
                    background: none;
                    border: none;
                    color: #6b7280;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    transition: color 0.2s;
                    flex-shrink: 0;
                    align-self: flex-end;
                    margin-bottom: 2px;
                }
                .ai-emoji-btn:hover { color: #d1d5db; }
                .ai-textarea {
                    flex: 1;
                    background: none;
                    border: none;
                    color: #e5e7eb;
                    font-size: 15px;
                    resize: none;
                    outline: none;
                    max-height: 120px;
                    overflow-y: auto;
                    line-height: 1.4;
                    padding: 4px 0;
                    font-family: inherit;
                    scrollbar-width: none;
                }
                .ai-textarea::placeholder { color: #4b5563; }
                .ai-textarea::-webkit-scrollbar { display: none; }

                .ai-send-btn {
                    width: 38px; height: 38px;
                    border-radius: 50%;
                    border: none;
                    background: linear-gradient(135deg, ${isArjun ? '#2563eb' : '#7c3aed'} 0%, ${isArjun ? '#1d4ed8' : '#6d28d9'} 100%);
                    color: #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    flex-shrink: 0;
                    transition: all 0.2s;
                    box-shadow: 0 2px 8px ${isArjun ? 'rgba(37,99,235,0.4)' : 'rgba(124,58,237,0.4)'};
                }
                .ai-send-btn:hover { transform: scale(1.08); box-shadow: 0 4px 14px ${isArjun ? 'rgba(37,99,235,0.5)' : 'rgba(124,58,237,0.5)'}; }
                .ai-send-btn:active { transform: scale(0.95); }
                .ai-send-btn--stop { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); box-shadow: 0 2px 8px rgba(220,38,38,0.4); }
                .ai-send-btn--mic { background: linear-gradient(135deg, #059669 0%, #047857 100%); box-shadow: 0 2px 8px rgba(5,150,105,0.4); }
                .ai-send-btn--recording { animation: pulse-red 1.2s infinite; }
                @keyframes pulse-red {
                    0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
                }

                .ai-footer-note {
                    font-size: 10px;
                    color: #374151;
                    text-align: center;
                    margin-top: 6px;
                }

                /* ─── Emoji picker ─── */
                .ai-emoji-picker {
                    position: absolute;
                    bottom: 100%;
                    left: 12px;
                    background: #1e2d36;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 14px;
                    padding: 10px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    width: 220px;
                    box-shadow: 0 -8px 24px rgba(0,0,0,0.4);
                    animation: slideUp 0.2s ease;
                    z-index: 100;
                }
                @keyframes slideUp {
                    from { opacity:0; transform: translateY(8px); }
                    to { opacity:1; transform: translateY(0); }
                }
                .ai-emoji-item {
                    font-size: 20px;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 6px;
                    transition: background 0.15s;
                    line-height: 1;
                }
                .ai-emoji-item:hover { background: rgba(255,255,255,0.08); }

                /* ─── Date divider ─── */
                .ai-date-divider {
                    text-align: center;
                    font-size: 11px;
                    color: #4b5563;
                    margin: 8px 0;
                    position: relative;
                }
                .ai-date-divider::before, .ai-date-divider::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    width: 30%;
                    height: 1px;
                    background: rgba(255,255,255,0.06);
                }
                .ai-date-divider::before { left: 0; }
                .ai-date-divider::after { right: 0; }
            `}</style>

            {/* ─── Header ─── */}
            <div className="ai-header">
                <button onClick={onBack} className="ai-icon-btn md:hidden">
                    <ArrowLeftIcon style={{ width: 18, height: 18 }} />
                </button>

                <div className="ai-header-avatar">
                    <img
                        src={botInfo?.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=Aria`}
                        alt={botInfo?.name}
                    />
                    <span className="ai-header-online" />
                </div>

                <div className="ai-header-info">
                    <div className="ai-header-name">
                        {botInfo?.name || 'Aria'} <span style={{ fontSize: 12, opacity: 0.6 }}>AI</span>
                    </div>
                    <div className="ai-header-status">
                        <span className="ai-header-status-dot" />
                        Online • Hamesha yahan hoon ✨
                    </div>
                </div>

                <div className="ai-header-actions">
                    <button onClick={handleClearMemory} className="ai-icon-btn ai-icon-btn--danger" title="Clear conversation">
                        <TrashIcon style={{ width: 16, height: 16 }} />
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="ai-icon-btn">
                            <XMarkIcon style={{ width: 18, height: 18 }} />
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Messages ─── */}
            <div className="ai-messages">
                {/* Quick prompts (shown when few messages) */}
                {messages.length <= 1 && (
                    <div className="ai-quick-prompts">
                        {quickPrompts.map((p, i) => (
                            <button key={i} onClick={() => sendMessage(p)} className="ai-quick-btn">
                                {p}
                            </button>
                        ))}
                    </div>
                )}

                {messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} botInfo={botInfo} />
                ))}

                {/* Streaming bubble */}
                {streamingText && (
                    <div className="ai-msg-row ai-msg-row--bot">
                        <div className="ai-avatar-sm">
                            <img src={botInfo?.avatar} alt={botInfo?.name} />
                            <span className="ai-avatar-online" />
                        </div>
                        <div className="ai-bubble ai-bubble--bot">
                            <div className="ai-bubble-text">
                                {renderMarkdown(streamingText)}
                                <span className="ai-cursor" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Thinking indicator */}
                {loading && !streamingText && (
                    <div className="ai-msg-row ai-msg-row--bot">
                        <div className="ai-avatar-sm">
                            <img src={botInfo?.avatar} alt={botInfo?.name} />
                            <span className="ai-avatar-online" />
                        </div>
                        <div className="ai-bubble ai-bubble--bot">
                            <TypingDots />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* ─── Input bar ─── */}
            <div className="ai-input-bar">
                {/* Emoji picker */}
                {showEmoji && (
                    <div className="ai-emoji-picker">
                        {EMOJIS.map((e, i) => (
                            <span
                                key={i}
                                className="ai-emoji-item"
                                onClick={() => { setInput(prev => prev + e); setShowEmoji(false); inputRef.current?.focus(); }}
                            >
                                {e}
                            </span>
                        ))}
                    </div>
                )}

                <div className="ai-input-row">
                    <button
                        className="ai-emoji-btn"
                        onClick={() => setShowEmoji(v => !v)}
                        title="Emoji"
                    >
                        <FaceSmileIcon style={{ width: 22, height: 22 }} />
                    </button>

                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage(input);
                            }
                        }}
                        placeholder={
                            botInfo?.name === 'Arjun'
                                ? "Arjun se kuch bhi poochho..."
                                : "Aria se kuch bhi poochho..."
                        }
                        rows={1}
                        disabled={loading && !streamingText}
                        className="ai-textarea"
                        onInput={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                    />

                    {loading && streamingText ? (
                        <button onClick={handleStop} className="ai-send-btn ai-send-btn--stop">
                            <StopIcon style={{ width: 18, height: 18 }} />
                        </button>
                    ) : input.trim() ? (
                        <button onClick={() => sendMessage(input)} className="ai-send-btn">
                            <PaperAirplaneIcon style={{ width: 18, height: 18 }} />
                        </button>
                    ) : (
                        <button
                            onMouseDown={startRecording}
                            onMouseUp={stopRecording}
                            onTouchStart={startRecording}
                            onTouchEnd={stopRecording}
                            className={`ai-send-btn ai-send-btn--mic ${isRecording ? 'ai-send-btn--recording' : ''}`}
                        >
                            {isRecording
                                ? <StopIcon style={{ width: 18, height: 18 }} />
                                : <MicrophoneIcon style={{ width: 18, height: 18 }} />
                            }
                        </button>
                    )}
                </div>

                <p className="ai-footer-note">
                    ✨ {botInfo?.name || 'AI'} — Tera apna personal AI companion
                </p>
            </div>
        </div>
    );
};

export default AiChat;
