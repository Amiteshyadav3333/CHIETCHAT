import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { ArrowUturnLeftIcon, ArrowDownTrayIcon, MapPinIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import FullscreenMediaModal from './FullscreenMediaModal';
import BirthdayCard from './BirthdayCard';
import { MiniGameCard } from './ChatGames';
import { buildMapUrl, normalizeCoordinates } from '../utils/locationPrivacy';
import { getSafeHttpUrl, getSafeMediaUrl, openSafeExternal } from '../utils/safeUrl';
import { saveMediaToDevice } from '../utils/mediaDownload';

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
    const regex = /(https?:\/\/[^\s]+)|(www\.[a-zA-Z0-9-]+\.[^\s]+)|([a-zA-Z0-9-]+\.(?:com|net|org|in|co|io|xyz|info|us|app|dev|me|ai)\b[^\s]*)|(\+?\d{1,3}[-. s]?\(?\d{3}\)?[-. s]?\d{3}[-. s]?\d{4})|(\b\d{10}\b)/gi;
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
                    href={`tel:${matchText.replace(/[-. s()]/g, '')}`}
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

const ClockIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

const SWIPE_THRESHOLD = 60;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const parseDrawing = content => {
    let drawing;
    try { drawing = typeof content === 'string' ? JSON.parse(content) : content; } catch { drawing = null; }
    return drawing?.actions?.length ? drawing : null;
};

export const isChatOverlayDrawing = content => parseDrawing(content)?.presentation === 'chat-overlay';

const DrawingArtwork = ({ drawing, className = 'aspect-square w-full', markerId = 'drawing-arrow' }) => {
    const safeColor = value => /^#[0-9a-f]{3,8}$/i.test(String(value)) ? value : '#ffffff';
    const actions = drawing.actions.slice(0, 500);
    const safeBackground = drawing.background?.src && /^(https?:\/\/|\/uploads\/)/i.test(drawing.background.src) ? drawing.background : null;
    const chatBackground = drawing.background?.type === 'chat' ? {
        senderName: String(drawing.background.senderName || 'Chat message').slice(0, 80),
        text: String(drawing.background.text || drawing.background.messageType || 'Message').slice(0, 600),
        timestamp: String(drawing.background.timestamp || '').slice(0, 40),
    } : null;
    const erasers = actions.filter(action => action.tool === 'eraser');
    const visibleActions = actions.filter(action => action.tool !== 'eraser');
    const drawingMaskId = `${markerId}-mask`;
    return <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className={className} role="img" aria-label="Chat drawing">
            <defs><marker id={markerId} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="context-stroke" /></marker></defs>
            {safeBackground && (safeBackground.type === 'video' ? <foreignObject x="0" y="0" width="1000" height="1000"><video xmlns="http://www.w3.org/1999/xhtml" src={safeBackground.src} muted className="h-full w-full object-cover" /></foreignObject> : <image href={safeBackground.src} width="1000" height="1000" preserveAspectRatio="xMidYMid slice" />)}
            {chatBackground && <foreignObject x="45" y="160" width="910" height="680"><div xmlns="http://www.w3.org/1999/xhtml" style={{ height: '100%', boxSizing: 'border-box', borderRadius: 42, padding: 55, background: 'linear-gradient(145deg,#202c33,#111b21)', border: '4px solid rgba(255,255,255,.14)', color: 'white', fontFamily: 'system-ui', overflow: 'hidden' }}><div style={{ color: '#53bdeb', fontSize: 34, fontWeight: 800, marginBottom: 28 }}>{chatBackground.senderName}</div><div style={{ fontSize: 48, lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{chatBackground.text}</div>{chatBackground.timestamp && <div style={{ position: 'absolute', right: 65, bottom: 45, color: '#94a3b8', fontSize: 25 }}>{new Date(chatBackground.timestamp).toLocaleString()}</div>}</div></foreignObject>}
            <defs><mask id={drawingMaskId}><rect width="1000" height="1000" fill="white" />{erasers.map((action, index) => <polyline key={index} points={(action.points || []).map(point => `${Number(point.x) || 0},${Number(point.y) || 0}`).join(' ')} fill="none" stroke="black" strokeWidth={Math.max(24, (Number(action.size) || 5) * 12)} strokeLinecap="round" strokeLinejoin="round" />)}</mask></defs>
            <g mask={`url(#${drawingMaskId})`}>{visibleActions.map((action, index) => {
                if (action.tool === 'text') return <text key={index} x={Number(action.x) || 500} y={Number(action.y) || 500} textAnchor="middle" fill={safeColor(action.color)} fontSize={Math.max(35, Math.min(140, Number(action.size) * 10 || 50))} fontWeight="700">{String(action.text || '').slice(0, 240)}</text>;
                const points = (action.points || []).slice(0, 2000).map(point => `${Math.max(0, Math.min(1000, Number(point.x) || 0))},${Math.max(0, Math.min(1000, Number(point.y) || 0))}`).join(' ');
                if (action.tool === 'arrow') return <polyline key={index} points={points} fill="none" stroke={safeColor(action.color)} strokeWidth={Math.max(4, action.size * 2)} strokeLinecap="round" markerEnd={`url(#${markerId})`} />;
                return <polyline key={index} points={points} fill="none" stroke={safeColor(action.color)} strokeWidth={action.tool === 'highlighter' ? action.size * 8 : action.size * 2} strokeLinecap="round" strokeLinejoin="round" opacity={action.tool === 'highlighter' ? 0.35 : 1} />;
            })}</g>
        </svg>;
};

export const ChatDrawingOverlay = ({ content, messageId, isOwn = false, onDelete }) => {
    const drawing = parseDrawing(content);
    if (!drawing || drawing.presentation !== 'chat-overlay') return null;
    return <div className="pointer-events-none relative z-20 h-0 w-full overflow-visible" aria-label="Drawing on chat">
        <DrawingArtwork drawing={drawing} markerId={`chat-overlay-arrow-${messageId || 'latest'}`} className="absolute bottom-0 left-0 h-[min(68vh,620px)] w-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]" />
        {isOwn && onDelete && <button type="button" onClick={() => onDelete(messageId)} className="pointer-events-auto absolute bottom-2 right-2 rounded-full border border-red-300/30 bg-black/70 px-3 py-1.5 text-[10px] font-bold text-red-200 shadow-lg backdrop-blur" aria-label="Delete drawing">Delete drawing</button>}
    </div>;
};

export const DrawingMessage = ({ content }) => {
    const drawing = parseDrawing(content);
    if (!drawing) return <p className="text-sm italic text-white/60">Drawing unavailable</p>;
    return <div className="w-[260px] max-w-[68vw] overflow-hidden rounded-xl border border-white/10 bg-[#111827]">
        <DrawingArtwork drawing={drawing} />
        {drawing.caption && <p className="border-t border-white/10 px-3 py-2 text-sm text-white">{drawing.caption}</p>}
    </div>;
};

// ── Full Emoji Picker Data ──
const EMOJI_CATEGORIES = [
    {
        label: 'Smileys', icon: '😊',
        emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😶‍🌫️','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','😵‍💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖']
    },
    {
        label: 'People', icon: '👋',
        emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','🧔‍♂️','🧔‍♀️','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🫅','🤴','👸','👰','🤵','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🧌','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴️','👫','👬','👭','💑','👨‍👩‍👦','👪']
    },
    {
        label: 'Nature', icon: '🌿',
        emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🪸','🐡','🐠','🐟','🐬','🦭','🐳','🐋','🦈','🦦','🦥','🐾','🐉','🌵','🌲','🌳','🌴','🪴','🌱','🌿','☘️','🍀','🎋','🎍','🍃','🍂','🍁','🪺','🪹','🌾','🌺','🌻','🌹','🥀','🌷','🌸','💐','🍄','🌰','🦔']
    },
    {
        label: 'Food', icon: '🍕',
        emojis: ['🍏','🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🫘','🌽','🥕','🧆','🧇','🥞','🧈','🍳','🥚','🧀','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🫖','🧉','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🧊']
    },
    {
        label: 'Activities', icon: '⚽',
        emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏏','🪃','🥅','⛳','🪁','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪃','🎱','🎮','🕹️','🎰','🎲','♟️','🧩','🪅','🎭','🎨','🖼️','🎪','🤹','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎵','🎶','🎙️','🎚️','🎛️','📻','🎟️','🎫','🎗️','🎀','🎁','🎊','🎉','🎈','🎏','🎐','🧧','🎑']
    },
    {
        label: 'Travel', icon: '✈️',
        emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🛷','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','⚓','🚢','✈️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🚀','🛸','🛰️','🪐','🌍','🌎','🌏','🗺️','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🗾','🎠','🎡','🎢','💈','⛲','⛺','🌁','🌃','🌄','🌅','🌆','🌇','🌉','🎇','🎆','🌌','🌠']
    },
    {
        label: 'Objects', icon: '💡',
        emojis: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','🧮','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💰','💵','💴','💶','💷','💸','💳','🪙','💹','📈','📉','📊','📋','📌','📍','✂️','🖊️','🖋️','✒️','📝','📏','📐','🗃️','🗄️','🗑️','🔒','🔓','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🛡️','🔧','🔩','⚙️','🗜️','🔗','⛓️','🧰','🪝','🧲','🪜','🧪','🧫','🧬','🔬','🔭','📡','💉','🩸','💊','🩹','🩺','🏷️','🧹','🪣','🧺','🧻','🪠','🧼','🫧','🪥','🧽','🧴','🛒']
    },
    {
        label: 'Symbols', icon: '❤️',
        emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','🔯','🪬','🧿','✡️','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','🔱','⚜️','🔰','♻️','✅','🈯','💹','❎','🌐','🔀','🔁','🔂','▶️','⏩','⏭️','⏯️','◀️','⏪','⏮️','🔼','⏫','🔽','⏬','⏸️','⏹️','⏺️','🎦','🔊','🔔','📣','🔕','🔇','🔈','🔉','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🀄','🎴']
    }
];

// Full Emoji Picker Panel component
const EmojiPickerPanel = ({ onSelect, onClose }) => {
    const [activeTab, setActiveTab] = useState(0);
    const [search, setSearch] = useState('');
    const panelRef = useRef(null);

    const filteredEmojis = search
        ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(search))
        : EMOJI_CATEGORIES[activeTab]?.emojis || [];

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div
            ref={panelRef}
            className="flex flex-col bg-[#1a2634] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: 320, maxHeight: 420, animation: 'scaleInMenu 0.18s cubic-bezier(0.34,1.56,0.64,1) both' }}
            onClick={e => e.stopPropagation()}
        >
            {/* Search bar */}
            <div className="px-3 pt-3 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-xl px-3 py-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-white/40 flex-shrink-0">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search emoji..."
                        className="bg-transparent text-white text-sm outline-none flex-1 placeholder-white/30"
                        autoFocus
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-white/40 hover:text-white/80">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Category tabs */}
            {!search && (
                <div className="flex gap-0 px-2 flex-shrink-0 border-b border-white/8 overflow-x-auto scrollbar-hide">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                        <button
                            key={cat.label}
                            onClick={() => setActiveTab(i)}
                            title={cat.label}
                            className={`flex-shrink-0 px-2 py-2 text-lg transition-all relative ${
                                activeTab === i
                                    ? 'opacity-100'
                                    : 'opacity-50 hover:opacity-80'
                            }`}
                        >
                            {cat.icon}
                            {activeTab === i && (
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#25d366] rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto p-2">
                {search && (
                    <p className="text-white/30 text-xs px-1 pb-2">{filteredEmojis.length} results</p>
                )}
                {!search && (
                    <p className="text-white/30 text-xs px-1 pb-2 font-medium">{EMOJI_CATEGORIES[activeTab]?.label}</p>
                )}
                <div className="grid grid-cols-8 gap-0.5">
                    {filteredEmojis.map((emoji, i) => (
                        <button
                            key={`${emoji}-${i}`}
                            type="button"
                            onClick={() => { onSelect(emoji); onClose(); }}
                            className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-white/15 active:scale-90 transition-all"
                            title={emoji}
                        >
                            {emoji}
                        </button>
                    ))}
                    {filteredEmojis.length === 0 && (
                        <div className="col-span-8 py-6 text-center text-white/30 text-sm">No emojis found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const InlineAudioPlayer = ({ src, isOwn, onOpen }) => {
    const audioRef = useRef(null);
    const progressRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const bars = [0.3,0.6,0.9,0.7,0.4,0.8,0.5,0.95,0.6,0.3,0.7,0.8,0.4,0.6,0.9,0.5,0.7,0.4,0.8,0.6,0.3,0.9,0.7,0.5,0.6,0.4,0.8,0.7,0.3,0.6];

    const displayTime = (sec) => {
        if (!sec || sec === Infinity || isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        
        const updateDur = () => {
            if (a.duration && a.duration !== Infinity && !isNaN(a.duration)) {
                setDuration(a.duration);
            }
        };

        const onMeta = () => {
            if (a.duration === Infinity) {
                // Workaround for Chrome webm duration bug
                a.currentTime = 1e101;
                a.addEventListener('timeupdate', function getDuration() {
                    a.removeEventListener('timeupdate', getDuration);
                    if (a.duration !== Infinity && !isNaN(a.duration)) {
                        setDuration(a.duration);
                    }
                    a.currentTime = 0;
                });
            } else {
                updateDur();
            }
        };
        const onTime = () => {
            setCurrentTime(a.currentTime);
            updateDur();
        };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };

        a.addEventListener('loadedmetadata', onMeta);
        a.addEventListener('timeupdate', onTime);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnd);

        if (a.readyState >= 1) {
            updateDur();
        }

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
        if (audioRef.current && duration > 0) {
            audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
        }
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
        <div className="flex items-center gap-2.5 min-w-[220px] max-w-[270px] py-0.5 font-sans">
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
                    <span className="text-[10px] font-mono tabular-nums text-white/60">
                        {displayTime(isPlaying || currentTime > 0 ? currentTime : duration)}
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
const MessageActionMenu = ({ message, isOwn, isTextMessage, isDeleted, onClose, onReply, onEdit, onCopy, onForward, onReact, onPin, onDelete, onInfo, onTranslate, onDownload, onPhotoReply, onMakeSticker, onPlaceSticker, onAnnotateMessage, isLastMessage, showTranslateBtn = true, protectedMode = false }) => {
    const menuRef = useRef(null);
    const [showFullPicker, setShowFullPicker] = useState(false);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') { if (showFullPicker) setShowFullPicker(false); else onClose(); } };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose, showFullPicker]);

    const actions = [
        { icon: '↩️', label: 'Reply', onClick: () => { onReply?.(); onClose(); } },
        ...(isOwn && isTextMessage && !isDeleted && isLastMessage ? [{ icon: '✏️', label: 'Edit', onClick: () => { onEdit?.(); onClose(); } }] : []),
        ...(!isDeleted ? [{ icon: '📌', label: message.isPinned ? 'Unpin' : 'Pin', onClick: () => { onPin?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode ? [{ icon: '📋', label: 'Copy', onClick: () => { onCopy?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode ? [{ icon: '➡️', label: 'Forward', onClick: () => { onForward?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode ? [{ icon: '✎', label: 'Draw / point on message', onClick: () => { onAnnotateMessage?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode && message.type === 'image' ? [{ icon: '📷', label: 'Reply with photo', onClick: () => { onPhotoReply?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode && message.type === 'image' ? [{ icon: '✨', label: 'Make sticker', onClick: () => { onMakeSticker?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode ? [{ icon: '📍', label: 'Place saved sticker here', onClick: () => { onPlaceSticker?.(); onClose(); } }] : []),
        ...(!isDeleted && !protectedMode && message.type === 'image' ? [{ icon: '⬇️', label: 'Download photo', onClick: () => { onDownload?.(); onClose(); } }] : []),
        ...(!isDeleted && isTextMessage && showTranslateBtn ? [{ icon: '🌐', label: 'Translate', onClick: () => { onTranslate?.(); onClose(); } }] : []),
        { icon: 'ℹ️', label: 'Info', onClick: () => { onInfo?.(); onClose(); } },
        ...(!isDeleted ? [{ icon: '🗑️', label: 'Delete', danger: true, onClick: () => { onDelete?.(); onClose(); } }] : []),
    ];

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center"
            onClick={() => { if (showFullPicker) { setShowFullPicker(false); } else { onClose(); } }}
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
        >
            {/* Full emoji picker — shown on top */}
            {showFullPicker && (
                <div className="absolute z-[90]" style={{ bottom: '50%', marginBottom: 8 }}>
                    <EmojiPickerPanel
                        onSelect={(emoji) => { onReact?.(emoji); onClose(); }}
                        onClose={() => setShowFullPicker(false)}
                    />
                </div>
            )}

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

                {/* Quick reactions + "+" button row */}
                {!isDeleted && (
                    <div className="flex items-center px-2 py-2.5 border-b border-white/8 bg-white/3 gap-1">
                        {QUICK_REACTIONS.map(emoji => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => { onReact?.(emoji); onClose(); }}
                                className="flex-1 flex items-center justify-center text-2xl py-1 rounded-xl hover:bg-white/12 active:scale-90 transition-all duration-150"
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                        {/* + button — opens full picker */}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowFullPicker(prev => !prev); }}
                            className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-150 border ${
                                showFullPicker
                                    ? 'bg-[#25d366]/20 border-[#25d366]/40 text-[#25d366]'
                                    : 'bg-white/8 border-white/10 text-white/60 hover:bg-white/15 hover:text-white'
                            }`}
                            title="More emoji"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                                <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
                            </svg>
                        </button>
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
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};


const ChatBubble = ({
    message, isOwn, senderName, onDelete, senderAvatar, showAvatar,
    onReply, replyTo, onTranslate, chatId, chatTranslationLang,
    onEdit, onCopy, onForward, onReact, onPin, isLastMessage,
    socket, token, showTranslateBtn = true, onAnnotate, onPhotoReply, onMakeSticker, onPlaceSticker, snapMode = false
}) => {
    const [, forceColourRefresh] = useState(0);
    useEffect(() => { const refresh = () => forceColourRefresh(value => value + 1); window.addEventListener('cheetchat-colour-updated', refresh); return () => window.removeEventListener('cheetchat-colour-updated', refresh); }, []);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showTranslatorMenu, setShowTranslatorMenu] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [paymentUpdate, setPaymentUpdate] = useState(null);
    const [paymentBusy, setPaymentBusy] = useState(false);

    const requestRefund = async (paymentId) => {
        setPaymentBusy(true);
        try {
            const { data } = await axios.post(
                `/api/payments/orders/${paymentId}/refund-request`, {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setPaymentUpdate(data);
        } catch (error) {
            alert(error.response?.data?.error || 'Refund request could not be submitted.');
        } finally {
            setPaymentBusy(false);
        }
    };

    const refreshPayment = async (paymentId) => {
        setPaymentBusy(true);
        try {
            const { data } = await axios.get(`/api/payments/orders/${paymentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPaymentUpdate(data);
        } catch (error) {
            alert(error.response?.data?.error || 'Payment status could not be loaded.');
        } finally {
            setPaymentBusy(false);
        }
    };

    const approveRefund = async (paymentId) => {
        if (!window.confirm('Approve a full refund for this payment?')) return;
        setPaymentBusy(true);
        try {
            const { data } = await axios.post(`/api/payments/orders/${paymentId}/refund`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPaymentUpdate(data);
        } catch (error) {
            alert(error.response?.data?.error || 'Refund could not be processed.');
        } finally {
            setPaymentBusy(false);
        }
    };

    const getReactions = () => {
        let reactions = message.reactions;
        if (!reactions) return {};
        if (typeof reactions === 'string') {
            try {
                return JSON.parse(reactions);
            } catch (e) {
                return {};
            }
        }
        return reactions;
    };
    const reactionsObj = getReactions();

    // Group reactions by emoji
    const groupedReactions = {};
    const stickerReactions = [];

       Object.values(reactionsObj).forEach((emoji) => {
          if (String(emoji).startsWith('sticker:')) stickerReactions.push(String(emoji).slice(8));
          else groupedReactions[emoji] = (groupedReactions[emoji] || 0) + 1;
    });

    const hasReactions = Object.keys(groupedReactions).length > 0 || stickerReactions.length > 0;
    const [swipeX, setSwipeX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const [zoomedMedia, setZoomedMedia] = useState(null);
    const [videoNoteExpanded, setVideoNoteExpanded] = useState(false);

    const [translatedText, setTranslatedText] = useState('');

    const currentUserStr = localStorage.getItem('user');
    const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
    const currentUserId = currentUser ? currentUser.id : null;

    const handleVote = async (optionIdx) => {
        try {
            await axios.post(`/api/messages/${message.id}/poll-vote`, { optionIdx });
        } catch (err) {
            console.error("Error casting poll vote", err);
        }
    };
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
    const protectedSnapMode = snapMode || Boolean(message.snapMode);
    const isDeleted = message.type === 'deleted' || message.deletedAt;

    const isMedia = ['image', 'video', 'video_note'].includes(message.type) ||
        content.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg)$/i);
    const isPhotoReaction = message.type === 'image' && replyTo?.type === 'image' && Boolean(replyTo.content);

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
        if (protectedSnapMode) {
            alert('Media cannot be downloaded or saved in Snap Mode.');
            return;
        }
        const safeUrl = getSafeHttpUrl(url, window.location.href);
        if (!safeUrl) return;
        try {
            await saveMediaToDevice(safeUrl);
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Download failed:', error);
            openSafeExternal(safeUrl);
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

        if (type === 'drawing') return <DrawingMessage content={cnt} />;

        // ── WHATSAPP-STYLE VIDEO NOTE ──
        if (type === 'video_note') {
            return (
                <div
                    className={`relative rounded-full overflow-hidden bg-black shadow-xl group/video-note cursor-pointer transition-all duration-300 ease-out ${
                        videoNoteExpanded
                            ? 'w-[min(78vw,360px)] h-[min(78vw,360px)] border-[5px] border-[#25d366]'
                            : 'w-40 h-40 sm:w-52 sm:h-52 border-4 border-white/10'
                    }`}
                    onClick={(event) => {
                        event.stopPropagation();
                        const video = event.currentTarget.querySelector('video');
                        if (videoNoteExpanded) {
                            video?.pause();
                        } else {
                            video?.play().catch(() => {});
                        }
                        setVideoNoteExpanded(expanded => !expanded);
                    }}
                    title={videoNoteExpanded ? 'Tap to minimize' : 'Tap to expand and play'}
                >
                    <video
                        src={cnt}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        playsInline
                    />
                    <span className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[9px] font-semibold pointer-events-none">
                        {videoNoteExpanded ? 'TAP TO MINIMIZE' : 'VIDEO NOTE'}
                    </span>
                    {!videoNoteExpanded && (
                        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="w-12 h-12 rounded-full bg-black/55 border border-white/30 flex items-center justify-center">
                                <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-0.5">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </span>
                        </span>
                    )}
                </div>
            );
        }

        // ── IMAGE ──
        if (type === 'image' || type === 'gif' || cnt.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return (
                <div
                    className="relative group/media cursor-pointer rounded-2xl overflow-hidden"
                    style={{ maxWidth: 260 }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (protectedSnapMode) return;
                        if (isPhotoReaction) setZoomedMedia({ src: cnt, type: 'image', referenceSrc: replyTo.content });
                        else if (!isOwn && onPhotoReply) onPhotoReply(message);
                        else setZoomedMedia({ src: cnt, type: 'image' });
                    }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (!protectedSnapMode) setZoomedMedia({ src: cnt, type: 'image', referenceSrc: isPhotoReaction ? replyTo.content : null }); }}
                >
                    <img
                        src={cnt}
                        alt="sent"
                        className="w-full object-cover block"
                        style={{ maxHeight: 320, minHeight: 80, minWidth: 120 }}
                        loading="lazy"
                        draggable={!protectedSnapMode}
                    />
                    {isPhotoReaction && (
                        <div className="absolute right-2 top-2 z-10 w-[30%] min-w-[64px] max-w-[88px] overflow-hidden rounded-xl border-2 border-white/90 bg-black shadow-xl">
                            <img src={replyTo.content} alt="Original photo" className="aspect-[4/5] w-full object-cover" draggable={false} />
                            <span className="block truncate bg-black/75 px-1.5 py-1 text-center text-[8px] font-bold uppercase tracking-wide text-white">Reaction to</span>
                        </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover/media:bg-black/25 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover/media:opacity-100 transition-opacity p-2.5 bg-black/50 backdrop-blur-md rounded-full border border-white/20">
                            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                            </svg>
                        </div>
                    </div>
                    {/* Download button */}
                    {!protectedSnapMode && <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity shadow-lg"
                        title="Download"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>}
                    {!isOwn && !protectedSnapMode && <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPhotoReply?.(message); }}
                        className="absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-xs font-bold text-white opacity-100 shadow-lg backdrop-blur-md transition-opacity sm:opacity-0 sm:group-hover/media:opacity-100"
                        title="Reply with your photo"
                    >
                        📷 Photo reply
                    </button>}
                    {!protectedSnapMode && <button onClick={(e) => { e.stopPropagation(); onAnnotate?.({ src: cnt, type: 'image' }); }} className="absolute left-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 shadow-lg transition-opacity group-hover/media:opacity-100" title="Draw on photo"><span className="text-lg leading-none">✎</span></button>}
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
                    onClick={(e) => { e.stopPropagation(); if (!protectedSnapMode) setZoomedMedia({ src: cnt, type: 'video' }); }}
                >
                    {!protectedSnapMode && <button onClick={(e) => { e.stopPropagation(); onAnnotate?.({ src: cnt, type: 'video' }); }} className="absolute left-2 top-2 z-10 rounded-full bg-black/55 p-1.5 text-white opacity-0 shadow-lg transition-opacity group-hover/media:opacity-100" title="Draw on video frame"><span className="text-lg leading-none">✎</span></button>}
                    <video
                        src={cnt}
                        className="w-full object-cover block"
                        style={{ maxHeight: 320, minHeight: 100 }}
                        preload={localStorage.getItem('media_auto_download') === '0' ? 'none' : 'metadata'}
                        muted
                        controlsList="nodownload noplaybackrate"
                        disablePictureInPicture={protectedSnapMode}
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
                    {!protectedSnapMode && <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(cnt); }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover/media:opacity-100 transition-opacity shadow-lg"
                        title="Download"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>}
                </div>
            );
        }
        // ── DOCUMENT / FILE ──
        if (type === 'file') {
            const fileName = decodeURIComponent(cnt.split('/').pop() || 'File');
            const safeDocumentUrl = getSafeHttpUrl(cnt, window.location.href);
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
                        {safeDocumentUrl && fileName.toLowerCase().endsWith('.pdf') ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowPdfModal(true); }}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                    isOwn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                                }`}
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                    <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                                </svg>
                                Preview
                            </button>
                        ) : safeDocumentUrl ? (
                            <a
                                href={safeDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
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
                        ) : (
                            <span className="flex-1 rounded-lg bg-red-500/10 py-2 text-center text-xs font-semibold text-red-300">Unsafe URL blocked</span>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(safeDocumentUrl); }}
                            disabled={!safeDocumentUrl}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                isOwn ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                        >
                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                            Download
                        </button>
                    </div>

                    {/* PDF Preview Modal Portal */}
                    {showPdfModal && createPortal(
                        <div className="fixed inset-0 z-[120] flex flex-col bg-black/90 p-4 font-sans" onClick={() => setShowPdfModal(false)}>
                            <div className="flex justify-between items-center text-white mb-3" onClick={e => e.stopPropagation()}>
                                <h3 className="font-bold text-sm truncate flex-1 pr-4">{fileName}</h3>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleDownload(safeDocumentUrl)}
                                        className="bg-[#00a884] hover:bg-[#008f72] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 text-white shadow-md"
                                    >
                                        <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Download
                                    </button>
                                    <button 
                                        onClick={() => setShowPdfModal(false)} 
                                        className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full text-white"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 w-full rounded-xl overflow-hidden bg-white" onClick={e => e.stopPropagation()}>
                                <iframe src={`${safeDocumentUrl}#toolbar=0`} className="w-full h-full border-none" title="PDF Preview" sandbox="allow-same-origin" referrerPolicy="no-referrer" />
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            );
        }
        if (type === 'poll') {
            try {
                const poll = JSON.parse(cnt);
                const votes = message.votes || [];
                const totalVotes = votes.length;
                return (
                    <div className="flex flex-col gap-3 min-w-[230px] p-2 bg-black/25 rounded-2xl border border-white/5 font-sans">
                        <h4 className="font-bold text-sm text-white border-b border-white/10 pb-2 flex items-center gap-1.5">
                            📊 {poll.question}
                        </h4>
                        <div className="space-y-2">
                            {poll.options.map((opt, i) => {
                                const optionVotes = votes.filter(v => v.optionIdx === i);
                                const percentage = totalVotes > 0 ? Math.round((optionVotes.length / totalVotes) * 100) : 0;
                                const hasVoted = votes.some(v => v.userId === currentUserId && v.optionIdx === i);
                                
                                return (
                                    <button 
                                        key={i} 
                                        onClick={() => handleVote(i)}
                                        className={`w-full relative overflow-hidden text-left px-3 py-2.5 rounded-xl text-xs transition-all border flex items-center justify-between gap-2 font-medium ${
                                            hasVoted 
                                                ? 'bg-[#00a884]/15 border-[#00a884] text-white shadow-md shadow-[#00a884]/10' 
                                                : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-200'
                                        }`}
                                    >
                                        <div 
                                            className={`absolute left-0 top-0 bottom-0 transition-all duration-500 z-0 ${
                                                hasVoted ? 'bg-[#00a884]/25' : 'bg-white/10'
                                            }`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                        <span className="relative z-10 flex items-center gap-2 truncate">
                                            {hasVoted && <span className="text-[#00a884] text-sm">✓</span>}
                                            {opt}
                                        </span>
                                        <span className="relative z-10 text-[10px] text-white/55 font-semibold shrink-0">
                                            {percentage}% ({optionVotes.length})
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-white/40 italic text-center">
                            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} • Tap an option to vote
                        </p>
                    </div>
                );
            } catch { return <p className="italic text-xs opacity-60 text-red-400">Invalid poll data</p>; }
        }
        if (type === 'location' || type === 'live_location') {
            try {
                const loc = JSON.parse(cnt);
                const { lat, lng } = normalizeCoordinates(loc.lat, loc.lng);
                const mapUrl = buildMapUrl(lat, lng);
                return (
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer nofollow external" referrerPolicy="no-referrer" className="flex flex-col gap-0 min-w-[220px] group/loc rounded-xl overflow-hidden border border-white/10">
                        <div className="relative h-28 overflow-hidden bg-[#1a2634] bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:24px_24px]">
                            <div className="absolute inset-0 bg-gradient-to-br from-[#00a884]/10 to-blue-500/10" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className={`p-2 rounded-full shadow-xl ${type === 'live_location' ? 'bg-red-500 animate-pulse' : 'bg-[#00a884]'}`}>
                                    <MapPinIcon className="w-5 h-5 text-white" />
                                </div>
                            </div>
                            {type === 'live_location' && (
                                <div className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                    LIVE
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#202c33] group-hover/loc:bg-[#2a3942] transition-colors">
                            <MapPinIcon className={`w-4 h-4 flex-shrink-0 ${type === 'live_location' ? 'text-red-400' : 'text-[#00a884]'}`} />
                            <div className="min-w-0">
                                <p className="text-white text-xs font-bold">{type === 'live_location' ? 'Live Location' : 'Location'}</p>
                                <p className="text-gray-400 text-[10px] truncate">{lat.toFixed(4)}, {lng.toFixed(4)} · Tap to open</p>
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
                    <div className="min-w-[215px] p-2 bg-white/5 rounded-xl border border-white/8 space-y-3 font-sans">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#00a884]/20 flex items-center justify-center text-[#00a884] text-lg font-bold">
                                {contact.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs uppercase tracking-wider text-white/40 font-bold">Contact Card</p>
                                <p className="text-sm font-bold text-white truncate">{contact.name}</p>
                                <p className="text-xs text-white/70 truncate">{contact.phone}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(contact.phone);
                                alert(`Copied contact phone number: ${contact.phone}`);
                            }}
                            className="w-full bg-white/10 hover:bg-white/25 text-white font-bold py-1.5 rounded-lg text-xs transition"
                        >
                            📞 Call / Message (Copy Number)
                        </button>
                    </div>
                );
            } catch { return <p className="text-sm">{cnt}</p>; }
        }
        if (type === 'payment') {
            try {
                const pay = JSON.parse(cnt);
                const payment = paymentUpdate?.id === pay.id ? { ...pay, ...paymentUpdate } : pay;
                return (
                    <div className="min-w-[220px] p-3 rounded-2xl border bg-[#11221a] border-emerald-500/30 text-white space-y-3 shadow-lg font-sans">
                        <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2">
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                {payment.verified ? 'Provider verified payment' : 'Payment verification pending'}
                            </span>
                            <span className="text-[10px] text-white/50">{payment.providerPaymentId ? payment.providerPaymentId.substring(0, 16) : ''}</span>
                        </div>
                        <div className="text-center py-2">
                            <p className="text-3xl font-black text-emerald-400">₹{parseFloat(pay.amount).toFixed(2)}</p>
                            <p className="text-[10px] text-amber-300 font-bold flex items-center justify-center gap-1 mt-1">
                                <span className="w-1.5 h-1.5 bg-amber-300 rounded-full" />
                                {payment.status === 'refunded' ? 'Refunded' : payment.status === 'refund_requested' ? 'Refund requested' : payment.verified ? 'Provider verified' : 'Verification pending'}
                            </p>
                        </div>
                        {pay.payeeName && <p className="text-center text-[11px] text-white/60">To: {pay.payeeName}</p>}
                        {pay.description && (
                            <div className="bg-white/5 p-2 rounded-lg text-[11px] text-white/80 italic border border-white/5">
                                Note: {pay.description}
                            </div>
                        )}
                        <div>
                            <button
                                onClick={() => alert(`CHEETCHAT payment ID: ${payment.id}\nProvider payment ID: ${payment.providerPaymentId || 'Pending'}\nStatus: ${payment.status || (payment.verified ? 'verified' : 'pending')}\nCHEETCHAT does not store your UPI PIN or card details.`)}
                                className="w-full py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition"
                            >
                                Details
                            </button>
                            {isOwn && payment.verified && !['refund_requested', 'refunding', 'refunded'].includes(payment.status) && (
                                <button
                                    disabled={paymentBusy || !token}
                                    onClick={() => requestRefund(payment.id)}
                                    className="mt-2 w-full rounded-lg border border-amber-400/40 py-1 text-[10px] font-bold text-amber-300 disabled:opacity-50"
                                >
                                    {paymentBusy ? 'Requesting…' : 'Request refund'}
                                </button>
                            )}
                            {!isOwn && payment.status === 'refund_requested' && (
                                <button
                                    disabled={paymentBusy || !token}
                                    onClick={() => approveRefund(payment.id)}
                                    className="mt-2 w-full rounded-lg bg-amber-500 py-1 text-[10px] font-bold text-black disabled:opacity-50"
                                >
                                    {paymentBusy ? 'Processing…' : 'Approve full refund'}
                                </button>
                            )}
                            <button
                                disabled={paymentBusy || !token}
                                onClick={() => refreshPayment(payment.id)}
                                className="mt-2 w-full py-1 text-[10px] font-semibold text-white/60 disabled:opacity-50"
                            >
                                Refresh payment status
                            </button>
                        </div>
                    </div>
                );
            } catch { return <p className="text-sm">{cnt}</p>; }
        }
        if (type === 'game') {
            return (
                <MiniGameCard 
                    game={cnt} 
                    isOwn={isOwn} 
                    socket={socket} 
                    chatId={chatId} 
                    currentUserId={currentUserId} 
                />
            );
        }
        if (type === 'ride') {
            let data = {};
            try { data = JSON.parse(cnt); } catch(e){}
            return (
                <div className="flex flex-col gap-2 min-w-[240px]">
                    <div className="relative h-24 shrink-0 overflow-hidden rounded-lg bg-gray-800 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:20px_20px]">
                        <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-40" aria-hidden="true">🚕</div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2">
                            <span className="text-white font-bold text-sm drop-shadow-md">{data?.car?.name || 'Ride'} plan</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 px-1 pb-1">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-xs text-gray-300 truncate">{data.pickup}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPinIcon className="w-3 h-3 text-red-500 -ml-0.5" />
                            <span className="text-xs text-gray-300 truncate">{data.destination}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between p-2 bg-black/20 rounded-lg">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl drop-shadow-md">{data?.car?.icon || '🚗'}</span>
                                <div className="flex flex-col">
                                    <span className="text-white text-xs font-bold">Booking unverified</span>
                                    <span className="text-gray-400 text-[10px]">Complete and confirm in the partner app</span>
                                </div>
                            </div>
                            <div className="text-right flex flex-col">
                                <span className="text-white font-bold text-xs">{data?.eta || '3 mins'}</span>
                                <span className="text-gray-400 text-[10px]">Estimate</span>
                            </div>
                        </div>
                        <a
                            href={data?.car?.app === 'rapido' ? 'https://www.rapido.bike' : 'https://www.uber.com/in/en/ride/'}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            className="mt-1 w-full rounded-lg border border-blue-500/20 bg-blue-600/20 py-1.5 text-center text-xs font-bold text-blue-400 transition-colors hover:bg-blue-600/30"
                        >
                            Open partner service
                        </a>
                    </div>
                </div>
            );
        }

        if (type === 'gift') {
            let data = {};
            try { data = JSON.parse(cnt); } catch(e){}
            const tpl = data.template || {};
            const safeGiftPhoto = getSafeMediaUrl(data.photo, window.location.href);
            return (
                <div className="flex flex-col gap-0 min-w-[220px] group cursor-pointer">
                    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${tpl.bg || 'from-pink-500/20 to-rose-500/20'} border border-pink-500/30 p-4 flex flex-col items-center justify-center gap-3 transition-colors hover:opacity-90`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.2),transparent_20%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,.12),transparent_24%)] opacity-70" />
                        {safeGiftPhoto ? (
                            <img src={safeGiftPhoto} alt="gift" referrerPolicy="no-referrer" className="w-20 h-20 rounded-full object-cover border-4 border-white/40 shadow-xl relative z-10" />
                        ) : (
                            <div className="text-5xl drop-shadow-xl transform transition-transform group-hover:scale-110 relative z-10">
                                {tpl.icon || '🎁'}
                            </div>
                        )}
                        <div className="text-center relative z-10">
                            <h4 className="text-white font-bold text-sm">{data.message || "Here's a gift for you!"}</h4>
                            {data.provider === 'myntra' && data.couponCode && <div className="mt-2 rounded-lg border border-dashed border-white/40 bg-black/20 px-4 py-2 font-mono text-base font-black tracking-widest text-white">{data.couponCode}</div>}
                        </div>
                    </div>
                </div>
            );
        }

        if (type === 'birthday') {
            let data = {};
            try { data = JSON.parse(cnt); } catch(e){}
            return <BirthdayCard data={data} />;
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
                className={`flex items-end gap-2 w-full ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${hasReactions ? 'mb-7' : 'mb-1'}`}
                onContextMenu={event => { if (protectedSnapMode) event.preventDefault(); }}
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

                        {/* Translate button removed - moved to 3-dot menu */}

                        {/* The bubble itself */}
                        <div
                            onClick={handleBubbleClick}
                            className={`relative ${isMedia ? 'p-1' : 'px-3 py-2'} rounded-2xl shadow-sm cursor-pointer select-none
                                ${isOwn && message._isOptimistic ? 'animate-[sendBubble_650ms_cubic-bezier(.2,.9,.2,1)]' : ''}
                                ${isOwn
                                    ? 'bg-[#005c4b] text-white rounded-tr-sm'
                                    : 'bg-[#202c33] text-gray-100 rounded-tl-sm'
                                }`}
                            style={{
                                backgroundColor: isOwn ? (localStorage.getItem(`chat_bubble_color_${chatId}`) || localStorage.getItem('chat_bubble_color') || '#005c4b') : (localStorage.getItem(`chat_received_bubble_color_${chatId}`) || '#202c33'),
                                fontSize: localStorage.getItem('chat_font_size') === 'large' ? '17px' : localStorage.getItem('chat_font_size') === 'small' ? '13px' : '15px',
                                fontFamily: localStorage.getItem('chat_custom_font') === 'serif' ? 'Georgia, serif' : localStorage.getItem('chat_custom_font') === 'mono' ? 'ui-monospace, monospace' : localStorage.getItem('chat_custom_font') === 'rounded' ? 'Nunito, system-ui, sans-serif' : 'inherit'
                            }}
                        >
                            {protectedSnapMode && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-2xl opacity-25"><span className="-rotate-12 whitespace-nowrap text-xs font-black tracking-[0.35em] text-white">SNAP MODE · {currentUser?.username || 'PRIVATE'}</span></div>}
                            {/* Reply preview */}
                            {replyTo && !isPhotoReaction && (
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

                            {hasReactions && (
                                        <div
                                       className={`absolute -bottom-6 ${
                                         isOwn ? 'right-0' : 'left-0'
                               } rounded-full bg-[#202c33] px-2.5 py-1 text-sm shadow-lg border border-white/20 z-10 flex items-center gap-1 whitespace-nowrap`}
    >
                                {Object.entries(groupedReactions).map(([emoji, count]) => (
                               <span
                                key={emoji}
                               className="flex items-center gap-1 text-xs font-medium"
                                >
                               <span>{emoji}</span>

                               {count > 1 && (
                                  <span className="text-white/60 text-[10px]">
                        {count}
                    </span>
                )}
                 </span>
                                ))}
                                {stickerReactions.map((url, index) => <img key={`${url}-${index}`} src={url} alt="Placed sticker" className="-my-4 h-14 w-14 object-contain drop-shadow-xl" />)}
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
                        referenceSrc={zoomedMedia.referenceSrc}
                        onClose={() => setZoomedMedia(null)}
                    />
                )}
            </div>

            {/* WhatsApp-style action menu overlay */}
            {showActionMenu && createPortal(
                <MessageActionMenu
                    message={message}
                    isOwn={isOwn}
                    isTextMessage={isTextMessage}
                    isDeleted={isDeleted}
                    isLastMessage={isLastMessage}
                    onClose={() => setShowActionMenu(false)}
                    onReply={() => onReply && onReply(message)}
                    onEdit={() => onEdit && onEdit(message)}
                    onCopy={() => onCopy && onCopy(message)}
                    onForward={() => !protectedSnapMode && onForward && onForward(message)}
                    onReact={(emoji) => onReact && onReact(message, emoji)}
                    onDownload={() => handleDownload(message.content)}
                    onPhotoReply={() => onPhotoReply?.(message)}
                    onMakeSticker={() => onMakeSticker?.(message)}
                    onPlaceSticker={() => onPlaceSticker?.(message)}
                    onAnnotateMessage={() => onAnnotate?.({
                        type: 'chat',
                        messageType: message.type || 'text',
                        text: message.type === 'text' ? message.content : `[${message.type || 'message'}]`,
                        senderName: message.senderName || (isOwn ? 'You' : senderName || 'Contact'),
                        timestamp: message.timestamp,
                    })}
                    onPin={() => onPin && onPin(message)}
                    onDelete={() => onDelete && onDelete(message)}
                    onInfo={() => setShowInfoModal(true)}
                    onTranslate={() => { setShowTranslatorMenu(true); }}
                    showTranslateBtn={showTranslateBtn}
                    protectedMode={protectedSnapMode}
                />,
                document.body
            )}

            {/* Message Info Modal */}
            {showInfoModal && createPortal(
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
                </div>,
                document.body
            )}
        </>
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
