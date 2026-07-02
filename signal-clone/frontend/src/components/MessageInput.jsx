import React, { useRef, useState } from 'react';
import { 
    PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, MicrophoneIcon, 
    StopIcon, XMarkIcon, ChartBarIcon, MapPinIcon, DocumentIcon,
    MusicalNoteIcon, PhotoIcon, CameraIcon, UserCircleIcon, PlayIcon
} from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import EmojiPicker from 'emoji-picker-react';

const LANGUAGES = [
    { code: 'hi', name: 'Hindi (हिंदी)' },
    { code: 'en', name: 'English' },
    { code: 'bn', name: 'Bengali (বাংলা)' },
    { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'mr', name: 'Marathi (मराठी)' },
    { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
    { code: 'ta', name: 'Tamil (தமிழ்)' },
    { code: 'te', name: 'Telugu (తెలుగు)' },
    { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
    { code: 'ml', name: 'Malayalam (മലയാളം)' },
    { code: 'ur', name: 'Urdu (اردو)' },
    { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
    { code: 'as', name: 'Assamese (অসমীয়া)' },
    { code: 'sa', name: 'Sanskrit (संस्कृतम्)' },
    { code: 'ne', name: 'Nepali (नेपाली)' },
    { code: 'mai', name: 'Maithili (मैथिली)' },
    { code: 'sd', name: 'Sindhi (سنڌي)' },
    { code: 'kok', name: 'Konkani (कोंकणी)' },
    { code: 'ks', name: 'Kashmiri (کأشُر)' },
    { code: 'mni', name: 'Manipuri (মণিপুরী)' },
    { code: 'doi', name: 'Dogri (डोगरी)' },
    { code: 'brx', name: 'Bodo (बड़ो)' },
    { code: 'sat', name: 'Santali (সাঁওতালী)' },
    { code: 'es', name: 'Spanish (Español)' },
    { code: 'fr', name: 'French (Français)' },
    { code: 'de', name: 'German (Deutsch)' },
    { code: 'ar', name: 'Arabic (العربية)' },
    { code: 'zh-CN', name: 'Chinese (中文)' },
    { code: 'ja', name: 'Japanese (日本語)' },
    { code: 'ru', name: 'Russian (Русский)' },
    { code: 'pt', name: 'Portuguese (Português)' }
];

const GlobeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-.778.099-1.533.284-2.253" />
    </svg>
);

const STICKERS = [
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker1',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker2',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker3',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker4',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker5',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker6',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker7',
    'https://api.dicebear.com/7.x/fun-emoji/svg?seed=sticker8',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=sticker9',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=sticker10',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=sticker11',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=sticker12',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=sticker13',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=sticker14',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=sticker15',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=sticker16',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=sticker17',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=sticker18',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=sticker19',
    'https://api.dicebear.com/7.x/lorelei/svg?seed=sticker20',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=sticker21',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=sticker22',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=sticker23',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=sticker24',
    'https://api.dicebear.com/7.x/bottts/svg?seed=sticker25',
    'https://api.dicebear.com/7.x/bottts/svg?seed=sticker26',
    'https://api.dicebear.com/7.x/bottts/svg?seed=sticker27',
    'https://api.dicebear.com/7.x/bottts/svg?seed=sticker28'
];

const MessageInput = ({ 
    onSend, onUpload, onStartLiveLocation, replyTo, onCancelReply, 
    onTranslate, chatId, chatTranslationLang, onChangeTranslationLang,
    onTyping,
    disappearingTtl = 0,
    disabled = false, placeholderOverride = "",
    lastMessageText = "",
    showAiFeature = false,
    showSmartReplies = false,
    currentUserId
}) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [pickerTab, setPickerTab] = useState('emoji');
    const [gifSearch, setGifSearch] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loadingGifs, setLoadingGifs] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [pollData, setPollData] = useState({ question: '', options: ['', ''] });
    const [smartReplies, setSmartReplies] = useState([]);

    const [showCameraModal, setShowCameraModal] = useState(false);
    const [showGameCreator, setShowGameCreator] = useState(false);
    const [gameType, setGameType] = useState('Tic-Tac-Toe');
    const [gameMode, setGameMode] = useState('vs-friend');
    const [gameTargetWins, setGameTargetWins] = useState(3);

    React.useEffect(() => {
        if (!showSmartReplies || !lastMessageText) {
            setSmartReplies([]);
            return;
        }
        const textLower = lastMessageText.toLowerCase();
        let replies = [];
        if (textLower.includes('hello') || textLower.includes('hi') || textLower.includes('hey') || textLower.includes('kasa kai') || textLower.includes('namaste')) {
            replies = ["Hello! 👋", "Hi, how are you?", "Hey there! 😊"];
        } else if (textLower.includes('how are you') || textLower.includes('how r u') || textLower.includes('kya hal') || textLower.includes('kaisa hai')) {
            replies = ["I'm doing great, thanks!", "All good here! 👍", "Doing well, what about you?"];
        } else if (textLower.includes('where') || textLower.includes('location') || textLower.includes('kahan')) {
            replies = ["I'm at home.", "On my way! 🚗", "Let me share my location..."];
        } else if (textLower.includes('game') || textLower.includes('play') || textLower.includes('khelein')) {
            replies = ["Let's play Tic-Tac-Toe! 🎮", "Sure, start the game!", "Maybe later."];
        } else if (textLower.includes('upi') || textLower.includes('pay') || textLower.includes('money') || textLower.includes('payment')) {
            replies = ["Sending UPI payment now...", "How much do you need?", "Let me check my balance."];
        } else {
            replies = ["Awesome! 👍", "Okay, got it.", "Sounds good!"];
        }
        setSmartReplies(replies);
    }, [lastMessageText, showSmartReplies]);

    const handleGrammarFix = () => {
        if (!text.trim()) return;
        let t = text.trim();
        t = t.charAt(0).toUpperCase() + t.slice(1);
        const rules = [
            { regex: /\bi\b/g, replacement: 'I' },
            { regex: /\bdont\b/gi, replacement: "don't" },
            { regex: /\bcant\b/gi, replacement: "can't" },
            { regex: /\bwont\b/gi, replacement: "won't" },
            { regex: /\bpls\b/gi, replacement: "please" },
            { regex: /\bplz\b/gi, replacement: "please" },
            { regex: /\bu\b/gi, replacement: "you" },
            { regex: /\br\b/gi, replacement: "are" },
            { regex: /\by\b/gi, replacement: "why" },
            { regex: /\bomg\b/gi, replacement: "Oh my God" },
            { regex: /\bthx\b/gi, replacement: "thanks" },
            { regex: /\btanks\b/gi, replacement: "thanks" },
            { regex: /\bsry\b/gi, replacement: "sorry" },
            { regex: /\btomorrow\b/gi, replacement: "tomorrow" },
            { regex: /\bhow r u\b/gi, replacement: "how are you" },
            { regex: /\bhow are u\b/gi, replacement: "how are you" },
        ];
        rules.forEach(rule => {
            t = t.replace(rule.regex, rule.replacement);
        });
        if (!/[.!?]$/.test(t)) {
            t += '.';
        }
        setText(t);
        inputRef.current?.focus();
    };
    
    const showTranslator = chatTranslationLang !== '';
    const targetLang = chatTranslationLang || 'hi';
    const [isTranslating, setIsTranslating] = useState(false);

    const toggleTranslator = () => {
        if (showTranslator) {
            localStorage.removeItem(`chat_translation_lang_${chatId}`);
            onChangeTranslationLang('');
        } else {
            const defaultLang = localStorage.getItem('preferred_translation_language') || 'hi';
            localStorage.setItem(`chat_translation_lang_${chatId}`, defaultLang);
            onChangeTranslationLang(defaultLang);
        }
    };

    const handleTargetLangChange = (val) => {
        localStorage.setItem(`chat_translation_lang_${chatId}`, val);
        localStorage.setItem('preferred_translation_language', val);
        onChangeTranslationLang(val);
    };
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const inputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const documentInputRef = useRef(null);
    const audioInputRef = useRef(null);
    const gifInputRef = useRef(null);
    const typingTimerRef = useRef(null);

    const attachMenuRef = useRef(null);
    const emojiPickerRef = useRef(null);
    const videoRef = useRef(null);

    React.useEffect(() => {
        return () => clearTimeout(typingTimerRef.current);
    }, []);

    React.useEffect(() => {
        if (pickerTab === 'gif' && gifs.length === 0) {
            setLoadingGifs(true);
            fetch(`/api/gifs?q=trending`)
                .then(res => res.json())
                .then(data => { setGifs(data.gifs || []); setLoadingGifs(false); })
                .catch(() => { setGifs([]); setLoadingGifs(false); });
        }
    }, [pickerTab, gifs.length]);

    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (showAttachMenu && attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
                const attachBtn = document.getElementById('attach-btn');
                if (!attachBtn || !attachBtn.contains(e.target)) {
                    setShowAttachMenu(false);
                }
            }
            if (showEmoji && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
                const emojiBtn = document.getElementById('emoji-btn');
                if (!emojiBtn || !emojiBtn.contains(e.target)) {
                    setShowEmoji(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAttachMenu, showEmoji]);

    React.useEffect(() => {
        let stream = null;
        if (showCameraModal) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
                .then(s => {
                    stream = s;
                    if (videoRef.current) videoRef.current.srcObject = s;
                })
                .catch(err => {
                    console.error("Camera access error:", err);
                    alert("Could not access camera. Please check permissions.");
                    setShowCameraModal(false);
                });
        }
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [showCameraModal]);

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `camera-${Date.now()}.png`, { type: 'image/png' });
                onUpload(file);
                setShowCameraModal(false);
            }
        }, 'image/png');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;

        let finalWord = trimmed;
        if (showTranslator && onTranslate) {
            setIsTranslating(true);
            try {
                const translated = await onTranslate(trimmed, targetLang);
                if (translated) {
                    finalWord = translated;
                }
            } catch (err) {
                console.error("Auto translate error on send", err);
            } finally {
                setIsTranslating(false);
            }
        }
        onSend(finalWord, 'text', disappearingTtl);
        setText('');
        setShowEmoji(false);
        onTyping?.(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleEmojiClick = (emojiData) => {
        setText(prev => prev + emojiData.emoji);
        inputRef.current?.focus();
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        if (files.length > 15) {
            alert('You can only select up to 15 files at once.');
            return;
        }
        files.forEach(file => onUpload(file));
        e.target.value = '';
        setShowAttachMenu(false);
    };

    const handleShareLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return;
        }
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            onSend(JSON.stringify({ lat: latitude, lng: longitude }), 'location', disappearingTtl);
            setShowAttachMenu(false);
        }, () => {
            alert("Unable to retrieve your location");
        });
    };

    const handleCreatePoll = () => {
        if (!pollData.question.trim() || pollData.options.some(opt => !opt.trim())) {
            alert("Please fill in the question and all options");
            return;
        }
        onSend(JSON.stringify(pollData), 'poll', disappearingTtl);
        setShowPollCreator(false);
        setPollData({ question: '', options: ['', ''] });
        setShowAttachMenu(false);
    };

    const sendContactCard = async () => {
        if (navigator.contacts && navigator.contacts.select) {
            try {
                const props = ['name', 'tel'];
                const contacts = await navigator.contacts.select(props, { multiple: false });
                if (contacts && contacts.length > 0) {
                    const contact = contacts[0];
                    const name = contact.name && contact.name[0] ? contact.name[0] : 'Unknown';
                    const phone = contact.tel && contact.tel[0] ? contact.tel[0] : '';
                    onSend(JSON.stringify({ name, phone }), 'contact', disappearingTtl);
                    setShowAttachMenu(false);
                }
            } catch (err) {
                console.error("Native contact picker error, falling back:", err);
                fallbackContactPrompt();
            }
        } else {
            fallbackContactPrompt();
        }
    };

    const fallbackContactPrompt = () => {
        const name = prompt('Contact name:');
        if (!name) return;
        const phone = prompt('Phone number:') || '';
        onSend(JSON.stringify({ name, phone }), 'contact', disappearingTtl);
        setShowAttachMenu(false);
    };

    const handleSendGame = (type, mode, targetWins) => {
        if (type === 'Indiasearch Games') {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            const payload = {
                game: 'Indiasearch Games',
                mode: 'vs-friend',
                gameCode: code
            };
            onSend(JSON.stringify(payload), 'game', 0);
        } else {
            if (mode === 'vs-computer') {
                onSend('Tic-Tac-Toe', 'game', 0);
            } else {
                const code = `TTT-${Math.floor(100000 + Math.random() * 900000)}`;
                const payload = {
                    game: 'Tic-Tac-Toe',
                    mode: 'vs-friend',
                    target: parseInt(targetWins) || 3,
                    gameCode: code,
                    creatorId: currentUserId
                };
                onSend(JSON.stringify(payload), 'game', 0);
            }
        }
        setShowGameCreator(false);
        setShowAttachMenu(false);
    };

    const sendUPIPayment = () => {
        const amount = prompt("Enter amount to transfer (₹):");
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            if (amount) alert("Please enter a valid transfer amount.");
            return;
        }
        const remarks = prompt("Enter remarks (optional):") || "";
        const payload = {
            amount: parseFloat(amount),
            remarks,
            status: 'Completed',
            transactionId: 'TXN' + Math.floor(Math.random() * 100000000000)
        };
        onSend(JSON.stringify(payload), 'payment', disappearingTtl);
        setShowAttachMenu(false);
    };

    const sendSticker = (sticker) => {
        onSend(sticker, 'sticker', disappearingTtl);
        setShowEmoji(false);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
                const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
                stream.getTracks().forEach(t => t.stop());
                if (blob.size > 0) onUpload(file);
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch {
            alert('Microphone permission needed.');
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    const handleTranslateText = async () => {
        if (!text.trim() || !onTranslate) return;
        setIsTranslating(true);
        try {
            const translated = await onTranslate(text.trim(), targetLang);
            if (translated) {
                setText(translated);
                localStorage.setItem('preferred_translation_language', targetLang);
            }
        } catch (err) {
            console.error("Translation error:", err);
            alert("Translation failed. Please try again.");
        } finally {
            setIsTranslating(false);
        }
    };

    return (
        <div className="relative bg-[#202c33] border-t border-gray-800 font-sans">
            {/* AI Smart Replies */}
            {smartReplies.length > 0 && (
                <div className="flex gap-2 px-4 py-2 bg-[#1f2c34] overflow-x-auto scrollbar-none border-b border-gray-800 flex-wrap items-center animate-slide-up">
                    <span className="text-[10px] bg-[#00a884]/20 text-[#00a884] px-2 py-0.5 rounded-full font-bold uppercase shrink-0">Smart Replies</span>
                    {smartReplies.map((reply, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => {
                                onSend(reply, 'text', disappearingTtl);
                                setSmartReplies([]);
                            }}
                            className="bg-[#2a3942] hover:bg-[#374248] text-xs text-white px-3 py-1 rounded-full border border-gray-700 transition active:scale-95 whitespace-nowrap"
                        >
                            {reply}
                        </button>
                    ))}
                </div>
            )}

            {/* Poll Creator Modal */}
            {showPollCreator && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-[#2a3942] w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white font-bold text-lg">Create Poll</h3>
                            <button onClick={() => setShowPollCreator(false)}><XMarkIcon className="w-6 h-6 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <input 
                                placeholder="Question" 
                                value={pollData.question}
                                onChange={e => setPollData({...pollData, question: e.target.value})}
                                className="w-full bg-[#111b21] text-white p-3 rounded-lg outline-none border border-gray-700 focus:border-signal-accent"
                            />
                            {pollData.options.map((opt, i) => (
                                <input 
                                    key={i}
                                    placeholder={`Option ${i+1}`}
                                    value={opt}
                                    onChange={e => {
                                        const newOpts = [...pollData.options];
                                        newOpts[i] = e.target.value;
                                        setPollData({...pollData, options: newOpts});
                                    }}
                                    className="w-full bg-[#111b21] text-white p-3 rounded-lg outline-none border border-gray-700"
                                />
                            ))}
                            {pollData.options.length < 5 && (
                                <button 
                                    onClick={() => setPollData({...pollData, options: [...pollData.options, '']})}
                                    className="text-signal-accent text-sm font-bold"
                                >
                                    + Add Option
                                </button>
                            )}
                            <button 
                                onClick={handleCreatePoll}
                                className="w-full bg-signal-accent text-white py-3 rounded-xl font-bold mt-2"
                            >
                                Send Poll
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reply Preview Bar */}
            {replyTo && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#2a3942] border-b border-gray-700 animate-slide-up">
                    <ArrowUturnLeftIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-blue-400 font-semibold truncate">{replyTo.senderName || 'Message'}</p>
                        <p className="text-xs text-gray-400 truncate italic">
                            {replyTo.type && replyTo.type !== 'text' ? `📎 ${replyTo.type}` : replyTo.content}
                        </p>
                    </div>
                    <button onClick={onCancelReply} className="text-gray-400 hover:text-white flex-shrink-0">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Translation Bar */}
            {showTranslator && (
                <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#2a3942] border-b border-gray-700 animate-slide-up">
                    <div className="flex items-center gap-2">
                        <GlobeIcon className="w-4 h-4 text-signal-accent" />
                        <span className="text-xs text-gray-300 font-medium">Translate to:</span>
                        <select
                            value={targetLang}
                            onChange={(e) => handleTargetLangChange(e.target.value)}
                            className="bg-[#111b21] text-xs text-white px-2 py-1 rounded-md border border-gray-600 outline-none focus:border-signal-accent cursor-pointer font-sans"
                        >
                            {LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleTranslateText}
                            disabled={isTranslating || !text.trim()}
                            className={`text-xs px-3 py-1 rounded-md font-bold text-white transition-all shadow-md ${
                                isTranslating || !text.trim()
                                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                                    : 'bg-signal-accent hover:bg-signal-accentHover active:scale-95'
                            }`}
                        >
                            {isTranslating ? 'Translating...' : 'Translate Input'}
                        </button>
                        <button
                            type="button"
                            onClick={toggleTranslator}
                            className="text-gray-400 hover:text-white"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Emoji / GIF / Sticker Picker */}
            {showEmoji && (
                <div ref={emojiPickerRef} className="absolute bottom-full left-0 z-50 flex flex-col gap-2 rounded-2xl bg-[#202c33] p-3 shadow-2xl w-[350px] mb-1 border border-white/10">
                    {/* Tab Header */}
                    <div className="flex bg-black/20 rounded-lg p-0.5 text-xs text-gray-300">
                        {['emoji', 'gif', 'sticker'].map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setPickerTab(tab)}
                                className={`flex-1 py-1.5 rounded-md font-bold uppercase tracking-wider transition-all ${
                                    pickerTab === tab 
                                        ? 'bg-[#00a884] text-white shadow' 
                                        : 'hover:text-white'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="h-[380px] overflow-hidden flex flex-col">
                        {pickerTab === 'emoji' && (
                            <EmojiPicker
                                onEmojiClick={handleEmojiClick}
                                theme="dark"
                                height="100%"
                                width="100%"
                                searchDisabled={false}
                                searchPlaceholder="Search emoji..."
                                skinTonesDisabled
                                previewConfig={{ showPreview: false }}
                            />
                        )}

                        {pickerTab === 'gif' && (
                            <div className="flex flex-col h-full gap-2 font-sans text-xs overflow-hidden pt-1">
                                <div className="flex px-1 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Search GIFs..."
                                        value={gifSearch}
                                        onChange={(e) => setGifSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                setLoadingGifs(true);
                                                fetch(`/api/gifs?q=${encodeURIComponent(gifSearch)}`)
                                                    .then(res => res.json())
                                                    .then(data => { setGifs(data.gifs || []); setLoadingGifs(false); })
                                                    .catch(() => { setGifs([]); setLoadingGifs(false); });
                                            }
                                        }}
                                        className="w-full bg-[#111b21] border border-white/10 rounded-md px-2 py-1 text-white outline-none focus:border-[#00a884]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLoadingGifs(true);
                                            fetch(`/api/gifs?q=${encodeURIComponent(gifSearch || 'trending')}`)
                                                .then(res => res.json())
                                                .then(data => { setGifs(data.gifs || []); setLoadingGifs(false); })
                                                .catch(() => { setGifs([]); setLoadingGifs(false); });
                                        }}
                                        className="bg-[#00a884] text-white px-3 py-1 rounded-md font-bold hover:bg-[#008f72]"
                                    >
                                        Search
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1 scrollbar-thin px-1 pb-1">
                                    {loadingGifs ? (
                                        <div className="col-span-2 text-center py-4 text-gray-400">Loading GIFs...</div>
                                    ) : gifs.map((url, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => {
                                                onSend(url, 'gif', disappearingTtl);
                                                setShowEmoji(false);
                                            }}
                                            className="rounded-xl overflow-hidden hover:opacity-80 transition-opacity bg-black/20 h-24"
                                        >
                                            <img src={url} alt={`gif-${i}`} className="w-full h-full object-cover" loading="lazy" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {pickerTab === 'sticker' && (
                            <div className="flex flex-col h-full gap-2 font-sans text-xs overflow-y-auto pt-1">
                                <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Dicebear Stickers</p>
                                <div className="grid grid-cols-4 gap-2 scrollbar-thin">
                                    {STICKERS.map((url, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => {
                                                onSend(url, 'sticker', disappearingTtl);
                                                setShowEmoji(false);
                                            }}
                                            className="rounded-xl bg-white/5 p-2 hover:bg-white/10 transition-colors flex items-center justify-center"
                                        >
                                            <img src={url} alt={`sticker-${i}`} className="w-12 h-12 object-contain" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Attachment Menu */}
            {showAttachMenu && (
                <div ref={attachMenuRef} className="absolute bottom-full left-2 sm:left-10 mb-3 z-50 w-[calc(100vw-1rem)] max-w-sm rounded-3xl bg-[#233138] p-3 shadow-2xl border border-white/10 animate-slide-up">
                    <div className="grid grid-cols-4 gap-2">
                        <AttachOption
                            label="Gallery"
                            color="bg-fuchsia-600"
                            icon={<PhotoIcon className="w-6 h-6 text-white" />}
                            onClick={() => galleryInputRef.current?.click()}
                        />
                        <AttachOption
                            label="Camera"
                            color="bg-rose-500"
                            icon={<CameraIcon className="w-6 h-6 text-white" />}
                            onClick={() => setShowCameraModal(true)}
                        />
                        <AttachOption
                            label="Document"
                            color="bg-indigo-500"
                            icon={<DocumentIcon className="w-6 h-6 text-white" />}
                            onClick={() => documentInputRef.current?.click()}
                        />
                        <AttachOption
                            label="Audio"
                            color="bg-orange-500"
                            icon={<MusicalNoteIcon className="w-6 h-6 text-white" />}
                            onClick={() => audioInputRef.current?.click()}
                        />
                        <AttachOption
                            label="Live"
                            color="bg-red-500"
                            icon={<MapPinIcon className="w-6 h-6 text-white" />}
                            onClick={() => { onStartLiveLocation(); setShowAttachMenu(false); }}
                        />
                        <AttachOption
                            label="Poll"
                            color="bg-yellow-500"
                            icon={<ChartBarIcon className="w-6 h-6 text-white" />}
                            onClick={() => setShowPollCreator(true)}
                        />
                        <AttachOption
                            label="Contact"
                            color="bg-cyan-500"
                            icon={<UserCircleIcon className="w-6 h-6 text-white" />}
                            onClick={sendContactCard}
                        />
                        <AttachOption
                            label="Game 🎮"
                            color="bg-violet-500"
                            icon={<ChartBarIcon className="w-6 h-6 text-white" />}
                            onClick={() => setShowGameCreator(true)}
                        />
                        <AttachOption
                            label="UPI Pay"
                            color="bg-emerald-600"
                            icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5m-18 0A1.5 1.5 0 0 1 3.5 3h17a1.5 1.5 0 0 1 1.5 1.5m-18.5 0v11.25A2.25 2.25 0 0 0 3.75 18h15A2.25 2.25 0 0 0 21 15.75V4.5m-18.5 0v11.25" /></svg>}
                            onClick={sendUPIPayment}
                        />
                    </div>
                </div>
            )}


            {showCameraModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 animate-fade-in">
                    <div className="w-full max-w-md rounded-3xl bg-[#202c33] p-4 border border-white/10 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-md font-bold text-white">📸 Take a Photo</h3>
                            <button 
                                onClick={() => setShowCameraModal(false)}
                                className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    cameraInputRef.current?.click();
                                    setShowCameraModal(false);
                                }}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/80 hover:bg-white/5 font-bold text-xs"
                            >
                                Upload File
                            </button>
                            <button
                                onClick={capturePhoto}
                                className="flex-1 py-2.5 rounded-xl bg-[#00a884] text-white hover:bg-[#008f72] font-bold text-xs shadow-md"
                            >
                                📸 Capture & Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showGameCreator && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 animate-fade-in">
                    <div className="w-full max-w-sm rounded-3xl bg-[#202c33] p-5 border border-white/10 shadow-2xl space-y-4 text-white">
                        <div className="flex items-center justify-between">
                            <h3 className="text-md font-bold flex items-center gap-1.5 font-sans">🎮 Create Game</h3>
                            <button 
                                onClick={() => setShowGameCreator(false)}
                                className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="space-y-3 font-sans">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-gray-400">Select Game</label>
                                <select 
                                    value={gameType} 
                                    onChange={(e) => setGameType(e.target.value)}
                                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
                                >
                                    <option value="Tic-Tac-Toe">Tic-Tac-Toe</option>
                                    <option value="Indiasearch Games">Indiasearch Games</option>
                                </select>
                            </div>

                            {gameType === 'Tic-Tac-Toe' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-gray-400">Game Mode</label>
                                        <select 
                                            value={gameMode} 
                                            onChange={(e) => setGameMode(e.target.value)}
                                            className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
                                        >
                                            <option value="vs-friend">👥 vs Friend (Real-Time Multiplayer)</option>
                                            <option value="vs-computer">🤖 vs Computer</option>
                                        </select>
                                    </div>

                                    {gameMode === 'vs-friend' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-gray-400 font-sans">Target Wins (Rounds)</label>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                max="10" 
                                                value={gameTargetWins} 
                                                onChange={(e) => setGameTargetWins(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <button
                            onClick={() => handleSendGame(gameType, gameMode, gameTargetWins)}
                            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md transition-colors"
                        >
                            🚀 Send Game Invitation
                        </button>
                    </div>
                </div>
            )}

            {/* ─── WhatsApp-style Input Row ─── */}
            <div className="flex items-end gap-2 px-2 py-2">

                {/* Left icons: Attach + Translate + AI (emoji moved inside chatbox) */}
                {!isRecording && !disabled && (
                    <div className="flex items-center gap-0.5 flex-shrink-0 pb-1">
                        {/* Attach */}
                        <button
                            id="attach-btn"
                            type="button"
                            onClick={() => { setShowAttachMenu(v => !v); setShowEmoji(false); }}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90 ${showAttachMenu ? 'text-[#00a884] rotate-45' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                            title="Attachments"
                        >
                            <PaperClipIcon className="w-6 h-6" />
                        </button>

                        {/* Translate */}
                        <button
                            type="button"
                            onClick={() => { toggleTranslator(); setShowEmoji(false); setShowAttachMenu(false); }}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90 ${showTranslator ? 'text-[#00a884]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                            title="Translate"
                        >
                            <GlobeIcon className="w-6 h-6" />
                        </button>

                        {/* AI Grammar Fix */}
                        {showAiFeature && (
                            <button
                                type="button"
                                onClick={handleGrammarFix}
                                disabled={!text.trim()}
                                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90 ${text.trim() ? 'text-violet-400 hover:text-violet-300 hover:bg-violet-400/10' : 'text-gray-600 cursor-not-allowed'}`}
                                title="AI Grammar Fix"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3.091 15.091l5.096-.813L9 9.187l.813 5.091 5.096.813-5.096.813zM19.071 4.929l-.312 1.948-1.948.312 1.948.312.312 1.948.312-1.948 1.948-.312-1.948-.312-.312-1.948zM19.071 19.071l-.312 1.948-1.948.312 1.948.312.312 1.948.312-1.948 1.948-.312-1.948-.312-.312-1.948z" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}

                {/* Hidden file inputs */}
                <input ref={galleryInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="image/*,video/*" />
                <input ref={cameraInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,video/*" capture="environment" />
                <input ref={documentInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="*/*" />
                <input ref={audioInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="audio/*" />

                {/* Textarea + Emoji (inside) + Send/Mic */}
                <form onSubmit={handleSubmit} className="flex-1 flex items-end gap-2">
                    {disabled ? (
                        <div className="flex-1 flex items-center bg-[#1c2429]/50 border border-gray-800 rounded-3xl px-4 py-3 text-center justify-center">
                            <span className="text-gray-500 text-sm font-medium select-none">{placeholderOverride || "Only admins can send messages in this group"}</span>
                        </div>
                    ) : isRecording ? (
                        <div className="flex-1 flex items-center gap-3 bg-[#2a3942] rounded-3xl px-4 py-3">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-red-400 text-sm font-medium">Recording voice message...</span>
                        </div>
                    ) : (
                        <div className="relative flex-1">
                            <textarea
                                ref={inputRef}
                                value={text}
                                onChange={e => {
                                    setText(e.target.value);
                                    onTyping?.(e.target.value.length > 0);
                                    clearTimeout(typingTimerRef.current);
                                    typingTimerRef.current = setTimeout(() => onTyping?.(false), 1400);
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                rows={1}
                                className="w-full bg-[#2a3942] text-gray-100 placeholder-gray-500 rounded-3xl pl-4 pr-12 py-3 text-[15px] focus:outline-none resize-none max-h-32 overflow-y-auto leading-relaxed"
                                style={{ scrollbarWidth: 'none' }}
                                onClick={() => { setShowEmoji(false); setShowAttachMenu(false); }}
                                onBlur={() => onTyping?.(false)}
                            />
                            {/* Emoji button — RIGHT INSIDE chatbox, vertically centered */}
                            <button
                                id="emoji-btn"
                                type="button"
                                onClick={() => { setShowEmoji(v => !v); setShowAttachMenu(false); }}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 ${showEmoji ? 'text-[#00a884]' : 'text-gray-400 hover:text-[#00a884]'}`}
                                title="Emoji / GIF / Sticker"
                            >
                                <FaceSmileIcon className="w-6 h-6" />
                            </button>
                        </div>
                    )}


                    {/* Send / Mic button */}
                    {text.trim() ? (
                        <button
                            type="submit"
                            className="w-11 h-11 bg-signal-accent hover:bg-signal-accentHover rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg"
                        >
                            <PaperAirplaneIcon className="w-5 h-5 text-white" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-signal-accent hover:bg-signal-accentHover'}`}
                        >
                            {isRecording
                                ? <StopIcon className="w-5 h-5 text-white" />
                                : <MicrophoneIcon className="w-5 h-5 text-white" />
                            }
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};





const AttachOption = ({ label, color, icon, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1.5 py-2 hover:bg-white/5 active:scale-95 transition"
    >
        <span className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center shadow-lg`}>
            {icon}
        </span>
        <span className="text-[11px] leading-tight text-gray-200 truncate max-w-full">{label}</span>
    </button>
);

export default MessageInput;
