import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    XMarkIcon, TrashIcon, SparklesIcon,
    PaperAirplaneIcon, StopIcon, MicrophoneIcon,
    PhotoIcon, HeartIcon, FaceSmileIcon, PhoneIcon
} from '@heroicons/react/24/solid';
import { ArrowLeftIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';

/* ─── Canvas-based Waveform Visualizer ─── */
const WaveformVisualizer = ({ active, color }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationId;
        let phase = 0;

        const render = () => {
            if (!canvas) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const width = canvas.width;
            const height = canvas.height;
            const mid = height / 2;
            
            const waves = [
                { amplitude: active ? 22 : 3, frequency: 0.015, speed: 0.08, opacity: 0.8 },
                { amplitude: active ? 16 : 2, frequency: 0.02, speed: -0.05, opacity: 0.4 },
                { amplitude: active ? 9 : 1.5, frequency: 0.01, speed: 0.04, opacity: 0.2 }
            ];

            waves.forEach(w => {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = w.opacity;
                
                for (let x = 0; x < width; x++) {
                    const y = mid + Math.sin(x * w.frequency + phase * w.speed) * w.amplitude;
                    if (x === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            });

            phase += 1.2;
            animationId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationId);
    }, [active, color]);

    return <canvas ref={canvasRef} width={280} height={60} style={{ display: 'block', margin: '0 auto', opacity: 0.9 }} />;
};

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
const AiChat = ({ onClose, onBack, onActionCall }) => {
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

    // ─── Calling States ───
    const [isCallActive, setIsCallActive] = useState(false);
    const [isCallVideo, setIsCallVideo] = useState(false);
    const [callState, setCallState] = useState('ringing'); // ringing, connected, disconnected
    const [callDuration, setCallDuration] = useState(0);
    const [isCallMuted, setIsCallMuted] = useState(false);
    const [isCallSpeaker, setIsCallSpeaker] = useState(true);
    const [aiSpeaking, setAiSpeaking] = useState(false);
    const [userSpeaking, setUserSpeaking] = useState(false);

    // Call Refs to prevent closure stale states
    const isCallActiveRef = useRef(false);
    const callStateRef = useRef('ringing');
    const isCallMutedRef = useRef(false);
    const aiSpeakingRef = useRef(false);

    const recognitionRef = useRef(null);
    const ttsUtteranceRef = useRef(null);
    const ringtoneOscRef = useRef(null);
    const timerIntervalRef = useRef(null);

    // AI Voice & Video refs
    const shouldListenRef = useRef(false);
    const ttsAudioRef = useRef(null);
    const videoStreamRef = useRef(null);
    const videoRef = useRef(null);

    // Keep refs in sync
    useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
    useEffect(() => { callStateRef.current = callState; }, [callState]);
    useEffect(() => { isCallMutedRef.current = isCallMuted; }, [isCallMuted]);
    useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);

    // Timer interval for call duration
    useEffect(() => {
        if (isCallActive && callState === 'connected') {
            timerIntervalRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [isCallActive, callState]);

    // Load Speech Synthesis voices
    useEffect(() => {
        if (window.speechSynthesis) {
            window.speechSynthesis.getVoices();
            const handleVoices = () => {
                window.speechSynthesis.getVoices();
            };
            window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
            return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
        }
    }, []);

    // Format Duration
    const formatDuration = (sec) => {
        const mins = Math.floor(sec / 60);
        const secs = sec % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Synthesize local ringtone
    const startRingtone = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const audioCtx = new AudioCtx();
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc1.frequency.value = 440;
            osc2.frequency.value = 480;

            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const now = audioCtx.currentTime;
            gainNode.gain.setValueAtTime(0, now);
            
            const ringPulse = () => {
                if (!isCallActiveRef.current || callStateRef.current !== 'ringing') {
                    try { audioCtx.close(); } catch(e){}
                    return;
                }
                const t = audioCtx.currentTime;
                gainNode.gain.setValueAtTime(0.08, t);
                gainNode.gain.setValueAtTime(0, t + 1.2);
                setTimeout(ringPulse, 3000);
            };

            osc1.start();
            osc2.start();
            ringPulse();

            ringtoneOscRef.current = {
                stop: () => {
                    try {
                        osc1.stop();
                        osc2.stop();
                        audioCtx.close();
                    } catch(e){}
                }
            };
        } catch(e) {
            console.error("Ringtone error:", e);
        }
    };

    const pendingActionCallRef = useRef(null);

    // Start Voice Call Flow
    const startCall = () => {
        setIsCallVideo(false);
        setIsCallActive(true);
        setCallState('ringing');
        setCallDuration(0);
        setIsCallMuted(false);
        setAiSpeaking(false);
        setUserSpeaking(false);
        pendingActionCallRef.current = null;

        startRingtone();

        // Simulate pickup after 2.5 seconds
        setTimeout(() => {
            if (!isCallActiveRef.current) return;
            
            if (ringtoneOscRef.current) {
                ringtoneOscRef.current.stop();
                ringtoneOscRef.current = null;
            }

            setCallState('connected');

            // Play AI greeting
            const greeting = botInfo?.name === 'Arjun'
                ? "Haan, bolo yaar. Kya chal raha hai?"
                : "Heyy, bolo na! Kya baat karni hai aaj?";
            
            speakAiResponse(greeting);
        }, 2500);
    };

    // Start Video Call Flow
    const startVideoCall = async () => {
        setIsCallVideo(true);
        setIsCallActive(true);
        setCallState('ringing');
        setCallDuration(0);
        setIsCallMuted(false);
        setAiSpeaking(false);
        setUserSpeaking(false);
        pendingActionCallRef.current = null;

        startRingtone();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            videoStreamRef.current = stream;
        } catch (e) {
            console.error("Camera access error:", e);
        }

        // Simulate pickup after 2.5 seconds
        setTimeout(() => {
            if (!isCallActiveRef.current) return;
            
            if (ringtoneOscRef.current) {
                ringtoneOscRef.current.stop();
                ringtoneOscRef.current = null;
            }

            setCallState('connected');

            // Play AI greeting
            const greeting = botInfo?.name === 'Arjun'
                ? "Haan, bolo yaar. Main vc par aa gaya hoon. Kya chal raha hai?"
                : "Heyy, bolo na! Main vc par aa gayi hoon. Kya chal raha hai aaj? 😊";
            
            speakAiResponse(greeting);
        }, 2500);
    };

    // Effect to bind video feed
    useEffect(() => {
        if (isCallActive && isCallVideo && videoStreamRef.current && videoRef.current) {
            videoRef.current.srcObject = videoStreamRef.current;
        }
    }, [isCallActive, isCallVideo, videoStreamRef.current]);

    // Speech Recognition
    const initSpeechRecognition = () => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            console.warn("Speech recognition not supported");
            return null;
        }
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'hi-IN';

        rec.onstart = () => {
            setUserSpeaking(true);
        };

        rec.onend = () => {
            setUserSpeaking(false);
            // Auto restart listening after a brief timeout if call is active and shouldListenRef is true
            setTimeout(() => {
                if (isCallActiveRef.current && callStateRef.current === 'connected' && !isCallMutedRef.current && shouldListenRef.current) {
                    try {
                        rec.start();
                    } catch(e){}
                }
            }, 300);
        };

        rec.onerror = (e) => {
            console.error("Speech Recognition Error:", e.error);
            setUserSpeaking(false);
            // Auto restart if shouldListenRef is still true
            setTimeout(() => {
                if (isCallActiveRef.current && callStateRef.current === 'connected' && !isCallMutedRef.current && shouldListenRef.current) {
                    try {
                        rec.start();
                    } catch(e){}
                }
            }, 500);
        };

        rec.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript && transcript.trim()) {
                handleCallUserSpeech(transcript.trim());
            }
        };

        recognitionRef.current = rec;
        return rec;
    };

    const startListening = () => {
        if (isCallMutedRef.current) return;
        shouldListenRef.current = true;
        if (!recognitionRef.current) {
            initSpeechRecognition();
        }
        if (recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch(e){}
        }
    };

    const stopListening = () => {
        shouldListenRef.current = false;
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch(e){}
        }
        setUserSpeaking(false);
    };

    // Frame capture helper
    const captureFrame = () => {
        const video = videoRef.current;
        if (!video || video.paused || video.ended) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch (e) {
            console.error("Frame capture error:", e);
            return null;
        }
    };

    const handleCallUserSpeech = async (speechText) => {
        stopListening();

        let frameData = null;
        if (isCallVideo) {
            frameData = captureFrame();
        }

        const userMsg = {
            id: Date.now(),
            role: 'user',
            content: speechText,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const res = await axios.post('/api/ai/chat', {
                message: speechText,
                user_gender: userGender,
                image: frameData
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const replyText = res.data.reply;
            
            // Extract Call commands: [ACTION:CALL:name]
            const callMatch = replyText.match(/\[ACTION:CALL:(.*?)\]/);
            let cleanReplyText = replyText;
            if (callMatch) {
                cleanReplyText = replyText.replace(/\[ACTION:CALL:(.*?)\]/g, '').trim();
                pendingActionCallRef.current = callMatch[1];
            }

            const aiMsg = {
                id: Date.now() + 1,
                role: 'assistant',
                content: cleanReplyText,
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, aiMsg]);
            setLoading(false);

            speakAiResponse(cleanReplyText);
        } catch (e) {
            console.error(e);
            setLoading(false);
            speakAiResponse("Arre yaar, connection me thodi dikkat aa rahi hai. Ek baar aur bolna.");
        }
    };

    // Custom high-quality speech synthesis method
    const speakAiResponse = (text) => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current = null;
        }

        const isArjun = botInfo?.name === 'Arjun';
        const gender = isArjun ? 'male' : 'female';
        
        stopListening();
        setAiSpeaking(true);
        aiSpeakingRef.current = true;

        const audioUrl = `/api/ai/tts?text=${encodeURIComponent(text)}&gender=${gender}&t=${Date.now()}`;
        const audio = new Audio(audioUrl);
        ttsAudioRef.current = audio;

        audio.onplay = () => {
            setAiSpeaking(true);
            aiSpeakingRef.current = true;
        };

        audio.onended = () => {
            setAiSpeaking(false);
            aiSpeakingRef.current = false;
            
            // Trigger call action if pending
            if (pendingActionCallRef.current && onActionCall) {
                const target = pendingActionCallRef.current;
                pendingActionCallRef.current = null;
                endCall();
                onActionCall(target);
                return;
            }

            setTimeout(() => {
                if (isCallActiveRef.current && callStateRef.current === 'connected' && !isCallMutedRef.current) {
                    startListening();
                }
            }, 300);
        };

        audio.onerror = (e) => {
            console.warn("Custom TTS failed, falling back to Web Speech Synthesis API:", e);
            fallbackSpeakAiResponse(text);
        };

        audio.play().catch(err => {
            console.warn("Audio play failed, falling back to Web Speech Synthesis API:", err);
            fallbackSpeakAiResponse(text);
        });
    };

    // WebSpeech fallback method
    const fallbackSpeakAiResponse = (text) => {
        if (!window.speechSynthesis) return;

        window.speechSynthesis.cancel();
        const cleanText = text.replace(/[*#_`~]/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        ttsUtteranceRef.current = utterance;

        const voices = window.speechSynthesis.getVoices();
        let selectedVoice = null;
        const isArjun = botInfo?.name === 'Arjun';

        if (isArjun) {
            selectedVoice = voices.find(v => (v.lang.startsWith('hi') || v.lang.startsWith('en')) && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('google') && !v.name.toLowerCase().includes('female')));
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('hi')) || voices.find(v => v.lang.startsWith('en'));
            }
            utterance.pitch = 0.92;
            utterance.rate = 1.0;
        } else {
            selectedVoice = voices.find(v => (v.lang.startsWith('hi') || v.lang.startsWith('en')) && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('aria') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('google')));
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('hi')) || voices.find(v => v.lang.startsWith('en'));
            }
            utterance.pitch = 1.15;
            utterance.rate = 1.05;
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
        } else {
            utterance.lang = 'hi-IN';
        }

        utterance.onstart = () => {
            setAiSpeaking(true);
            aiSpeakingRef.current = true;
        };

        utterance.onend = () => {
            setAiSpeaking(false);
            aiSpeakingRef.current = false;

            // Trigger call action if pending
            if (pendingActionCallRef.current && onActionCall) {
                const target = pendingActionCallRef.current;
                pendingActionCallRef.current = null;
                endCall();
                onActionCall(target);
                return;
            }

            setTimeout(() => {
                if (isCallActiveRef.current && callStateRef.current === 'connected' && !isCallMutedRef.current) {
                    startListening();
                }
            }, 300);
        };

        utterance.onerror = () => {
            setAiSpeaking(false);
            aiSpeakingRef.current = false;

            // Trigger call action if pending
            if (pendingActionCallRef.current && onActionCall) {
                const target = pendingActionCallRef.current;
                pendingActionCallRef.current = null;
                endCall();
                onActionCall(target);
                return;
            }

            setTimeout(() => {
                if (isCallActiveRef.current && callStateRef.current === 'connected' && !isCallMutedRef.current) {
                    startListening();
                }
            }, 300);
        };

        if (!isCallSpeaker) {
            setTimeout(() => {
                setAiSpeaking(false);
                aiSpeakingRef.current = false;
                if (isCallActiveRef.current && callStateRef.current === 'connected' && !isCallMutedRef.current) {
                    startListening();
                }
            }, 2000);
        } else {
            window.speechSynthesis.speak(utterance);
        }
    };

    const endCall = () => {
        setIsCallActive(false);
        setCallState('disconnected');
        setIsCallVideo(false);

        if (ringtoneOscRef.current) {
            ringtoneOscRef.current.stop();
            ringtoneOscRef.current = null;
        }

        if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(t => t.stop());
            videoStreamRef.current = null;
        }

        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current = null;
        }

        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        stopListening();
    };

    useEffect(() => {
        return () => {
            if (ringtoneOscRef.current) ringtoneOscRef.current.stop();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, []);

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

                /* ─── Video Call Vision Container ─── */
                .ai-call-video-container {
                    position: absolute;
                    top: 80px;
                    right: 20px;
                    width: 130px;
                    height: 180px;
                    border-radius: 16px;
                    overflow: hidden;
                    border: 2px solid rgba(255,255,255,0.15);
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.45);
                    z-index: 100;
                    background: #000;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    display: flex;
                    flex-direction: column;
                }
                .ai-call-video-feed {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transform: scaleX(-1);
                }
                .ai-call-video-badge {
                    position: absolute;
                    top: 8px;
                    left: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(0,0,0,0.6);
                    padding: 4px 8px;
                    border-radius: 8px;
                    font-size: 10px;
                    color: #fff;
                    font-weight: 600;
                    z-index: 101;
                    backdrop-filter: blur(4px);
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .ai-call-video-pulse {
                    width: 6px;
                    height: 6px;
                    background: #ef4444;
                    border-radius: 50%;
                    animation: video-pulse-red 1s infinite alternate;
                }
                @keyframes video-pulse-red {
                    0% { transform: scale(0.8); opacity: 0.5; }
                    100% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 8px #ef4444; }
                }

                /* ─── Call Overlay styles ─── */
                .ai-call-overlay {
                    position: absolute;
                    inset: 0;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    background: rgba(11, 20, 26, 0.95);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    animation: fadeIn 0.3s ease;
                }
                .ai-call-bg-blur {
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at center, rgba(124,58,237,0.12) 0%, transparent 70%);
                    pointer-events: none;
                }
                .ai-call-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    padding: 40px 24px;
                    z-index: 10;
                }
                .ai-call-header {
                    text-align: center;
                    opacity: 0.7;
                }
                .ai-call-encryption {
                    font-size: 11px;
                    color: #9ca3af;
                    background: rgba(255,255,255,0.04);
                    padding: 4px 10px;
                    border-radius: 12px;
                }
                .ai-call-main {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    margin-bottom: 40px;
                }
                .ai-call-avatar-wrap {
                    position: relative;
                    width: 140px;
                    height: 140px;
                    margin-bottom: 12px;
                }
                .ai-call-avatar {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 4px solid ${isArjun ? '#60a5fa' : '#c084fc'};
                    box-shadow: 0 0 24px ${isArjun ? 'rgba(96,165,250,0.3)' : 'rgba(192,132,252,0.3)'};
                    position: relative;
                    z-index: 2;
                    object-fit: cover;
                }
                .ai-call-avatar-glow {
                    position: absolute;
                    inset: -10px;
                    border-radius: 50%;
                    background: ${isArjun ? 'rgba(96,165,250,0.15)' : 'rgba(192,132,252,0.15)'};
                    z-index: 1;
                }
                .ai-call-avatar--ringing .ai-call-avatar-glow {
                    animation: pulse-glow 1.5s infinite;
                }
                .ai-call-avatar--speaking .ai-call-avatar {
                    transform: scale(1.04);
                    border-color: #22c55e;
                    box-shadow: 0 0 32px rgba(34,197,94,0.55);
                    transition: all 0.15s ease;
                }
                @keyframes pulse-glow {
                    0% { transform: scale(0.95); opacity: 0.8; }
                    50% { transform: scale(1.2); opacity: 0.3; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                .ai-call-name {
                    font-size: 24px;
                    font-weight: 800;
                    color: #fff;
                    margin: 0;
                }
                .ai-call-status {
                    font-size: 14px;
                    color: #9ca3af;
                    margin: 0;
                    font-family: monospace;
                    letter-spacing: 0.5px;
                }
                .ai-call-waves {
                    width: 100%;
                    max-width: 300px;
                    margin-top: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                }
                .ai-call-speaker-indicator {
                    text-align: center;
                    height: 20px;
                }
                .ai-call-controls {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 28px;
                }
                .ai-call-btn {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    border: none;
                    background: rgba(255,255,255,0.07);
                    color: #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.25s;
                }
                .ai-call-btn:hover {
                    background: rgba(255,255,255,0.15);
                    color: #fff;
                    transform: translateY(-2px);
                }
                .ai-call-btn--active {
                    background: #fff;
                    color: #111b21;
                }
                .ai-call-btn--active:hover {
                    background: #e5e7eb;
                    color: #111b21;
                }
                .ai-call-btn--danger {
                    background: #ef4444;
                    color: #fff;
                    width: 64px;
                    height: 64px;
                }
                .ai-call-btn--danger:hover {
                    background: #dc2626;
                    color: #fff;
                    box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
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
                    <button onClick={startVideoCall} className="ai-icon-btn" title="Video Call AI companion" style={{ color: isArjun ? '#60a5fa' : '#c084fc', marginRight: 4 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
                            <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3V7.5a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.94-.94 2.56-.27 2.56 1.06v11.38c0 1.33-1.62 2-2.56 1.06z" />
                        </svg>
                    </button>
                    <button onClick={startCall} className="ai-icon-btn" title="Call AI companion" style={{ color: isArjun ? '#60a5fa' : '#c084fc' }}>
                        <PhoneIcon style={{ width: 18, height: 18 }} />
                    </button>
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

            {/* ─── Call Overlay Modal ─── */}
            {isCallActive && (
                <div className="ai-call-overlay">
                    <div className="ai-call-bg-blur" />
                    
                    {isCallVideo && (
                        <div className="ai-call-video-container">
                            <div className="ai-call-video-badge">
                                <span className="ai-call-video-pulse"></span>
                                AI Vision Active
                            </div>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="ai-call-video-feed"
                            />
                        </div>
                    )}
                    
                    <div className="ai-call-container">
                        <div className="ai-call-header">
                            <span className="ai-call-encryption">🔒 End-to-end encrypted</span>
                        </div>

                        <div className="ai-call-main">
                            <div className={`ai-call-avatar-wrap ${callState === 'ringing' ? 'ai-call-avatar--ringing' : ''} ${aiSpeaking ? 'ai-call-avatar--speaking' : ''}`}>
                                <img
                                    src={botInfo?.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=Aria`}
                                    alt={botInfo?.name}
                                    className="ai-call-avatar"
                                />
                                <div className="ai-call-avatar-glow" />
                            </div>

                            <h2 className="ai-call-name">{botInfo?.name || 'Aria'}</h2>
                            
                            <p className="ai-call-status">
                                {callState === 'ringing' && 'Ringing...'}
                                {callState === 'connected' && formatDuration(callDuration)}
                            </p>

                            {/* Waveforms */}
                            {callState === 'connected' && (
                                <div className="ai-call-waves">
                                    <WaveformVisualizer
                                        active={aiSpeaking || userSpeaking || loading}
                                        color={botInfo?.name === 'Arjun' ? '#60a5fa' : '#c084fc'}
                                    />
                                    <div className="ai-call-speaker-indicator">
                                        {loading ? (
                                            <span className="text-white/40 text-[12px] animate-pulse">Thinking...</span>
                                        ) : aiSpeaking ? (
                                            <span className="text-white/70 text-[12px]">Speaking...</span>
                                        ) : userSpeaking ? (
                                            <span className="text-emerald-400 text-[12px] font-semibold">Listening...</span>
                                        ) : (
                                            <span className="text-white/30 text-[12px]">Say something...</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="ai-call-controls">
                            <button
                                onClick={() => {
                                    const next = !isCallMuted;
                                    setIsCallMuted(next);
                                    if (next) stopListening();
                                    else if (callState === 'connected' && !aiSpeaking) startListening();
                                }}
                                className={`ai-call-btn ${isCallMuted ? 'ai-call-btn--active' : ''}`}
                                title={isCallMuted ? "Unmute Mic" : "Mute Mic"}
                            >
                                {isCallMuted ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.063.922-2.063 2.063v4.875c0 1.141.922 2.062 2.063 2.062h1.932l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path d="M10.94 2.1c-.945-.945-2.56-.276-2.56 1.06v17.68c0 1.336 1.616 2.005 2.56 1.06l4.875-4.875a.75.75 0 00-.53-1.28H10.5V6.15h.775a.75.75 0 00.53-1.28L10.94 2.1z" />
                                        <path d="M18.27 12a6.25 6.25 0 01-1.83 4.42.75.75 0 101.06 1.06 7.75 7.75 0 000-10.96.75.75 0 10-1.06 1.06A6.25 6.25 0 0118.27 12z" />
                                    </svg>
                                )}
                            </button>

                            <button
                                onClick={endCall}
                                className="ai-call-btn ai-call-btn--danger"
                                title="End Call"
                            >
                                <PhoneIcon className="w-6 h-6 rotate-[135deg]" />
                            </button>

                            <button
                                onClick={() => {
                                    const next = !isCallSpeaker;
                                    setIsCallSpeaker(next);
                                    if (!next && window.speechSynthesis) {
                                        window.speechSynthesis.cancel();
                                    }
                                }}
                                className={`ai-call-btn ${!isCallSpeaker ? 'ai-call-btn--active' : ''}`}
                                title={isCallSpeaker ? "Disable Speaker" : "Enable Speaker"}
                            >
                                {isCallSpeaker ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827 0-4.363-3.553-7.896-7.896-7.896s-7.896 3.533-7.896 7.896c0 3.847 2.019 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AiChat;
