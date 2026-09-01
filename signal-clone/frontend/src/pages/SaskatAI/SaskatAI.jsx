import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../../context/AuthContext';
import AdPanel from './components/AdPanel';
import './SaskatAI.css';

const MODELS = [
    { id: 'groq', label: 'Groq Llama', icon: '⚡' },
    { id: 'gemini', label: 'Gemini 2.5', icon: '✨' },
    { id: 'gpt-4', label: 'GPT-4o', icon: '🧠' },
    { id: 'grok', label: 'Grok 2', icon: '🚀' },
];

const getCsrf = () => sessionStorage.getItem('cheetchat_csrf_token') || '';

const apiFetch = (url, body) =>
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify(body),
    });

const SaskatAI = ({ onClose }) => {
    const { user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState('groq');
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [showImageGen, setShowImageGen] = useState(false);
    const [imgPrompt, setImgPrompt] = useState('');
    const [generatedImg, setGeneratedImg] = useState(null);
    const [isGeneratingImg, setIsGeneratingImg] = useState(false);
    const [attachedFile, setAttachedFile] = useState(null); // { name, type, dataUrl }
    const [contextualAd, setContextualAd] = useState(null);
    const [buyingAd, setBuyingAd] = useState(null);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const photoInputRef = useRef(null);
    const recognitionRef = useRef(null);
    const modelMenuRef = useRef(null);
    const plusMenuRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) setShowModelMenu(false);
            if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) setShowPlusMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const sendMessage = useCallback(async (text, fileAttachment = null) => {
        if (!text.trim() && !fileAttachment) return;
        const userMsg = {
            id: Date.now(),
            role: 'user',
            content: text,
            file: fileAttachment,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setAttachedFile(null);
        setIsLoading(true);

        try {
            const res = await apiFetch('/api/saskat/chat', {
                message: text || (fileAttachment ? `[Attached: ${fileAttachment.name}]` : ''),
                model: selectedModel,
                // This context lives only in the browser request; Saskat does not save it.
                history: messages.slice(-8).map(({ role, content }) => ({ role, content })),
            });
            const data = await res.json();
            if (res.ok) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: data.response,
                    sources: data.sources || [],
                    searched: data.searched,
                    timestamp: new Date(),
                }]);
                setContextualAd(data.ad || null);
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: `Error: ${data.error || 'Something went wrong'}`,
                    isError: true,
                    timestamp: new Date(),
                }]);
            }
        } catch {
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                content: 'Connection error. Please try again.',
                isError: true,
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedModel, messages]);

    const openAdPurchase = async (ad) => {
        try { await apiFetch(`/api/saskat/ads/${ad.id}/click`, {}); } catch { /* analytics must not block checkout */ }
        setBuyingAd(ad);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(input, attachedFile);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input, attachedFile);
        }
    };

    // Voice input
    const toggleVoice = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return alert('Voice not supported in this browser');
        const rec = new SpeechRecognition();
        rec.lang = 'hi-IN';
        rec.interimResults = false;
        rec.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            setInput(prev => prev + transcript);
        };
        rec.onend = () => setIsListening(false);
        rec.onerror = () => setIsListening(false);
        recognitionRef.current = rec;
        rec.start();
        setIsListening(true);
    };

    // File/Photo attach
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setAttachedFile({ name: file.name, type: file.type, dataUrl: ev.target.result });
        };
        reader.readAsDataURL(file);
        setShowPlusMenu(false);
        e.target.value = '';
    };

    // Image generation
    const handleGenerateImage = async () => {
        if (!imgPrompt.trim()) return;
        setIsGeneratingImg(true);
        setGeneratedImg(null);
        try {
            const res = await apiFetch('/api/ai/image/generate', { prompt: imgPrompt });
            const data = await res.json();
            if (res.ok && data.images?.[0]?.url) {
                setGeneratedImg(data.images[0].url);
            }
        } catch {
            alert('Image generation failed');
        } finally {
            setIsGeneratingImg(false);
        }
    };

    const sendGeneratedImage = () => {
        if (!generatedImg) return;
        setMessages(prev => [...prev, {
            id: Date.now(),
            role: 'user',
            content: `Generate image: ${imgPrompt}`,
            generatedImage: generatedImg,
            timestamp: new Date(),
        }]);
        setShowImageGen(false);
        setImgPrompt('');
        setGeneratedImg(null);
        setShowPlusMenu(false);
    };

    const currentModel = MODELS.find(m => m.id === selectedModel);

    const QUICK_PROMPTS = [
        { label: '💡 Explain AI', text: 'Explain artificial intelligence in simple terms' },
        { label: '🐍 Python code', text: 'Write a Python function to reverse a string' },
        { label: '📰 Latest news', text: 'What are the latest technology news today?' },
        { label: '✉️ Write email', text: 'Help me write a professional email' },
    ];

    return (
        <div className="sai-root">
            {/* Header */}
            <div className="sai-header">
                <div className="sai-header-left">
                    <span className="sai-logo-icon">🤖</span>
                    <div>
                        <div className="sai-title">Saskat AI</div>
                        <div className="sai-subtitle">Powered by ChietChat AI</div>
                    </div>
                </div>
                    <div className="sai-header-right">
                    {/* Incognito toggle */}
                        <span className="sai-private-badge" title="Saskat chats are not saved">🔒 Private session</span>
                    {/* Model selector */}
                    <div className="sai-model-wrap" ref={modelMenuRef}>
                        <button className="sai-model-btn" onClick={() => setShowModelMenu(v => !v)}>
                            <span>{currentModel?.icon}</span>
                            <span>{currentModel?.label}</span>
                            <span className="sai-chevron">▾</span>
                        </button>
                        {showModelMenu && (
                            <div className="sai-model-dropdown">
                                {MODELS.map(m => (
                                    <button
                                        key={m.id}
                                        className={`sai-model-option ${selectedModel === m.id ? 'active' : ''}`}
                                        onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                                    >
                                        <span>{m.icon}</span>
                                        <span>{m.label}</span>
                                        {selectedModel === m.id && <span className="sai-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button className="sai-close-btn" onClick={onClose} title="Close">✕</button>
                </div>
            </div>

            {/* Messages */}
            <div className="sai-messages">
                {messages.length === 0 && !showImageGen && (
                    <div className="sai-empty">
                        <div className="sai-empty-icon">✨</div>
                        <h2>Welcome to Saskat AI</h2>
                        <p>Ask anything — coding, writing, search, and more</p>
                        <div className="sai-quick-grid">
                            {QUICK_PROMPTS.map(q => (
                                <button key={q.text} className="sai-quick-btn" onClick={() => sendMessage(q.text)}>
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Image Generator Panel */}
                {showImageGen && (
                    <div className="sai-imggen-panel">
                        <div className="sai-imggen-header">
                            <span>🖼️ Image Generator</span>
                            <button onClick={() => { setShowImageGen(false); setGeneratedImg(null); setImgPrompt(''); }}>✕</button>
                        </div>
                        <input
                            className="sai-imggen-input"
                            placeholder="Describe the image you want..."
                            value={imgPrompt}
                            onChange={e => setImgPrompt(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleGenerateImage()}
                        />
                        <button
                            className="sai-imggen-generate-btn"
                            onClick={handleGenerateImage}
                            disabled={isGeneratingImg || !imgPrompt.trim()}
                        >
                            {isGeneratingImg ? '⏳ Generating...' : '✨ Generate'}
                        </button>
                        {generatedImg && (
                            <div className="sai-imggen-result">
                                <img src={generatedImg} alt="Generated" />
                                <div className="sai-imggen-actions">
                                    <button className="sai-imggen-send-btn" onClick={sendGeneratedImage}>Send to Chat</button>
                                    <a href={generatedImg} download="saskat-ai-image.jpg" className="sai-imggen-dl-btn">⬇ Download</a>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`sai-msg-row ${msg.role}`}>
                        {msg.role === 'assistant' && (
                            <div className="sai-ai-avatar">🤖</div>
                        )}
                        <div className={`sai-bubble ${msg.role} ${msg.isError ? 'error' : ''}`}>
                            {msg.role === 'user' && msg.file && (
                                <div className="sai-file-attach">
                                    {msg.file.type.startsWith('image/') ? (
                                        <img src={msg.file.dataUrl} alt={msg.file.name} className="sai-attach-img" />
                                    ) : (
                                        <div className="sai-attach-file">📎 {msg.file.name}</div>
                                    )}
                                </div>
                            )}
                            {msg.generatedImage && (
                                <img src={msg.generatedImage} alt="Generated" className="sai-attach-img" />
                            )}
                            {msg.content && <div className="sai-bubble-text">{msg.content}</div>}
                            {msg.sources?.length > 0 && (
                                <div className="sai-sources">
                                    <div className="sai-sources-label">📚 Sources</div>
                                    {msg.sources.map((s, i) => (
                                        <a key={i} href={s.link} target="_blank" rel="noopener noreferrer" className="sai-source-link">
                                            {s.title}
                                        </a>
                                    ))}
                                </div>
                            )}
                            {msg.searched && <span className="sai-search-badge">🔍 Web</span>}
                        </div>
                        {msg.role === 'user' && (
                            <img
                                src={user?.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user?.username}`}
                                alt="You"
                                className="sai-user-avatar"
                            />
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="sai-msg-row assistant">
                        <div className="sai-ai-avatar">🤖</div>
                        <div className="sai-bubble assistant">
                            <div className="sai-typing">
                                <span /><span /><span />
                            </div>
                        </div>
                    </div>
                )}
                {contextualAd && !isLoading && <AdPanel ad={contextualAd} onClose={() => setContextualAd(null)} onProductClick={openAdPurchase} />}
                <div ref={messagesEndRef} />
            </div>

            {buyingAd && <div className="sai-buy-overlay" role="dialog" aria-modal="true" aria-label={`Buy ${buyingAd.title}`}>
                <div className="sai-buy-sheet"><button className="sai-buy-close" onClick={() => setBuyingAd(null)}>✕</button><div className="sai-buy-heading"><span>Sponsored checkout</span><h2>{buyingAd.title}</h2></div><iframe className="sai-buy-frame" src={buyingAd.productLink} title={`Buy ${buyingAd.title}`} /><p>If the store blocks embedded checkout, open it in a new tab.</p><a href={buyingAd.productLink} target="_blank" rel="noopener noreferrer">Open secure store</a></div>
            </div>}

            {/* Input Bar */}
            <div className="sai-input-bar">
                {attachedFile && (
                    <div className="sai-attached-preview">
                        {attachedFile.type.startsWith('image/') ? (
                            <img src={attachedFile.dataUrl} alt={attachedFile.name} />
                        ) : (
                            <span>📎 {attachedFile.name}</span>
                        )}
                        <button onClick={() => setAttachedFile(null)}>✕</button>
                    </div>
                )}
                <form className="sai-input-row" onSubmit={handleSubmit}>
                    {/* + Button */}
                    <div className="sai-plus-wrap" ref={plusMenuRef}>
                        <button
                            type="button"
                            className="sai-plus-btn"
                            onClick={() => setShowPlusMenu(v => !v)}
                            title="Attach"
                        >
                            +
                        </button>
                        {showPlusMenu && (
                            <div className="sai-plus-menu">
                                <button onClick={() => { photoInputRef.current?.click(); }}>
                                    <span>📷</span> Photo
                                </button>
                                <button onClick={() => { fileInputRef.current?.click(); }}>
                                    <span>📎</span> File
                                </button>
                                <button onClick={() => { setShowImageGen(true); setShowPlusMenu(false); }}>
                                    <span>🖼️</span> Generate Image
                                </button>
                            </div>
                        )}
                    </div>

                    <input
                        className="sai-text-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask Saskat AI anything..."
                        disabled={isLoading}
                    />

                    {/* Mic Button */}
                    <button
                        type="button"
                        className={`sai-mic-btn ${isListening ? 'listening' : ''}`}
                        onClick={toggleVoice}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                    >
                        🎤
                    </button>

                    {/* Send Button */}
                    <button
                        type="submit"
                        className="sai-send-btn"
                        disabled={isLoading || (!input.trim() && !attachedFile)}
                    >
                        ➤
                    </button>
                </form>

                {/* Hidden file inputs */}
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
            </div>
        </div>
    );
};

export default SaskatAI;
