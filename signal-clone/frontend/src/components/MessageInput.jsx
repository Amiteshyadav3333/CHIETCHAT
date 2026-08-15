import React, { useRef, useState } from 'react';
import axios from 'axios';
import { 
    PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, MicrophoneIcon, 
    StopIcon, XMarkIcon, ChartBarIcon, MapPinIcon, DocumentIcon,
    MusicalNoteIcon, PhotoIcon, CameraIcon, VideoCameraIcon, UserCircleIcon
} from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon, GiftIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';
import EmojiPicker from 'emoji-picker-react';
import RideModal from './RideModal';
import GiftModal from './GiftModal';
import BirthdayModal from './BirthdayModal';
import ShoppingSearchModal from './ShoppingSearchModal';
import PollCreatorModal from './PollCreatorModal';
import ScheduleMessageModal from './ScheduleMessageModal';
import VerifiedPaymentComposer from './VerifiedPaymentComposer';
import DrawStudio from './DrawStudio';
import { API_BASE_URL } from '../utils/apiBaseUrl';
import { photoBlobToStickerFile } from '../utils/photoSticker';

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
    '😀', '😂', '🥰', '😍', '😎', '🥳', '🤩',
    '🤗', '🤔', '😴', '😭', '😡', '🤯', '😇',
    '👍', '👏', '🙏', '💪', '❤️', '💯', '🔥',
    '🎉', '🎂', '🎁', '✨', '🌟', '🫶', '🚀',
];
const apiUrl = API_BASE_URL;
const cleanBaseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;

const MessageInput = ({ 
    onSend, onUpload, onStartLiveLocation, replyTo, onCancelReply, 
    onTranslate, chatId, chatTranslationLang, onChangeTranslationLang,
    onTyping,
    disappearingTtl = 0,
    disabled = false, placeholderOverride = "",
    lastMessageText = "",
    showAiFeature = false,
    showSmartReplies = false,
    currentUserId, payeeId, payeeName,
    onSchedule, token, drawSource = null, onDrawSourceConsumed, onOpenDraw,
    cameraOpenRequest = 0, photoReactionSource = null, onPhotoReactionComplete
}) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [pickerTab, setPickerTab] = useState('emoji');
    const [gifSearch, setGifSearch] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loadingGifs, setLoadingGifs] = useState(false);
    const [grammarLoading, setGrammarLoading] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [showVideoNote, setShowVideoNote] = useState(false);
    const [isVideoNoteRecording, setIsVideoNoteRecording] = useState(false);
    const [videoNoteSeconds, setVideoNoteSeconds] = useState(0);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [smartReplies, setSmartReplies] = useState([]);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showShoppingModal, setShowShoppingModal] = useState(false);
    const [showPaymentComposer, setShowPaymentComposer] = useState(false);
    const [showDrawStudio, setShowDrawStudio] = useState(false);
    const [stickerDraft, setStickerDraft] = useState(null);
    const [photoDraft, setPhotoDraft] = useState(null);
    const [stickerBusy, setStickerBusy] = useState(false);

    const [showCameraModal, setShowCameraModal] = useState(false);
    const [cameraFacing, setCameraFacing] = useState('user');
    const [cameraFilter, setCameraFilter] = useState('normal');
    const [capturedSnap, setCapturedSnap] = useState(null);
    const streamRef = useRef(null);
    const FILTERS = [
        { id: 'normal', label: 'Normal', css: 'none' },
        { id: 'glow', label: 'Glow', css: 'brightness(1.12) saturate(1.18) contrast(.95)' },
        { id: 'warm', label: 'Warm', css: 'sepia(.22) saturate(1.35) hue-rotate(-8deg)' },
        { id: 'cool', label: 'Cool', css: 'saturate(1.15) hue-rotate(18deg)' },
        { id: 'mono', label: 'B&W', css: 'grayscale(1) contrast(1.12)' },
        { id: 'vivid', label: 'Vivid', css: 'saturate(1.8) contrast(1.08)' }
    ];
    React.useEffect(() => {
        if (cameraOpenRequest > 0) setShowCameraModal(true);
    }, [cameraOpenRequest]);
    const [showGameCreator, setShowGameCreator] = useState(false);
    const [gameType, setGameType] = useState('Tic-Tac-Toe');
    const [gameMode, setGameMode] = useState('vs-friend');
    const [gameTargetWins, setGameTargetWins] = useState(3);

    const [showRideModal, setShowRideModal] = useState(false);
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [showBirthdayModal, setShowBirthdayModal] = useState(false);

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

    const localGrammarFallback = (value) => {
        let t = value.trim();
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
            { regex: /\bI are\b/g, replacement: 'I am' },
            { regex: /\b(he|she|it) are\b/gi, replacement: '$1 is' },
            { regex: /\b(you|we|they) is\b/gi, replacement: '$1 are' },
        ];
        rules.forEach(rule => {
            t = t.replace(rule.regex, rule.replacement);
        });
        if (!/[.!?]$/.test(t)) {
            t += '.';
        }
        return t.replace(/\s+([,.!?])/g, '$1').replace(/([,.!?])(?=[A-Za-z])/g, '$1 ');
    };

    const requestGrammarFix = async (value) => {
        const source = value.trim();
        if (!source) return source;
        try {
            const response = await axios.post('/api/ai/grammar', { text: source });
            return response.data.corrected || localGrammarFallback(source);
        } catch {
            return localGrammarFallback(source);
        }
    };

    const handleGrammarFix = async () => {
        if (!text.trim() || grammarLoading) return;
        setGrammarLoading(true);
        try {
            setText(await requestGrammarFix(text));
            inputRef.current?.focus();
        } finally {
            setGrammarLoading(false);
        }
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
    const videoNoteRecorderRef = useRef(null);
    const videoNoteStreamRef = useRef(null);
    const videoNoteChunksRef = useRef([]);
    const videoNotePreviewRef = useRef(null);
    const videoNoteTimerRef = useRef(null);
    const inputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const documentInputRef = useRef(null);
    const audioInputRef = useRef(null);
    const stickerInputRef = useRef(null);
    const typingTimerRef = useRef(null);

    const attachMenuRef = useRef(null);
    const emojiPickerRef = useRef(null);
    const videoRef = useRef(null);

    React.useEffect(() => {
        return () => {
            clearTimeout(typingTimerRef.current);
            clearInterval(videoNoteTimerRef.current);
            videoNoteStreamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, []);

    React.useEffect(() => {
        if (drawSource) setShowDrawStudio(true);
    }, [drawSource]);

    React.useEffect(() => {
        if (pickerTab === 'gif' && gifs.length === 0) {
            setLoadingGifs(true);
            fetch(`${cleanBaseUrl}/api/gifs?q=trending`)
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

    const startCamera = React.useCallback(async (facing) => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
            streamRef.current = s;
            if (videoRef.current) videoRef.current.srcObject = s;
        } catch (err) {
            console.error('Camera error:', err);
            alert('Could not access camera. Please check permissions.');
            setShowCameraModal(false);
        }
    }, []);

    React.useEffect(() => {
        if (showCameraModal) {
            startCamera(cameraFacing);
        } else {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        }
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, [showCameraModal]);

    const flipCamera = () => {
        const next = cameraFacing === 'user' ? 'environment' : 'user';
        setCameraFacing(next);
        startCamera(next);
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.filter = FILTERS.find(f => f.id === cameraFilter)?.css || 'none';
        if (cameraFacing === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            if (blob) {
                setCapturedSnap({
                    blob,
                    url: URL.createObjectURL(blob)
                });
            }
        }, 'image/png');
    };

    const closeCamera = () => {
        if (capturedSnap?.url) URL.revokeObjectURL(capturedSnap.url);
        setCapturedSnap(null);
        setShowCameraModal(false);
        if (photoReactionSource) onPhotoReactionComplete?.();
    };

    const retakeSnap = () => {
        if (capturedSnap?.url) URL.revokeObjectURL(capturedSnap.url);
        setCapturedSnap(null);
    };

    const sendSnap = () => {
        if (!capturedSnap?.blob) return;
        onUpload(new File([capturedSnap.blob], `${photoReactionSource ? 'photo-reaction' : 'snap'}-${Date.now()}.png`, { type: 'image/png' }));
        closeCamera();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        if (localStorage.getItem('spam_detection') !== '0') {
            const suspicious = /(bit\.ly|tinyurl\.com|t\.me\/|free\s*(gift|money)|share\s*(your\s*)?(otp|pin|password)|urgent\s*payment)/i.test(trimmed);
            if (suspicious && !window.confirm('CHEETCHAT safety: This message may contain a risky link or request for sensitive information. Send anyway?')) return;
        }

        let finalWord = showAiFeature ? await requestGrammarFix(trimmed) : trimmed;
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
        e.target.value = '';
        if (files.length === 0) return;
        if (files.length > 15) {
            alert('You can only select up to 15 files at once.');
            return;
        }
        if (files.length === 1 && files[0].type.startsWith('image/')) {
            const file = files[0];
            setPhotoDraft({ file, url: URL.createObjectURL(file) });
            setShowAttachMenu(false);
            return;
        }
        files.forEach(file => onUpload(file));
        if (photoReactionSource) onPhotoReactionComplete?.();
        setShowAttachMenu(false);
    };

    const convertPhotoToSticker = async (file) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) return alert('Please choose a photo.');
        if (file.size > 20 * 1024 * 1024) return alert('Photo must be smaller than 20MB.');
        setStickerBusy(true);
        try {
            const stickerFile = await photoBlobToStickerFile(file);
            setStickerDraft({ file: stickerFile, url: URL.createObjectURL(stickerFile) });
            if (photoDraft?.url) URL.revokeObjectURL(photoDraft.url);
            setPhotoDraft(null);
            setShowAttachMenu(false);
        } catch (error) {
            alert(error.message || 'Could not create sticker from this photo.');
        } finally { setStickerBusy(false); }
    };

    const createStickerFromPhoto = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        await convertPhotoToSticker(file);
    };

    const closePhotoDraft = () => {
        if (photoDraft?.url) URL.revokeObjectURL(photoDraft.url);
        setPhotoDraft(null);
    };

    const sendPhotoDraft = () => {
        if (!photoDraft) return;
        onUpload(photoDraft.file);
        if (photoReactionSource) onPhotoReactionComplete?.();
        closePhotoDraft();
    };

    const closeStickerDraft = () => {
        if (stickerDraft?.url) URL.revokeObjectURL(stickerDraft.url);
        setStickerDraft(null);
    };

    const sendStickerDraft = () => {
        if (!stickerDraft) return;
        onUpload(stickerDraft.file, 'sticker');
        closeStickerDraft();
    };

    const handleCreatePoll = poll => {
        onSend(JSON.stringify(poll), 'poll', disappearingTtl);
        setShowPollCreator(false);
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

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
                .find(type => MediaRecorder.isTypeSupported?.(type));
            const mediaRecorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const mimeType = mediaRecorder.mimeType || preferredType || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
                const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
                stream.getTracks().forEach(t => t.stop());
                mediaRecorderRef.current = null;
                setIsRecording(false);
                if (blob.size > 0) onUpload(file);
                else alert('Voice recording was empty. Please record again.');
            };

            mediaRecorder.onerror = () => {
                stream.getTracks().forEach(track => track.stop());
                mediaRecorderRef.current = null;
                setIsRecording(false);
                alert('Voice recording failed. Please try again.');
            };

            mediaRecorder.start(250);
            setIsRecording(true);
        } catch {
            alert('Microphone permission needed.');
        }
    };

    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (recorder?.state === 'recording') {
            recorder.requestData?.();
            recorder.stop();
        }
    };

    const openVideoNote = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: {
                    facingMode: 'user',
                    width: { ideal: 480 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24, max: 30 }
                }
            });
            videoNoteStreamRef.current = stream;
            setShowVideoNote(true);
            requestAnimationFrame(() => {
                if (videoNotePreviewRef.current) {
                    videoNotePreviewRef.current.srcObject = stream;
                    videoNotePreviewRef.current.play().catch(() => {});
                }
            });
        } catch {
            alert('Video note ke liye camera aur microphone permission allow karein.');
        }
    };

    const closeVideoNote = () => {
        clearInterval(videoNoteTimerRef.current);
        if (videoNoteRecorderRef.current?.state === 'recording') {
            videoNoteRecorderRef.current.onstop = null;
            videoNoteRecorderRef.current.stop();
        }
        videoNoteStreamRef.current?.getTracks().forEach(track => track.stop());
        videoNoteStreamRef.current = null;
        setIsVideoNoteRecording(false);
        setVideoNoteSeconds(0);
        setShowVideoNote(false);
    };

    const startVideoNoteRecording = () => {
        const stream = videoNoteStreamRef.current;
        if (!stream) return;
        const preferredType = ['video/webm;codecs=vp8,opus', 'video/webm']
            .find(type => MediaRecorder.isTypeSupported?.(type));
        const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
        videoNoteChunksRef.current = [];
        videoNoteRecorderRef.current = recorder;
        recorder.ondataavailable = event => {
            if (event.data.size) videoNoteChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
            clearInterval(videoNoteTimerRef.current);
            const blob = new Blob(videoNoteChunksRef.current, { type: recorder.mimeType || 'video/webm' });
            const file = new File([blob], `video-note-${Date.now()}.webm`, { type: blob.type });
            videoNoteStreamRef.current?.getTracks().forEach(track => track.stop());
            videoNoteStreamRef.current = null;
            setShowVideoNote(false);
            setIsVideoNoteRecording(false);
            setVideoNoteSeconds(0);
            if (blob.size > 0) onUpload(file);
        };
        recorder.start(250);
        setIsVideoNoteRecording(true);
        setVideoNoteSeconds(0);
        videoNoteTimerRef.current = setInterval(() => {
            setVideoNoteSeconds(seconds => {
                if (seconds >= 59) {
                    setTimeout(() => recorder.state === 'recording' && recorder.stop(), 0);
                    return 60;
                }
                return seconds + 1;
            });
        }, 1000);
    };

    const stopVideoNoteRecording = () => {
        if (videoNoteRecorderRef.current?.state === 'recording') {
            videoNoteRecorderRef.current.stop();
        }
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
            {showPollCreator && <PollCreatorModal onClose={() => setShowPollCreator(false)} onSubmit={handleCreatePoll} />}

            {showScheduleModal && <ScheduleMessageModal chatId={chatId} message={text} onClose={() => setShowScheduleModal(false)} onSchedule={onSchedule} onScheduled={() => { setText(''); setShowScheduleModal(false); }} token={token} />}

            {showShoppingModal && <ShoppingSearchModal onClose={() => setShowShoppingModal(false)} />}

            {showDrawStudio && <DrawStudio initialSource={drawSource} onClose={() => { setShowDrawStudio(false); onDrawSourceConsumed?.(); }} onSendDrawing={drawing => { onSend(JSON.stringify(drawing), 'drawing', disappearingTtl); setShowDrawStudio(false); onDrawSourceConsumed?.(); }} onSend={(file, caption) => { onUpload(file); if (caption) onSend(caption, 'text', disappearingTtl); setShowDrawStudio(false); onDrawSourceConsumed?.(); }} />}

            {photoDraft && <div className="fixed inset-0 z-[119] flex items-center justify-center bg-black/85 p-5"><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#182229] p-5 text-center shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-white">Selected photo</h3><button onClick={closePhotoDraft} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white"><XMarkIcon className="h-5 w-5" /></button></div><div className="my-5 flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-black/30"><img src={photoDraft.url} alt="Selected photo preview" className="h-full w-full object-contain" /></div><p className="mb-4 text-xs text-gray-400">Send it as a normal photo or turn this selected photo into a sticker.</p><div className="grid grid-cols-2 gap-3"><button onClick={sendPhotoDraft} disabled={stickerBusy} className="rounded-full border border-white/15 py-3 text-sm font-black text-white hover:bg-white/10">Send Photo</button><button onClick={() => convertPhotoToSticker(photoDraft.file)} disabled={stickerBusy} className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-black text-white disabled:opacity-50">{stickerBusy ? 'Creating…' : '✨ Make Sticker'}</button></div></div></div>}

            {stickerDraft && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-5"><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#182229] p-5 text-center shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-white">Photo sticker</h3><button onClick={closeStickerDraft} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white"><XMarkIcon className="h-5 w-5" /></button></div><div className="my-5 flex aspect-square items-center justify-center rounded-3xl bg-[radial-gradient(circle_at_center,_#334155,_#111827)] p-4"><img src={stickerDraft.url} alt="Sticker preview" className="h-full w-full object-contain drop-shadow-2xl" /></div><p className="mb-4 text-xs text-gray-400">Your photo is resized to a high-quality 512×512 WebP sticker.</p><button onClick={sendStickerDraft} className="w-full rounded-full bg-[#00a884] py-3 font-black text-white hover:bg-[#029878]">Send sticker</button></div></div>}

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
                            onClick={() => { if (onOpenDraw) onOpenDraw(); else setShowDrawStudio(true); setShowAttachMenu(false); setShowEmoji(false); }}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-[#00a884] transition-all hover:bg-[#00a884]/10 hover:text-emerald-300 active:scale-90"
                            title="Draw, point or write"
                            aria-label="Open drawing tools"
                        >
                            <span className="text-2xl leading-none">✎</span>
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
                                                fetch(`${cleanBaseUrl}/api/gifs?q=${encodeURIComponent(gifSearch)}`)
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
                                            fetch(`${cleanBaseUrl}/api/gifs?q=${encodeURIComponent(gifSearch || 'trending')}`)
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
                                <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Offline Stickers</p>
                                <div className="grid grid-cols-4 gap-2 scrollbar-thin">
                                    {STICKERS.map((sticker, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => {
                                                onSend(sticker, 'sticker', disappearingTtl);
                                                setShowEmoji(false);
                                            }}
                                            className="rounded-xl bg-white/5 p-2 hover:bg-white/10 transition-colors flex items-center justify-center"
                                        >
                                            <span role="img" aria-label={`sticker-${i + 1}`} className="text-4xl leading-none">{sticker}</span>
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
                            label="Draw on chat"
                            color="bg-emerald-500"
                            icon={<span className="text-2xl text-white">✎</span>}
                            onClick={() => { if (onOpenDraw) onOpenDraw(); else setShowDrawStudio(true); setShowAttachMenu(false); }}
                        />
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
                            label={stickerBusy ? 'Creating…' : 'Photo Sticker'}
                            color="bg-gradient-to-br from-violet-500 to-fuchsia-600"
                            icon={<span className="text-2xl">✨</span>}
                            onClick={() => !stickerBusy && stickerInputRef.current?.click()}
                        />
                        <AttachOption
                            label="Schedule"
                            color="bg-sky-600"
                            icon={<span className="text-2xl text-white">◷</span>}
                            onClick={() => { setShowScheduleModal(true); setShowAttachMenu(false); }}
                        />
                        <AttachOption
                            label="Shopping"
                            color="bg-[#ff9900]"
                            icon={<ShoppingBagIcon className="w-6 h-6 text-white" />}
                            onClick={() => { setShowShoppingModal(true); setShowAttachMenu(false); }}
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
                            onClick={() => { setShowAttachMenu(false); setShowPaymentComposer(true); }}
                        />
                        <AttachOption
                            label="Ride 🚕"
                            color="bg-slate-700"
                            icon={<MapPinIcon className="w-6 h-6 text-white" />}
                            onClick={() => { setShowRideModal(true); setShowAttachMenu(false); }}
                        />
                        <AttachOption
                            label="Gift 🛍️"
                            color="bg-pink-500"
                            icon={<ShoppingBagIcon className="w-6 h-6 text-white" />}
                            onClick={() => { setShowGiftModal(true); setShowAttachMenu(false); }}
                        />
                        <AttachOption
                            label="Birthday 🎂"
                            color="bg-gradient-to-br from-fuchsia-500 to-pink-500"
                            icon={<GiftIcon className="w-6 h-6 text-white" />}
                            onClick={() => { setShowBirthdayModal(true); setShowAttachMenu(false); }}
                        />
                    </div>
                </div>
            )}


            {showCameraModal && (
                <div className="fixed inset-0 z-[110] bg-black flex flex-col animate-fade-in">
                    {capturedSnap ? (
                        <img src={capturedSnap.url} alt="Snap preview" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{
                                transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
                                filter: FILTERS.find(f => f.id === cameraFilter)?.css || 'none'
                            }}
                        />
                    )}
                    {photoReactionSource?.src && (
                        <div className="absolute right-4 top-24 z-20 w-28 overflow-hidden rounded-2xl border-2 border-white/80 bg-black shadow-2xl sm:w-36">
                            <img src={photoReactionSource.src} alt="Photo being reacted to" className="aspect-[4/5] w-full object-cover" />
                            <p className="truncate bg-black/75 px-2 py-1.5 text-center text-[10px] font-bold text-white">Reacting to {photoReactionSource.senderName}</p>
                        </div>
                    )}
                    {/* Top bar */}
                    <div className="relative z-10 flex items-center justify-between px-4 pt-10 pb-4">
                        <button
                            onClick={closeCamera}
                            className="p-2 rounded-full bg-black/50 text-white"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                        <span className="text-white font-bold text-sm bg-black/40 px-3 py-1 rounded-full">
                            {capturedSnap ? (photoReactionSource ? 'Reaction ready ✨' : 'Snap ready ✨') : (photoReactionSource ? '📷 Photo reaction' : (cameraFacing === 'user' ? '🤳 Front' : '📷 Back'))}
                        </span>
                        {/* Flip camera */}
                        {!capturedSnap && <button
                            onClick={flipCamera}
                            className="p-2 rounded-full bg-black/50 text-white"
                            title="Flip Camera"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>}
                    </div>
                    {!capturedSnap && (
                        <div className="relative z-10 mt-auto mb-5 flex gap-3 overflow-x-auto px-4 pb-1 justify-start sm:justify-center">
                            {FILTERS.map(filter => (
                                <button
                                    key={filter.id}
                                    type="button"
                                    onClick={() => setCameraFilter(filter.id)}
                                    className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-bold text-white border transition-all ${
                                        cameraFilter === filter.id ? 'bg-white text-black border-white scale-105' : 'bg-black/45 border-white/30'
                                    }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Bottom controls */}
                    <div className={`relative z-10 ${capturedSnap ? 'mt-auto' : ''} flex items-center justify-around px-8 pb-12`}>
                        {capturedSnap ? (
                            <>
                                <button onClick={retakeSnap} className="rounded-full bg-black/55 px-5 py-3 text-sm font-bold text-white border border-white/30">
                                    Retake
                                </button>
                                <button onClick={sendSnap} className="rounded-full bg-[#00a884] px-7 py-3 text-sm font-bold text-white shadow-xl">
                                    {photoReactionSource ? 'Send reaction ➤' : 'Send snap ➤'}
                                </button>
                            </>
                        ) : (
                            <>
                        <button
                            onClick={() => { cameraInputRef.current?.click(); setShowCameraModal(false); }}
                            className="p-3 rounded-full bg-black/50 text-white"
                            title="Upload from gallery"
                        >
                            <PhotoIcon className="w-7 h-7" />
                        </button>
                        {/* Shutter */}
                        <button
                            onClick={capturePhoto}
                            className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 transition-all shadow-2xl flex items-center justify-center"
                        >
                            <div className="w-14 h-14 rounded-full bg-white" />
                        </button>
                        <div className="w-14" />
                            </>
                        )}
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

                        {/* AI Grammar Fix */}
                        {showAiFeature && (
                            <button
                                type="button"
                                onClick={handleGrammarFix}
                                disabled={!text.trim() || grammarLoading}
                                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90 ${text.trim() ? 'text-violet-400 hover:text-violet-300 hover:bg-violet-400/10' : 'text-gray-600 cursor-not-allowed'}`}
                                title={grammarLoading ? 'Correcting grammar…' : 'AI Grammar Fix'}
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
                <input ref={stickerInputRef} type="file" className="hidden" onChange={createStickerFromPhoto} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
                <input ref={cameraInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,video/*" capture="environment" />
                <input ref={documentInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="*/*" />
                <input ref={audioInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="audio/*" />

                {/* Textarea + Emoji (inside) + Send/Mic + Translate */}
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
                                className="w-full bg-[#2a3942] text-gray-100 placeholder-gray-500 rounded-3xl pl-4 pr-24 py-3 text-[15px] focus:outline-none resize-none max-h-32 overflow-y-auto leading-relaxed"
                                style={{ scrollbarWidth: 'none' }}
                                onClick={() => { setShowEmoji(false); setShowAttachMenu(false); }}
                                onBlur={() => onTyping?.(false)}
                            />
                            {/* Translate button — RIGHT INSIDE chatbox */}
                            <button
                                type="button"
                                onClick={() => { toggleTranslator(); setShowEmoji(false); setShowAttachMenu(false); }}
                                className={`absolute right-12 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 ${showTranslator ? 'text-[#00a884]' : 'text-gray-400 hover:text-[#00a884]'}`}
                                title="Translate"
                            >
                                <GlobeIcon className="w-6 h-6" />
                            </button>
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
                        <div className="flex items-center gap-1">
                            {!isRecording && (
                                <button
                                    type="button"
                                    onClick={openVideoNote}
                                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg bg-[#2a3942] hover:bg-[#34434c] text-[#25d366]"
                                    title="Video note"
                                >
                                    <VideoCameraIcon className="w-5 h-5" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-signal-accent hover:bg-signal-accentHover'}`}
                                title={isRecording ? 'Stop recording' : 'Voice note'}
                            >
                                {isRecording
                                    ? <StopIcon className="w-5 h-5 text-white" />
                                    : <MicrophoneIcon className="w-5 h-5 text-white" />
                                }
                            </button>
                        </div>
                    )}
                </form>
            </div>

            {showVideoNote && (
                <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-[#111b21] rounded-3xl p-6 flex flex-col items-center shadow-2xl border border-white/10">
                        <div className="w-full flex items-center justify-between mb-5">
                            <button onClick={closeVideoNote} className="p-2 rounded-full text-white/70 hover:bg-white/10" title="Cancel">
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                            <span className="text-white font-semibold">Video note</span>
                            <span className={`text-sm tabular-nums ${isVideoNoteRecording ? 'text-red-400' : 'text-white/50'}`}>
                                0:{String(videoNoteSeconds).padStart(2, '0')}
                            </span>
                        </div>
                        <div className={`relative w-64 h-64 rounded-full overflow-hidden bg-black border-4 ${isVideoNoteRecording ? 'border-red-500' : 'border-[#25d366]'}`}>
                            <video ref={videoNotePreviewRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
                            {isVideoNoteRecording && <div className="absolute top-4 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 animate-pulse" />}
                        </div>
                        <p className="text-white/50 text-xs mt-4">Maximum 60 seconds</p>
                        <button
                            type="button"
                            onClick={isVideoNoteRecording ? stopVideoNoteRecording : startVideoNoteRecording}
                            className={`mt-5 w-16 h-16 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition ${isVideoNoteRecording ? 'bg-red-500' : 'bg-[#25d366]'}`}
                        >
                            {isVideoNoteRecording ? <StopIcon className="w-7 h-7 text-white" /> : <span className="w-6 h-6 rounded-full bg-white" />}
                        </button>
                    </div>
                </div>
            )}

            <VerifiedPaymentComposer
                open={showPaymentComposer}
                onClose={() => setShowPaymentComposer(false)}
                chatId={chatId}
                payeeId={payeeId}
                payeeName={payeeName}
                onVerified={payment => onSend(JSON.stringify(payment), 'payment', disappearingTtl)}
            />

            {/* Modals for new premium features */}
            {showRideModal && (
                <RideModal 
                    onClose={() => setShowRideModal(false)}
                    onSend={(payload) => onSend(JSON.stringify(payload), 'ride')}
                />
            )}

            {showGiftModal && (
                <GiftModal 
                    onClose={() => setShowGiftModal(false)}
                    onSend={(payload) => onSend(JSON.stringify(payload), 'gift')}
                />
            )}

            {showBirthdayModal && (
                <BirthdayModal 
                    onClose={() => setShowBirthdayModal(false)}
                    onSend={(payload) => onSend(JSON.stringify(payload), 'birthday')}
                />
            )}

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
