import React, { useState, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { TrashIcon, DocumentIcon, ArrowUturnLeftIcon, ArrowDownTrayIcon, ClipboardDocumentIcon, ForwardIcon, PencilSquareIcon, EllipsisVerticalIcon, MapPinIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import FullscreenMediaModal from './FullscreenMediaModal';

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
    const regex = /(https?:\/\/[^\s]+)|(www\.[a-zA-Z0-9-]+\.[^\s]+)|([a-zA-Z0-9-]+\.(?:com|net|org|in|co|io|xyz|info|us|app|dev|me|ai)\b[^\s]*)|(\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})|(\b\d{10}\b)/gi;
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
        
        // Match group 1, 2, or 3 means it's a URL
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
                    href={`tel:${matchText.replace(/[-.\s()]/g, '')}`}
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

const ChatBubble = ({ 
    message, isOwn, senderName, onDelete, senderAvatar, showAvatar, 
    onReply, replyTo, onTranslate, chatId, chatTranslationLang,
    onEdit, onCopy, onForward, onReact, onPin
}) => {
    const [showDelete, setShowDelete] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [swipeX, setSwipeX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const [zoomedMedia, setZoomedMedia] = useState(null);
    
    const [translatedText, setTranslatedText] = useState('');
    const [showTranslatorMenu, setShowTranslatorMenu] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    
    // localTargetLang acts as a manual override for this specific message bubble
    const [localTargetLang, setLocalTargetLang] = useState('');
    const targetLang = localTargetLang || chatTranslationLang || localStorage.getItem('preferred_translation_language') || 'en';
    
    const touchStartX = useRef(null);
    const content = message.content || '';
    const isDeleted = message.type === 'deleted' || message.deletedAt;

    const isMedia = ['image', 'video'].includes(message.type) ||
        content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg)$/i);

    const isTextMessage = (!message.type || message.type === 'text') && !isMedia;

    React.useEffect(() => {
        const autoTranslate = async () => {
            if (!isTextMessage || !content || !onTranslate || !chatId) {
                setTranslatedText('');
                return;
            }
            // Auto translate if chatTranslationLang is active and message is incoming (!isOwn)
            // Or if localTargetLang (manual bubble translation) is set
            const activeLang = localTargetLang || ( (!isOwn) ? chatTranslationLang : '' );
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
            // Fallback: open in new tab
            window.open(url, '_blank');
        }
    };

    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
        setSwiping(true);
    };

    const handleTouchMove = (e) => {
        if (touchStartX.current === null) return;
        const diff = e.touches[0].clientX - touchStartX.current;
        // own messages: swipe left (negative), others: swipe right (positive)
        if (isOwn && diff < 0) setSwipeX(Math.max(diff, -SWIPE_THRESHOLD));
        else if (!isOwn && diff > 0) setSwipeX(Math.min(diff, SWIPE_THRESHOLD));
    };

    const handleTouchEnd = () => {
        if (Math.abs(swipeX) >= SWIPE_THRESHOLD - 5) {
            onReply && onReply(message);
        }
        setSwipeX(0);
        setSwiping(false);
        touchStartX.current = null;
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
        if (type === 'image' || cnt.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return (
                <div className="relative group/media">
                    <img
                        src={cnt}
                        alt="sent"
                        className="rounded-xl max-w-[260px] max-h-[300px] w-full object-cover cursor-pointer block"
                        onClick={() => setZoomedMedia({ src: cnt, type: 'image' })}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity"
                        title="Download Image"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        if (type === 'audio' || cnt.match(/\.(mp3|wav|m4a|aac|oga|webm)$/i)) {
            return (
                <div className="flex min-w-[240px] flex-col gap-2">
                    <audio controls src={cnt} className="w-full h-9 accent-blue-500" preload="metadata" />
                    <div className="flex items-center justify-between text-[10px] text-white/55">
                        <span>Voice message</span>
                        <span>Drag the bar to seek</span>
                    </div>
                    <button
                        onClick={() => handleDownload(cnt)}
                        className="text-[10px] text-white/60 hover:text-white flex items-center gap-1 self-end px-1"
                    >
                        <ArrowDownTrayIcon className="w-3 h-3" /> Download
                    </button>
                </div>
            );
        }
        if (type === 'video' || cnt.match(/\.(mp4|webm|ogg)$/i)) {
            return (
                <div 
                    className="relative group/media cursor-pointer rounded-xl overflow-hidden"
                    onClick={() => setZoomedMedia({ src: cnt, type: 'video' })}
                >
                    <video src={cnt} className="rounded-xl max-w-[260px] max-h-[300px] w-full object-cover block" preload="metadata" />
                    
                    {/* Play Icon Overlay */}
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover/media:bg-black/35 transition-colors">
                        <div className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white group-hover/media:scale-110 transition-transform shadow-lg border border-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 fill-white">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                            </svg>
                        </div>
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity"
                        title="Download Video"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                </div>
            );
        }
        if (type === 'file') {
            const fileName = cnt.split('/').pop() || 'File';
            return (
                <div className="flex flex-col gap-1">
                    <a href={cnt} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-w-[180px]">
                        <div className={`p-2 rounded-lg ${isOwn ? 'bg-white/20' : 'bg-blue-500/20'}`}>
                            <DocumentIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-white">{fileName}</p>
                            <p className="text-xs opacity-60">Tap to open</p>
                        </div>
                    </a>
                    <button
                        onClick={() => handleDownload(cnt)}
                        className="text-[10px] text-white/60 hover:text-white flex items-center gap-1 self-end px-1"
                    >
                        <ArrowDownTrayIcon className="w-3 h-3" /> Download
                    </button>
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
        if (type === 'game') {
            return <MiniGameCard game={cnt} isOwn={isOwn} />;
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
        <div
            className={`flex items-end gap-2 w-full ${isOwn ? 'flex-row-reverse' : 'flex-row'} mb-1`}
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
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
                    {/* Desktop reply button */}
                    <button
                        onClick={() => onReply && onReply(message)}
                        className={`opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-gray-300 mb-1 flex-shrink-0 ${isOwn ? 'order-first' : 'order-last'}`}
                    >
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                    </button>

                    {!isDeleted && isTextMessage && (
                        <button
                            onClick={() => setShowTranslatorMenu(v => !v)}
                            className={`opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-blue-400 mb-1 flex-shrink-0 ${isOwn ? 'order-first' : 'order-last'}`}
                            title="Translate"
                        >
                            <GlobeIcon className="w-4 h-4" />
                        </button>
                    )}

                    {isOwn && showDelete && onDelete && !isDeleted && (
                        <button
                            onClick={() => onDelete(message.id)}
                            className="opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 text-gray-500 hover:text-red-400 mb-1 flex-shrink-0"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}

                    <div 
                        onMouseEnter={() => setShowReactions(true)}
                        onMouseLeave={() => setShowReactions(false)}
                        onClick={(e) => {
                            if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && !e.target.closest('button') && !e.target.closest('select') && !e.target.closest('a')) {
                                setShowReactions(v => !v);
                            }
                        }}
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
                            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-yellow-300">Pinned</div>
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

                        {showReactions && (
                            <div className={`absolute z-30 -top-10 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 rounded-full bg-[#111b21] p-1 shadow-xl border border-white/10`}>
                                {QUICK_REACTIONS.map(emoji => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => { onReact?.(message, emoji); setShowReactions(false); }}
                                        className="h-8 w-8 rounded-full hover:bg-white/10 text-lg"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}

                        {showActions && (
                            <div className={`absolute z-40 top-8 ${isOwn ? 'right-0' : 'left-0'} w-44 overflow-hidden rounded-xl bg-[#111b21] shadow-2xl border border-white/10`}>
                                <ActionRow icon={<ClipboardDocumentIcon className="w-4 h-4" />} label="Copy" onClick={() => { onCopy?.(message); setShowActions(false); }} />
                                <ActionRow icon={<ForwardIcon className="w-4 h-4" />} label="Forward" onClick={() => { onForward?.(message); setShowActions(false); }} />
                                <ActionRow icon={<span className="text-sm">😊</span>} label="React" onClick={() => { setShowReactions(true); setShowActions(false); }} />
                                <ActionRow icon={<span className="text-sm">📌</span>} label={message.isPinned ? 'Unpin' : 'Pin'} onClick={() => { onPin?.(message); setShowActions(false); }} />
                                {isOwn && isTextMessage && <ActionRow icon={<PencilSquareIcon className="w-4 h-4" />} label="Edit" onClick={() => { onEdit?.(message); setShowActions(false); }} />}
                                <ActionRow icon={<InformationCircleIcon className="w-4 h-4" />} label="Info" onClick={() => { setShowInfoModal(true); setShowActions(false); }} />
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
                            {/* Preview Message content */}
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5 max-h-32 overflow-y-auto">
                                <p className="text-xs text-white/50 mb-1">Message Preview</p>
                                <p className="text-sm whitespace-pre-wrap break-words">{isDeleted ? 'Deleted message' : message.content}</p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/60">Sent</span>
                                    </div>
                                    <span className="text-xs font-medium text-white/90">
                                        {message.timestamp ? format(new Date(message.timestamp), 'd MMM yyyy, HH:mm:ss') : 'N/A'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/60">Delivered</span>
                                    </div>
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
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/60">Seen / Read</span>
                                    </div>
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
        </div>
    );
};

const ActionRow = ({ icon, label, onClick }) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 hover:bg-white/10">
        {icon}
        <span>{label}</span>
    </button>
);

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
