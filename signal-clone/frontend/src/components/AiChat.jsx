import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { XMarkIcon, TrashIcon, SparklesIcon, PhotoIcon, MicrophoneIcon, StopIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const AiChat = ({ onClose, onBack }) => {
    const { token } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [botInfo, setBotInfo] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const abortRef = useRef(false);

    useEffect(() => {
        // Load bot info
        axios.get('/api/ai/info', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => setBotInfo(r.data)).catch(() => {});

        // Load memory
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
                    setMessages([{
                        id: 0,
                        role: 'assistant',
                        content: `Hi! I'm **${botInfo?.name || 'Aria'}**, your AI assistant 🤖\n\nMain tumhari kisi bhi cheez mein help kar sakta hoon — questions, code, writing, images, aur bahut kuch!\n\nKya poochna hai? 😊`,
                        timestamp: new Date().toISOString()
                    }]);
                }
            }).catch(() => {});
    }, [token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    const sendMessage = async (text) => {
        if (!text.trim() || loading) return;
        const userMsg = { id: Date.now(), role: 'user', content: text, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setStreamingText('');
        abortRef.current = false;

        // Image generation trigger
        const imgTriggers = ['generate image', 'create image', 'draw', 'image banao', 'photo banao', 'tasveer'];
        if (imgTriggers.some(t => text.toLowerCase().includes(t))) {
            try {
                const res = await axios.post('/api/ai/image', { prompt: text }, { headers: { Authorization: `Bearer ${token}` } });
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: `Here's your image! 🎨`,
                    imageUrl: res.data.url,
                    timestamp: new Date().toISOString()
                }]);
            } catch {
                setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: "Image generate nahi ho saki. Try again! 🙏", timestamp: new Date().toISOString() }]);
            }
            setLoading(false);
            return;
        }

        // Streaming chat
        try {
            const response = await fetch('/api/ai/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: text })
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
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now(),
                role: 'assistant',
                content: "Kuch problem aa gayi. Please try again! 🙏",
                timestamp: new Date().toISOString()
            }]);
        }
        setLoading(false);
    };

    const handleStop = () => { abortRef.current = true; setLoading(false); };

    const handleClearMemory = async () => {
        if (!window.confirm('Clear all conversation history?')) return;
        await axios.delete('/api/ai/memory', { headers: { Authorization: `Bearer ${token}` } });
        setMessages([{
            id: 0, role: 'assistant',
            content: "Memory cleared! Fresh start karte hain 🧹",
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
                // Simple: just send a placeholder — real STT needs Whisper API
                sendMessage("🎤 Voice message (transcription coming soon)");
            };
            mr.start();
            setIsRecording(true);
        } catch { alert('Microphone permission needed.'); }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    const renderContent = (msg) => {
        if (msg.imageUrl) {
            return (
                <div>
                    <p className="text-sm mb-2">{msg.content}</p>
                    <img src={msg.imageUrl} alt="AI Generated" className="rounded-xl max-w-[240px] w-full cursor-pointer" onClick={() => window.open(msg.imageUrl, '_blank')} />
                </div>
            );
        }
        // Simple markdown: bold, code blocks
        const parts = msg.content.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
        return (
            <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                {parts.map((part, i) => {
                    if (part.startsWith('```') && part.endsWith('```')) {
                        const code = part.slice(3, -3).replace(/^\w+\n/, '');
                        return <pre key={i} className="bg-black/30 rounded-lg p-3 text-xs overflow-x-auto my-2 font-mono">{code}</pre>;
                    }
                    if (part.startsWith('`') && part.endsWith('`')) {
                        return <code key={i} className="bg-black/30 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
                    }
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i}>{part.slice(2, -2)}</strong>;
                    }
                    return <span key={i}>{part}</span>;
                })}
            </div>
        );
    };

    const quickPrompts = [
        "Mera naam kya hai?", "Ek joke sunao 😄", "Python code example do",
        "Aaj ka weather kaisa hai?", "Motivational quote do 💪"
    ];

    return (
        <div className="flex flex-col h-full bg-[#0b141a]">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-gray-800 shrink-0">
                <button onClick={onBack} className="md:hidden p-1 text-gray-400 hover:text-white">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-purple-500 shrink-0">
                    <img
                        src={botInfo?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=Aria`}
                        alt="AI"
                        className="w-full h-full object-cover"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-sm">{botInfo?.name || 'Aria AI'}</h3>
                    <p className="text-xs text-purple-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                        AI Assistant • Always Online
                    </p>
                </div>
                <button onClick={handleClearMemory} title="Clear memory" className="p-2 text-gray-400 hover:text-red-400 transition-colors">
                    <TrashIcon className="w-4 h-4" />
                </button>
                {onClose && (
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ background: 'linear-gradient(to bottom, #0b141a, #0d1b22)' }}>
                {messages.length <= 1 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {quickPrompts.map((p, i) => (
                            <button key={i} onClick={() => sendMessage(p)}
                                className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-full transition-colors">
                                {p}
                            </button>
                        ))}
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                        {msg.role === 'assistant' && (
                            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 mb-1">
                                <img src={botInfo?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=Aria`} alt="" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className={`max-w-[78%] px-3 py-2 rounded-2xl shadow-sm ${msg.role === 'user'
                            ? 'bg-[#005c4b] text-white rounded-tr-sm'
                            : 'bg-[#202c33] text-gray-100 rounded-tl-sm border border-purple-500/10'
                            }`}>
                            {renderContent(msg)}
                            <p className="text-[10px] text-right mt-1 opacity-50">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}

                {/* Streaming bubble */}
                {streamingText && (
                    <div className="flex justify-start items-end gap-2">
                        <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 mb-1">
                            <img src={botInfo?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=Aria`} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="max-w-[78%] px-3 py-2 rounded-2xl bg-[#202c33] text-gray-100 rounded-tl-sm border border-purple-500/20">
                            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{streamingText}<span className="inline-block w-1 h-4 bg-purple-400 ml-0.5 animate-pulse rounded" /></p>
                        </div>
                    </div>
                )}

                {/* Thinking indicator */}
                {loading && !streamingText && (
                    <div className="flex justify-start items-end gap-2">
                        <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                            <img src={botInfo?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=Aria`} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl bg-[#202c33] rounded-tl-sm border border-purple-500/10">
                            <div className="flex gap-1 items-center">
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 bg-[#202c33] border-t border-gray-800 px-3 py-2">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                        placeholder="Ask me anything..."
                        rows={1}
                        disabled={loading && !streamingText}
                        className="flex-1 bg-[#2a3942] text-gray-100 placeholder-gray-500 rounded-3xl px-4 py-3 text-[15px] focus:outline-none resize-none max-h-32 overflow-y-auto"
                        style={{ scrollbarWidth: 'none' }}
                    />
                    {loading && streamingText ? (
                        <button onClick={handleStop} className="w-11 h-11 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shrink-0">
                            <StopIcon className="w-5 h-5 text-white" />
                        </button>
                    ) : input.trim() ? (
                        <button onClick={() => sendMessage(input)} className="w-11 h-11 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center shrink-0 transition-colors">
                            <PaperAirplaneIcon className="w-5 h-5 text-white" />
                        </button>
                    ) : (
                        <button
                            onMouseDown={startRecording}
                            onMouseUp={stopRecording}
                            onTouchStart={startRecording}
                            onTouchEnd={stopRecording}
                            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}`}
                        >
                            {isRecording ? <StopIcon className="w-5 h-5 text-white" /> : <MicrophoneIcon className="w-5 h-5 text-white" />}
                        </button>
                    )}
                </div>
                <p className="text-[10px] text-gray-600 text-center mt-1">
                    <SparklesIcon className="w-3 h-3 inline mr-1" />
                    AI can make mistakes. Verify important info.
                </p>
            </div>
        </div>
    );
};

export default AiChat;
