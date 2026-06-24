import React, { useState, useRef, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { TrashIcon, DocumentIcon, ArrowUturnLeftIcon, ArrowDownTrayIcon, ClipboardDocumentIcon, ForwardIcon, PencilSquareIcon, MapPinIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import FullscreenMediaModal from './FullscreenMediaModal';
import { formatDuration, formatFileSize } from '../utils/mediaCompressor';

const getPlatformLabel = (url) => {
    const lowercase = url.toLowerCase();
    if (lowercase.includes('youtube.com') || lowercase.includes('youtu.be')) return 'YouTube';
    if (lowercase.includes('github.com')) return 'GitHub';
    if (lowercase.includes('instagram.com')) return 'Instagram';
    if (lowercase.includes('facebook.com')) return 'Facebook';
    if (lowercase.includes('linkedin.com')) return 'LinkedIn';
    if (lowercase.includes('twitter.com') || lowercase.includes('x.com')) return 'Twitter/X';
    if (lowercase.includes('google.com')) return 'Google';
    return '';
};

const renderClickableText = (text) => {
    if (!text) return '';
    const regex = /(https?:\/\/[^\s]+)|(www\.[a-zA-Z0-9-]+\.[^\s]+)|([a-zA-Z0-9-]+\.(?:com|net|org|in|co|io|xyz|info|us|app|dev|me|ai)\b[^\s]*)|(\+?\d{1,3}[-.\ s]?\(?\d{3}\)?[-.\ s]?\d{3}[-.\ s]?\d{4})|(\b\d{10}\b)/gi;
    const elements = [];
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        const matchIndex = match.index;
        const matchText = match[0];
        if (matchIndex > lastIndex) {
            elements.push(text.substring(lastIndex, matchIndex));
        }
        const isUrl = match[1] || match[2] || match[3];
        if (isUrl) {
            let hrefVal = matchText;
            if (!hrefVal.match(/^https?:\/\//i)) {
                hrefVal = `https://${hrefVal}`;
            }
            const platform = getPlatformLabel(hrefVal);
            elements.push(
                <a
                    key={`url-${matchIndex}`}
                    href={hrefVal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${platform ? 'text-[#25D366]' : 'text-[#53bdeb]'} hover:underline break-all inline font-semibold`}
                    onClick={(e) => e.stopPropagation()}
                    title={platform ? `${platform} Link` : 'Link'}
                >
                    {platform ? `🔗 [${platform}] ${matchText}` : matchText}
                </a>
            );
        } else {
            elements.push(
                <a
                    key={`phone-${matchIndex}`}
                    href={`tel:${matchText.replace(/[-.\ s()]/g, '')}`}
                    className="text-[#53bdeb] hover:underline break-all inline font-semibold"
                    onClick={(e) => e.stopPropagation()}
                >
                    {matchText}
                </a>
            );
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        elements.push(text.substring(lastIndex));
    }
    return elements.length > 0 ? elements : text;
};

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

const ClockIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

const SWIPE_THRESHOLD = 60;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/* ─── Inline Audio Player (WhatsApp style) ─── */
const InlineAudioPlayer = ({ src, isOwn, onOpen }) => {
    const audioRef = useRef(null);
    const progressRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const bars = [0.3,0.6,0.9,0.7,0.4,0.8,0.5,0.95,0.6,0.3,0.7,0.8,0.4,0.6,0.9,0.5,0.7,0.4,0.8,0.6,0.3,0.9,0.7,0.5,0.6,0.4,0.8,0.7,0.3,0.6];

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const onMeta = () => setDuration(a.duration || 0);
        const onTime = () => setCurrentTime(a.currentTime);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
        a.addEventListener('loadedmetadata', onMeta);
        a.addEventListener('timeupdate', onTime);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnd);
        return () => {
            a.removeEventListener('loadedmetadata', onMeta);
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('play', onPlay);
            a.removeEventListener('pause', onPause);
            a.removeEventListener('ended', onEnd);
        };
    }, []);

    const togglePlay = (e) => {
        e.stopPropagation();
        if (audioRef.current?.paused) audioRef.current.play();
        else audioRef.current?.pause();
    };

    const handleProgressClick = (e) => {
        e.stopPropagation();
        const rect = progressRef.current.getBoundingClientRect();
        if (audioRef.current) audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
    };

    const cycleSpeed = (e) => {
        e.stopPropagation();
        const speeds = [1, 1.5, 2];
        const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
        setSpeed(next);
        if (audioRef.current) audioRef.current.playbackRate = next;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const accentColor = isOwn ? '#a7f3d0' : '#25d366';

    return (
        <div className="flex items-center gap-2.5 min-w-[220px] max-w-[270px] py-0.5">
            <audio ref={audioRef} src={src} preload="metadata" />

            {/* Play/Pause button */}
            <button
                onClick={togglePlay}
                className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-md transition-all active:scale-95 ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-[#25d366]/20 hover:bg-[#25d366]/30'}`}
            >
                {isPlaying ? (
                    <svg viewBox="0 0 24 24" fill={accentColor} className="w-5 h-5">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill={accentColor} className="w-5 h-5 ml-0.5">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            {/* Waveform + progress */}
            <div className="flex-1 flex flex-col gap-1.5">
                {/* Waveform bars */}
                <div
                    ref={progressRef}
                    className="flex items-end gap-[2px] h-8 cursor-pointer"
                    onClick={handleProgressClick}
                >
                    {bars.map((h, i) => {
                        const filled = (i / bars.length) * 100 < progress;
                        return (
                            <div
                                key={i}
                                className="rounded-full transition-all duration-75 flex-1"
                                style={{
                                    height: `${Math.max((isPlaying && filled ? h * 0.7 + Math.random() * 0.3 : h) * 28, 4)}px`,
                                    background: filled ? accentColor : (isOwn ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.2)'),
                                    minWidth: '3px',
                                }}
                            />
                        );
                    })}
                </div>

                {/* Time + speed */}
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono tabular-nums" style={{ color: isOwn ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.5)' }}>
                        {formatDuration(isPlaying || currentTime > 0 ? currentTime : duration)}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={cycleSpeed}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition-colors"
                            style={{ color: accentColor, borderColor: `${accentColor}50`, background: `${accentColor}15` }}
                        >
                            {speed}x
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
                            className="text-[9px] opacity-50 hover:opacity-100 transition-opacity"
                            style={{ color: accentColor }}
                            title="Open fullscreen player"
                        >
                            ⛶
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Document file type helper ─── */
const getDocIcon = (filename) => {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const map = {
        pdf: { icon: 'PDF', bg: 'bg-red-500', text: 'text-white' },
        doc: { icon: 'DOC', bg: 'bg-blue-600', text: 'text-white' },
        docx: { icon: 'DOC', bg: 'bg-blue-600', text: 'text-white' },
        xls: { icon: 'XLS', bg: 'bg-green-600', text: 'text-white' },
        xlsx: { icon: 'XLS', bg: 'bg-green-600', text: 'text-white' },
        ppt: { icon: 'PPT', bg: 'bg-orange-500', text: 'text-white' },
        pptx: { icon: 'PPT', bg: 'bg-orange-500', text: 'text-white' },
        zip: { icon: 'ZIP', bg: 'bg-yellow-600', text: 'text-white' },
        rar: { icon: 'RAR', bg: 'bg-yellow-700', text: 'text-white' },
        txt: { icon: 'TXT', bg: 'bg-gray-500', text: 'text-white' },
        mp3: { icon: 'MP3', bg: 'bg-purple-500', text: 'text-white' },
        mp4: { icon: 'MP4', bg: 'bg-pink-500', text: 'text-white' },
        apk: { icon: 'APK', bg: 'bg-emerald-600', text: 'text-white' },
    };
    return map[ext] || { icon: ext.toUpperCase().slice(0, 3) || '📄', bg: 'bg-indigo-500', text: 'text-white' };
};

// WhatsApp-style action menu overlay
const MessageActionMenu = ({ message, isOwn, isTextMessage, isDeleted, onClose, onReply, onEdit, onCopy, onForward, onReact, onPin, onDelete, onInfo, onTranslate }) => {
    const menuRef = useRef(null);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const actions = [
        { icon: '↩️', label: 'Reply', onClick: () => { onReply?.(); onClose(); } },
        ...(isOwn && isTextMessage && !isDeleted ? [{ icon: '✏️', label: 'Edit', onClick: () => { onEdit?.(); onClose(); } }] : []),
        ...(!isDeleted ? [{ icon: '📌', label: message.isPinned ? 'Unpin' : 'Pin', onClick: () => { onPin?.(); onClose(); } }] : []),
        ...(!isDeleted ? [{ icon: '📋', label: 'Copy', onClick: () => { onCopy?.(); onClose(); } }] : []),
        ...(!isDeleted ? [{ icon: '➡️', label: 'Forward', onClick: () => { onForward?.(); onClose(); } }] : []),
        ...(!isDeleted && isTextMessage ? [{ icon: '🌐', label: 'Translate', onClick: () => { onTranslate?.(); onClose(); } }] : []),
        ...(!isDeleted ? [{ icon: '😊', label: 'React', onClick: () => { onReact?.(); onClose(); } }] : []),
        { icon: 'ℹ️', label: 'Info', onClick: () => { onInfo?.(); onClose(); } },
        ...(isOwn && !isDeleted ? [{ icon: '🗑️', label: 'Delete', danger: true, onClick: () => { onDelete?.(); onClose(); } }] : []),
    ];

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center"
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
        >
            <div
                ref={menuRef}
                className="w-full max-w-xs mx-4 rounded-2xl overflow-hidden shadow-2xl border border-white/10"
                style={{
                    background: 'linear-gradient(135deg, #1a2634 0%, #111b21 100%)',
                    animation: 'scaleInMenu 0.18s cubic-bezier(0.34,1.56,0.64,1) both'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Message preview */}
                {!isDeleted && (
                    <div className="px-4 py-3 border-b border-white/8 bg-white/5">
                        <p className="text-xs text-white/40 mb-1 uppercase tracking-wider font-semibold">Message</p>
                        <p className="text-sm text-white/80 line-clamp-2 break-words">
                            {message.type && message.type !== 'text' ? `📎 ${message.type}` : (message.content || '...')}
                        </p>
                    </div>
                )}

                {/* Quick reactions row */}
                {!isDeleted && (
                    <div className="flex items-center justify-around px-3 py-3 border-b border-white/8 bg-white/3">
                        {QUICK_REACTIONS.map(emoji => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => { onReact?.(emoji); onClose(); }}
                                className="text-2xl hover:scale-125 active:scale-110 transition-transform duration-150 leading-none p-1 rounded-full hover:bg-white/10"
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}

                {/* Action list */}
                <div className="py-1">
                    {actions.map((action, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={action.onClick}
                            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/8 active:bg-white/12 ${action.danger ? 'text-red-400 hover:text-red-300' : 'text-gray-100'}`}
                        >
                            <span className="text-lg leading-none w-6 text-center">{action.icon}</span>
                            <span className="text-sm font-medium">{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes scaleInMenu {
                    from { opacity: 0; transform: scale(0.85) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
};

const ChatBubble = ({
    message, isOwn, senderName, onDelete, senderAvatar, showAvatar,
    onReply, replyTo, onTranslate, chatId, chatTranslationLang,
    onEdit, onCopy, onForward, onReact, onPin
}) => {
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [showReactionsInMenu, setShowReactionsInMenu] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showTranslatorMenu, setShowTranslatorMenu] = useState(false);
    const [swipeX, setSwipeX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const [zoomedMedia, setZoomedMedia] = useState(null);

    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);

    // localTargetLang acts as a manual override for this specific message bubble
    const [localTargetLang, setLocalTargetLang] = useState('');
    const targetLang = localTargetLang || chatTranslationLang || localStorage.getItem('preferred_translation_language') || 'en';

    // Long press for mobile
    const longPressTimer = useRef(null);
    const touchStartX = useRef(null);
    const touchStartY = useRef(null);
    const isSwiping = useRef(false);

    const content = message.content || '';
    const isDeleted = message.type === 'deleted' || message.deletedAt;

    const isMedia = ['image', 'video'].includes(message.type) ||
        content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg)$/i);

    const isTextMessage = (!message.type || message.type === 'text') && !isMedia;

    useEffect(() => {
        const autoTranslate = async () => {
            if (!isTextMessage || !content || !onTranslate || !chatId) {
                setTranslatedText('');
                return;
            }
            const activeLang = localTargetLang || ((!isOwn) ? chatTranslationLang : '');
            if (activeLang) {
                setIsTranslating(true);
                try {
                    const translated = await onTranslate(content, activeLang);
                    if (translated) {
                        setTranslatedText(translated);
                    }
                } catch (err) {
                    console.error("Auto translation error:", err);
                } finally {
                    setIsTranslating(false);
                }
            } else {
                setTranslatedText('');
            }
        };
        autoTranslate();
    }, [content, isOwn, isTextMessage, onTranslate, chatId, chatTranslationLang, localTargetLang]);

    const handleDownload = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            const fileName = url.split('/').pop() || 'download';
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            window.open(url, '_blank');
        }
    };

    // Touch handlers — swipe = reply, long press = action menu
    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        isSwiping.current = false;
        setSwiping(true);

        longPressTimer.current = setTimeout(() => {
            if (!isSwiping.current) {
                setShowActionMenu(true);
            }
        }, 450);
    };

    const handleTouchMove = (e) => {
        if (touchStartX.current === null) return;
        const diffX = e.touches[0].clientX - touchStartX.current;
        const diffY = e.touches[0].clientY - touchStartY.current;

        if (Math.abs(diffY) > 10) {
            clearTimeout(longPressTimer.current);
            isSwiping.current = true;
        }

        if (Math.abs(diffX) > 8) {
            clearTimeout(longPressTimer.current);
            isSwiping.current = true;
            if (isOwn && diffX < 0) setSwipeX(Math.max(diffX, -SWIPE_THRESHOLD));
            else if (!isOwn && diffX > 0) setSwipeX(Math.min(diffX, SWIPE_THRESHOLD));
        }
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimer.current);
        if (Math.abs(swipeX) >= SWIPE_THRESHOLD - 5) {
            onReply && onReply(message);
        }
        setSwipeX(0);
        setSwiping(false);
        touchStartX.current = null;
        touchStartY.current = null;
        isSwiping.current = false;
    };

    // Desktop click → show action menu
    const handleBubbleClick = (e) => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' ||
            e.target.closest('button') || e.target.closest('select') || e.target.closest('a')) {
            return;
        }
        setShowActionMenu(true);
    };

    const handleTranslateMessage = async () => {
        if (!content || !onTranslate) return;
        setIsTranslating(true);
        try {
            const translated = await onTranslate(content, targetLang);
            if (translated) {
                setTranslatedText(translated);
                setLocalTargetLang(targetLang);
                localStorage.setItem('preferred_translation_language', targetLang);
            }
        } catch (err) {
            console.error("Translation error:", err);
            alert("Translation failed. Please try again.");
        } finally {
            setIsTranslating(false);
        }
    };

    const renderContent = (cnt, type) => {
        // ── IMAGE ──
        if (type === 'image' || cnt.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return (
                <div
                    className="relative group/media cursor-pointer rounded-2xl overflow-hidden"
                    style={{ maxWidth: 260 }}
                    onClick={(e) => { e.stopPropagation(); setZoomedMedia({ src: cnt, type: 'image' }); }}
                >
                    <img
                        src={cnt}
                        alt="sent"
                        className="w-full object-cover block"
                        style={{ maxHeight: 320, minHeight: 80, minWidth: 120 }}
                        loading="lazy"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover/media:bg-black/25 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover/media:opacity-100 transition-opacity p-2.5 bg-black/50 backdrop-blur-md rounded-full border border-white/20">
                            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                            </svg>
                        </div>
                    </div>
                    {/* Download button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity shadow-lg"
                        title="Download"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        // ── AUDIO ──
        if (type === 'audio' || cnt.match(/\.(mp3|wav|m4a|aac|oga|webm)$/i)) {
            return (
                <InlineAudioPlayer
                    src={cnt}
                    isOwn={isOwn}
                    onOpen={() => setZoomedMedia({ src: cnt, type: 'audio' })}
                />
            );
        }
        // ── VIDEO ──
        if (type === 'video' || cnt.match(/\.(mp4|webm|ogg)$/i)) {
            return (
                <div
                    className="relative group/media cursor-pointer rounded-2xl overflow-hidden"
                    style={{ maxWidth: 260 }}
                    onClick={(e) => { e.stopPropagation(); setZoomedMedia({ src: cnt, type: 'video' }); }}
                >
                    <video
                        src={cnt}
                        className="w-full object-cover block"
                        style={{ maxHeight: 320, minHeight: 100 }}
                        preload="metadata"
                        muted
                    />
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/30 group-hover/media:bg-black/45 transition-colors flex items-center justify-center">
                        <div className="p-3.5 bg-black/60 backdrop-blur-md rounded-full border border-white/20 group-hover/media:scale-110 transition-transform shadow-2xl">
                            <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8 ml-0.5">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                    {/* Video badge */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5">
                        <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                        </svg>
                        <span className="text-white text-[10px] font-semibold">Video</span>
                    </div>
                    {/* Download button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity shadow-lg"
                        title="Download"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        // ── DOCUMENT / FILE ──
        if (type === 'file') {
            const fileName = decodeURIComponent(cnt.split('/').pop() || 'File');
            const docInfo = getDocIcon(fileName);
            return (
                <div className="min-w-[220px] max-w-[260px]">
                    {/* File card */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl mb-0 ${isOwn ? 'bg-white/10' : 'bg-white/6'} border border-white/8`}>
                        {/* File type icon */}
                        <div className={`w-11 h-11 rounded-xl ${docInfo.bg} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                            <span className={`text-[10px] font-black tracking-tight ${docInfo.text}`}>{docInfo.icon}</span>
                        </div>
                        {/* File info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate leading-tight">{fileName}</p>
                            <p className="text-[10px] text-white/45 mt-0.5 uppercase tracking-wider">
                                {(fileName.split('.').pop() || 'file').toUpperCase()} · Document
                            </p>
                        </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-1.5 mt-2">
                        <a
                            href={cnt}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                isOwn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                            </svg>
                            Open
                        </a>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                isOwn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                        >
                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                            Download
                        </button>
                    </div>
                </div>
            );
        }
        if (type === 'poll') {
            try {
                const poll = JSON.parse(cnt);
                return (
                    <div className="flex flex-col gap-3 min-w-[220px] p-1">
                        <h4 className="font-bold text-sm text-white border-b border-white/10 pb-2">{poll.question}</h4>
                        <div className="space-y-2">
                            {poll.options.map((opt, i) => (
                                <button key={i} className="w-full bg-white/10 hover:bg-white/20 text-left px-3 py-2 rounded-lg text-xs transition-colors border border-white/5">
                                    {opt}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-white/40 italic">Tap an option to vote</p>
                    </div>
                );
            } catch { return <p className="italic text-xs opacity-60 text-red-400">Invalid poll data</p>; }
        }
        if (type === 'location' || type === 'live_location') {
            try {
                const loc = JSON.parse(cnt);
                const mapUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
                return (
                    <a href={mapUrl} target="_blank" rel="noreferrer" className="flex flex-col gap-2 min-w-[180px] group/loc">
                        <div className="bg-white/10 rounded-xl p-3 flex items-center gap-3 group-hover/loc:bg-white/20 transition-colors">
                            <div className={`p-2 ${type === 'live_location' ? 'bg-red-500/20 animate-pulse' : 'bg-green-500/20'} rounded-full`}>
                                <MapPinIcon className={`w-6 h-6 ${type === 'live_location' ? 'text-red-500' : 'text-green-500'}`} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white">{type === 'live_location' ? 'Live Location' : 'Location'}</p>
                                <p className="text-[10px] text-white/60">Tap to view on Map</p>
                            </div>
                        </div>
                    </a>
                );
            } catch { return <p className="italic text-xs opacity-60 text-red-400">Invalid location data</p>; }
        }
        if (type === 'contact') {
            try {
                const contact = JSON.parse(cnt);
                return (
                    <div className="min-w-[210px]">
                        <p className="text-xs uppercase tracking-wider text-white/50">Contact</p>
                        <p className="text-sm font-bold">{contact.name}</p>
                        <p className="text-xs text-white/70">{contact.phone}</p>
                    </div>
                );
            } catch { return <p className="text-sm">{cnt}</p>; }
        }
        if (type === 'sticker') {
            if (cnt.startsWith('http')) {
                return <img src={cnt} alt="sticker" className="w-24 h-24 object-contain py-1" />;
            }
            return <div className="text-5xl leading-none py-2">{cnt}</div>;
        }
        return <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{renderClickableText(cnt)}</p>;
    };

    const timestamp = (
        <span className={`text-[11px] select-none whitespace-nowrap ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
            {format(new Date(message.timestamp), 'HH:mm')}
        </span>
    );

    const ticks = isOwn && (
        <span className="flex items-center">
            {message.status === 'sending' ? (
                <ClockIcon className="w-3 h-3 text-white/55 animate-pulse" />
            ) : (
                <span className={`flex items-center ${message.status === 'read' ? 'text-[#53bdeb]' : 'text-gray-400'}`}>
                    <CheckIcon className={`w-3 h-3 ${message.status === 'sent' ? '' : '-mr-1.5'}`} />
                    {message.status !== 'sent' && <CheckIcon className="w-3 h-3" />}
                </span>
            )}
        </span>
    );

    return (
        <>
            <div
                className={`flex items-end gap-2 w-full ${isOwn ? 'flex-row-reverse' : 'flex-row'} mb-1`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    transform: `translateX(${swipeX}px)`,
                    transition: swiping ? 'none' : 'transform 0.2s ease'
                }}
            >
                {/* Swipe reply icon */}
                {Math.abs(swipeX) > 20 && (
                    <div className={`absolute ${isOwn ? 'right-2' : 'left-2'} flex items-center justify-center opacity-${Math.min(Math.round(Math.abs(swipeX) / SWIPE_THRESHOLD * 10) * 10, 100)}`}>
                        <ArrowUturnLeftIcon className="w-5 h-5 text-gray-400" />
                    </div>
                )}

                {/* Avatar for others in group */}
                {!isOwn && (
                    <div className="w-7 h-7 flex-shrink-0 mb-1">
                        {showAvatar && senderAvatar ? (
                            <img src={senderAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                            <div className="w-7 h-7" />
                        )}
                    </div>
                )}

                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%] md:max-w-[60%]`}>
                    {!isOwn && senderName && showAvatar && (
                        <span className="text-xs font-semibold text-blue-400 ml-3 mb-0.5">{senderName}</span>
                    )}

                    <div className="relative group/bubble flex items-end gap-1">
                        {/* Desktop reply button (hover) */}
                        <button
                            onClick={() => onReply && onReply(message)}
                            className={`opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-gray-300 mb-1 flex-shrink-0 ${isOwn ? 'order-first' : 'order-last'}`}
                        >
                            <ArrowUturnLeftIcon className="w-4 h-4" />
                        </button>

                        {/* 3-dot button (desktop hover) */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowActionMenu(true); }}
                            className={`opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-gray-200 mb-1 flex-shrink-0 ${isOwn ? 'order-first' : 'order-last'}`}
                            title="More actions"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
                            </svg>
                        </button>

                        {/* The bubble itself */}
                        <div
                            onClick={handleBubbleClick}
                            className={`relative ${isMedia ? 'p-1' : 'px-3 py-2'} rounded-2xl shadow-sm cursor-pointer select-none
                                ${isOwn
                                    ? 'bg-[#005c4b] text-white rounded-tr-sm'
                                    : 'bg-[#202c33] text-gray-100 rounded-tl-sm'
                                }`}
                        >
                            {/* Reply preview */}
                            {replyTo && (
                                <div className={`mb-1 px-2 py-1 rounded-lg border-l-4 ${isOwn ? 'border-green-300 bg-white/10' : 'border-blue-400 bg-white/5'} text-xs text-gray-300 max-w-[240px] flex items-center justify-between gap-2 bg-black/20`}>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-blue-300 truncate">{replyTo.senderName || 'Message'}</p>
                                        <p className="truncate opacity-80">
                                            {replyTo.senderName === 'Status' ? 'Status' : (replyTo.type && replyTo.type !== 'text' ? `📎 ${replyTo.type}` : replyTo.content)}
                                        </p>
                                    </div>
                                    {replyTo.senderName === 'Status' && replyTo.content && (
                                        <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-black/40">
                                            {replyTo.content.match(/\.(mp4|webm|ogg)$/i) ? (
                                                <video src={replyTo.content} className="w-full h-full object-cover" muted />
                                            ) : (
                                                <img src={replyTo.content} alt="" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {message.isPinned && (
                                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-yellow-300 flex items-center gap-1">
                                    📌 Pinned
                                </div>
                            )}

                            {isDeleted ? (
                                <p className="text-sm italic text-white/55">This message was deleted</p>
                            ) : (
                                renderContent(content, message.type)
                            )}

                            {/* Translation container */}
                            {((showTranslatorMenu || translatedText || isTranslating) && isTextMessage) && (
                                <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-200 min-w-[140px] font-sans">
                                    {isTranslating ? (
                                        <div className="flex items-center gap-1.5 py-1 opacity-70">
                                            <span className="animate-spin rounded-full h-3 w-3 border border-white/30 border-t-white" />
                                            <span>Translating...</span>
                                        </div>
                                    ) : translatedText ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-2 opacity-60 text-[10px]">
                                                <span>Translated ({LANGUAGES.find(l => l.code === targetLang)?.name || targetLang}):</span>
                                                <button
                                                    onClick={() => { setTranslatedText(''); setLocalTargetLang(''); setShowTranslatorMenu(false); }}
                                                    className="hover:text-white"
                                                >
                                                    Hide
                                                </button>
                                            </div>
                                            <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap text-green-300 font-medium font-sans">
                                                {translatedText}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 py-1">
                                            <select
                                                value={targetLang}
                                                onChange={(e) => {
                                                    setLocalTargetLang(e.target.value);
                                                    localStorage.setItem('preferred_translation_language', e.target.value);
                                                }}
                                                className="bg-[#111b21] text-[11px] text-white px-1.5 py-0.5 rounded border border-gray-600 outline-none cursor-pointer"
                                            >
                                                {LANGUAGES.map(lang => (
                                                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleTranslateMessage}
                                                className="bg-signal-accent hover:bg-signal-accentHover text-white px-2 py-0.5 rounded font-bold text-[10px] active:scale-95"
                                            >
                                                Translate
                                            </button>
                                            <button
                                                onClick={() => setShowTranslatorMenu(false)}
                                                className="text-gray-400 hover:text-white text-[10px] ml-auto"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMedia ? 'absolute bottom-2 right-2 bg-black/40 rounded-full px-1.5 py-0.5' : ''}`}>
                                {timestamp}
                                {message.editedAt && <span className={`text-[10px] ${isOwn ? 'text-white/50' : 'text-gray-500'}`}>edited</span>}
                                {ticks}
                            </div>

                            {Object.keys(message.reactions || {}).length > 0 && (
                                <div className={`absolute -bottom-5 ${isOwn ? 'left-2' : 'right-2'} rounded-full bg-[#111b21] px-2 py-0.5 text-xs shadow border border-white/10`}>
                                    {Object.values(message.reactions).join(' ')}
                                </div>
                            )}

                            {isOwn && message.readAt && (
                                <div className="mt-1 text-right text-[10px] text-[#53bdeb]">
                                    Seen {format(new Date(message.readAt), 'HH:mm')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {zoomedMedia && (
                    <FullscreenMediaModal
                        src={zoomedMedia.src}
                        type={zoomedMedia.type}
                        onClose={() => setZoomedMedia(null)}
                    />
                )}
            </div>

            {/* WhatsApp-style action menu overlay */}
            {showActionMenu && (
                <MessageActionMenu
                    message={message}
                    isOwn={isOwn}
                    isTextMessage={isTextMessage}
                    isDeleted={isDeleted}
                    onClose={() => setShowActionMenu(false)}
                    onReply={() => onReply && onReply(message)}
                    onEdit={() => onEdit && onEdit(message)}
                    onCopy={() => onCopy && onCopy(message)}
                    onForward={() => onForward && onForward(message)}
                    onReact={(emoji) => onReact && onReact(message, emoji)}
                    onPin={() => onPin && onPin(message)}
                    onDelete={() => onDelete && onDelete(message.id)}
                    onInfo={() => setShowInfoModal(true)}
                    onTranslate={() => { setShowTranslatorMenu(true); }}
                />
            )}

            {/* Message Info Modal */}
            {showInfoModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
                    onClick={() => setShowInfoModal(false)}
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-2xl bg-[#111b21] border border-white/10 shadow-2xl p-6 relative animate-scale-up text-white"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <InformationCircleIcon className="w-5 h-5 text-[#53bdeb]" />
                                Message Info
                            </h3>
                            <button
                                onClick={() => setShowInfoModal(false)}
                                className="p-1 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5 max-h-32 overflow-y-auto">
                                <p className="text-xs text-white/50 mb-1">Message Preview</p>
                                <p className="text-sm whitespace-pre-wrap break-words">{isDeleted ? 'Deleted message' : message.content}</p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <span className="text-xs text-white/60">Sent</span>
                                    <span className="text-xs font-medium text-white/90">
                                        {message.timestamp ? format(new Date(message.timestamp), 'd MMM yyyy, HH:mm:ss') : 'N/A'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <span className="text-xs text-white/60">Delivered</span>
                                    <span className="text-xs font-medium text-white/90">
                                        {message.deliveredAt ? (
                                            format(new Date(message.deliveredAt), 'd MMM yyyy, HH:mm:ss')
                                        ) : (
                                            message.status === 'sent' ? (
                                                <span className="text-white/40">Pending</span>
                                            ) : (
                                                message.status === 'delivered' || message.status === 'read' ? 'Yes' : 'N/A'
                                            )
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <span className="text-xs text-white/60">Seen / Read</span>
                                    <span className="text-xs font-medium text-white/90">
                                        {message.readAt ? (
                                            <span className="text-[#53bdeb] font-semibold flex items-center gap-1">
                                                {format(new Date(message.readAt), 'd MMM yyyy, HH:mm:ss')}
                                            </span>
                                        ) : (
                                            <span className="text-white/40">Unread</span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowInfoModal(false)}
                                className="px-4 py-2 bg-[#53bdeb] hover:bg-[#40a3ce] text-black font-semibold rounded-lg text-xs transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const MiniGameCard = ({ game, isOwn }) => {
    const [score, setScore] = useState(0);
    return (
        <div className="min-w-[210px] space-y-2">
            <p className="text-xs uppercase tracking-wider text-white/50">Mini game</p>
            <div className={`rounded-xl p-3 ${isOwn ? 'bg-white/10' : 'bg-blue-500/10'}`}>
                <p className="text-sm font-bold">{game || 'Tap Race'}</p>
                <button onClick={() => setScore(s => s + 1)} className="mt-2 w-full rounded-lg bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25">
                    Tap score: {score}
                </button>
            </div>
        </div>
    );
};

export const DateSeparator = ({ date }) => {
    const label = isToday(new Date(date))
        ? 'Today'
        : isYesterday(new Date(date))
            ? 'Yesterday'
            : format(new Date(date), 'dd MMM yyyy');

    return (
        <div className="flex items-center justify-center my-3">
            <span className="bg-[#182229] text-gray-400 text-xs px-3 py-1 rounded-full shadow">
                {label}
            </span>
        </div>
    );
};

export default ChatBubble;
