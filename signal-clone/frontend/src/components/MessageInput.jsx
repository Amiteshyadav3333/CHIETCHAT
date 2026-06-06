import React, { useRef, useState } from 'react';
import { 
    PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, MicrophoneIcon, 
    StopIcon, XMarkIcon, ChartBarIcon, MapPinIcon, DocumentIcon,
    MusicalNoteIcon, PhotoIcon, CameraIcon, UserCircleIcon
} from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import EmojiPicker from 'emoji-picker-react';

const LANGUAGES = [
    { code: 'hi', name: 'Hindi (हिंदी)' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish (Español)' },
    { code: 'fr', name: 'French (Français)' },
    { code: 'de', name: 'German (Deutsch)' },
    { code: 'ar', name: 'Arabic (العربية)' },
    { code: 'zh-CN', name: 'Chinese (中文)' },
    { code: 'ja', name: 'Japanese (日本語)' },
    { code: 'ru', name: 'Russian (Русский)' },
    { code: 'pt', name: 'Portuguese (Português)' },
    { code: 'bn', name: 'Bengali (বাংলা)' },
    { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'mr', name: 'Marathi (मराठी)' },
    { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
    { code: 'ta', name: 'Tamil (தமிழ்)' },
    { code: 'te', name: 'Telugu (తెలుగు)' },
    { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
    { code: 'ml', name: 'Malayalam (മലയാളം)' }
];

const GlobeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-.778.099-1.533.284-2.253" />
    </svg>
);

const MessageInput = ({ 
    onSend, onUpload, onStartLiveLocation, replyTo, onCancelReply, 
    onTranslate, chatId, chatTranslationLang, onChangeTranslationLang,
    onTyping,
    disappearingTtl = 0,
    disabled = false, placeholderOverride = ""
}) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [pollData, setPollData] = useState({ question: '', options: ['', ''] });
    
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
    const fileInputRef = useRef(null);
    const typingTimerRef = useRef(null);

    React.useEffect(() => {
        return () => clearTimeout(typingTimerRef.current);
    }, []);


    const openFilePicker = (accept) => {
        if (!fileInputRef.current) return;
        fileInputRef.current.accept = accept;
        fileInputRef.current.click();
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

    const sendContactCard = () => {
        const name = prompt('Contact name');
        if (!name) return;
        const phone = prompt('Phone number') || '';
        onSend(JSON.stringify({ name, phone }), 'contact', disappearingTtl);
        setShowAttachMenu(false);
    };

    const sendMiniGame = () => {
        onSend('Tap Race', 'game', 0);
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
        <div className="relative bg-[#202c33] border-t border-gray-800">
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

            {/* Emoji Picker */}
            {showEmoji && (
                <div className="absolute bottom-full left-0 z-50 flex gap-2 rounded-2xl bg-[#202c33] p-2 shadow-2xl">
                    <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        theme="dark"
                        height={380}
                        width={320}
                        searchDisabled={false}
                        skinTonesDisabled
                        previewConfig={{ showPreview: false }}
                    />
                    <div className="hidden w-24 flex-col gap-2 sm:flex">
                        <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Stickers</p>
                        {['🔥', '🎉', '✅', '💎', '🚀'].map(item => (
                            <button key={item} onClick={() => sendSticker(item)} className="rounded-xl bg-white/5 p-2 text-3xl hover:bg-white/10">
                                {item}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Attachment Menu */}
            {showAttachMenu && (
                <div className="absolute bottom-full left-2 sm:left-10 mb-3 z-50 w-[calc(100vw-1rem)] max-w-sm rounded-3xl bg-[#233138] p-3 shadow-2xl border border-white/10 animate-slide-up">
                    <div className="grid grid-cols-4 gap-2">
                        <AttachOption
                            label="Gallery"
                            color="bg-fuchsia-600"
                            icon={<PhotoIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('image/*,video/*')}
                        />
                        <AttachOption
                            label="Camera"
                            color="bg-rose-500"
                            icon={<CameraIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('image/*,video/*')}
                        />
                        <AttachOption
                            label="Document"
                            color="bg-indigo-500"
                            icon={<DocumentIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('*/*')}
                        />
                        <AttachOption
                            label="Audio"
                            color="bg-orange-500"
                            icon={<MusicalNoteIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('audio/*')}
                        />
                        <AttachOption
                            label="Location"
                            color="bg-emerald-500"
                            icon={<MapPinIcon className="w-6 h-6 text-white" />}
                            onClick={handleShareLocation}
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
                            label="GIF"
                            color="bg-pink-500"
                            icon={<FaceSmileIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('image/gif')}
                        />
                        <AttachOption
                            label="Game"
                            color="bg-violet-500"
                            icon={<ChartBarIcon className="w-6 h-6 text-white" />}
                            onClick={sendMiniGame}
                        />
                    </div>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="*/*" />
                </div>
            )}

            <div className="flex items-end gap-2 px-3 py-2">
                {/* Emoji + Attach */}
                {!isRecording && !disabled && (
                    <div className="flex items-center gap-1 flex-shrink-0 pb-1">
                        <button
                            type="button"
                            onClick={() => { setShowEmoji(v => !v); setShowAttachMenu(false); }}
                            className={`p-2 rounded-full transition-colors ${showEmoji ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                            title="Emojis"
                        >
                            <FaceSmileIcon className="w-6 h-6" />
                        </button>
                        <button 
                            type="button"
                            onClick={() => { setShowAttachMenu(v => !v); setShowEmoji(false); }}
                            className={`p-2 rounded-full transition-colors ${showAttachMenu ? 'text-blue-400 rotate-45' : 'text-gray-400 hover:text-gray-200'}`}
                            title="Attachments"
                        >
                            <PaperClipIcon className="w-6 h-6" />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                toggleTranslator();
                                setShowEmoji(false);
                                setShowAttachMenu(false);
                            }}
                            className={`p-2 rounded-full transition-colors ${showTranslator ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                            title="Translate"
                        >
                            <GlobeIcon className="w-6 h-6" />
                        </button>
                    </div>
                )}

                {/* Input */}
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
                            className="flex-1 bg-[#2a3942] text-gray-100 placeholder-gray-500 rounded-3xl px-4 py-3 text-[15px] focus:outline-none resize-none max-h-32 overflow-y-auto leading-relaxed"
                            style={{ scrollbarWidth: 'none' }}
                            onClick={() => { setShowEmoji(false); setShowAttachMenu(false); }}
                            onBlur={() => onTyping?.(false)}
                        />
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
