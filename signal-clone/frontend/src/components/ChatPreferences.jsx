import React from 'react';
import axios from 'axios';
import ChatSoundPreferences from './ChatSoundPreferences';

const WALLPAPERS = [
    ['white', 'White', 'bg-white'],
    ['gradient', 'Dark', 'bg-[#0b141a]'],
    ['dots', 'Dots', 'bg-gray-700'],
    ['emerald', 'Green', 'bg-emerald-800'],
    ['sunset', 'Sunset', 'bg-gradient-to-br from-orange-900 to-fuchsia-900'],
    ['ocean', 'Ocean', 'bg-gradient-to-br from-sky-900 to-cyan-700'],
    ['lavender', 'Lavender', 'bg-gradient-to-br from-indigo-900 to-violet-600'],
    ['rose', 'Rose', 'bg-gradient-to-br from-rose-950 to-rose-700'],
    ['sand', 'Sand', 'bg-gradient-to-br from-amber-900 to-yellow-700'],
    ['aurora', 'Aurora', 'bg-gradient-to-br from-emerald-900 via-indigo-800 to-violet-700'],
];

const ChatPreferences = ({ wallpaper, onWallpaperChange, customWallpaper, onCustomWallpaperChange, onResetWallpaper, disappearingTtl, onDisappearingChange, chatId, onOpenDraw, snapMode = false, onSnapModeChange, liveNoteEnabled = false, onLiveNoteChange, onRingBell, canRingBell = false, user, token, onUserUpdated }) => {
    const [expandedSection, setExpandedSection] = React.useState(null);
    const toggleSection = section => setExpandedSection(current => current === section ? null : section);
    const colorKey = `chat_bubble_color_${chatId || 'default'}`;
    const receivedColorKey = `chat_received_bubble_color_${chatId || 'default'}`;
    const [contactColor, setContactColor] = React.useState(() => localStorage.getItem(colorKey) || localStorage.getItem('chat_bubble_color') || '#00a884');
    const [receivedColor, setReceivedColor] = React.useState(() => localStorage.getItem(receivedColorKey) || '#202c33');
    const [customValue, setCustomValue] = React.useState('');
    const [customUnit, setCustomUnit] = React.useState('minutes');
    const storyKey = `story_visible_to_${chatId || 'default'}`;
    const photoKey = `profile_visible_to_${chatId || 'default'}`;
    const [storyVisible, setStoryVisible] = React.useState(() => localStorage.getItem(storyKey) !== '0');
    const [photoVisible, setPhotoVisible] = React.useState(() => localStorage.getItem(photoKey) !== '0');
    const [showSnapConfirm, setShowSnapConfirm] = React.useState(false);
    const [selectedFont, setSelectedFont] = React.useState('');
    const [fontSize, setFontSize] = React.useState('');
    const [universalMessage, setUniversalMessage] = React.useState(user?.bio || '');
    const [savingUniversalMessage, setSavingUniversalMessage] = React.useState(false);
    const [universalMessageFeedback, setUniversalMessageFeedback] = React.useState('');
    const [bellFeedback, setBellFeedback] = React.useState('');
    const [ringingBell, setRingingBell] = React.useState(false);
    const wallpaperInputRef = React.useRef(null);
    const unitSeconds = { seconds: 1, minutes: 60, hours: 3600, days: 86400, years: 31536000 };

    React.useEffect(() => {
        setSelectedFont(localStorage.getItem(`chat_custom_font_${chatId}`) || '');
        setFontSize(localStorage.getItem(`chat_font_size_${chatId}`) || '');
        setUniversalMessage(user?.bio || '');
        setContactColor(localStorage.getItem(colorKey) || localStorage.getItem('chat_bubble_color') || '#00a884');
        setReceivedColor(localStorage.getItem(receivedColorKey) || '#202c33');
        setStoryVisible(localStorage.getItem(storyKey) !== '0');
        setPhotoVisible(localStorage.getItem(photoKey) !== '0');
    }, [chatId, user?.id, colorKey, receivedColorKey, storyKey, photoKey]);

    const saveUniversalMessage = async () => {
        setSavingUniversalMessage(true);
        setUniversalMessageFeedback('');
        try {
            const headers = token && token !== 'cookie-session' ? { Authorization: `Bearer ${token}` } : {};
            const response = await axios.post('/api/users/profile', { bio: universalMessage.trim() }, { headers });
            onUserUpdated?.(response.data);
            setUniversalMessageFeedback(universalMessage.trim() ? 'Your message is now visible across your profile and chats for 24 hours.' : 'Universal message cleared.');
        } catch (error) {
            setUniversalMessageFeedback(error.response?.data?.error || 'Could not save your universal message.');
        } finally {
            setSavingUniversalMessage(false);
        }
    };

    const handleWallpaperFile = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) return alert('Choose an image from your gallery.');
        if (file.size > 20 * 1024 * 1024) return alert('Choose an image smaller than 20 MB.');
        try {
            const source = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Could not read this image.'));
                reader.readAsDataURL(file);
            });
            const image = new Image();
            image.src = source;
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
            const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            onCustomWallpaperChange?.(canvas.toDataURL('image/jpeg', 0.78));
        } catch {
            alert('Could not use this image as a wallpaper. Try another picture.');
        }
    };
    return (
    <div className="border-b border-gray-800 bg-[#111b21] px-4 py-4">
        <PreferenceSection title="Chat settings" open={expandedSection === 'settings'} onClick={() => toggleSection('settings')}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Disappearing messages</span>
            <select
                value={[0, 60, 3600, 86400, 604800, 2592000].includes(Number(disappearingTtl)) ? disappearingTtl : 'custom'}
                onChange={event => onDisappearingChange(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
            >
                <option value={0}>Off</option>
                <option value={60}>1 minute</option>
                <option value={3600}>1 hour</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
                <option value={2592000}>30 days</option>
                <option value="custom">Custom time</option>
            </select>
            {(String(disappearingTtl) === 'custom' || ![0, 60, 3600, 86400, 604800, 2592000].includes(Number(disappearingTtl))) && <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2"><input type="number" min="1" value={customValue} onChange={event => setCustomValue(event.target.value)} placeholder="Time" className="min-w-0 rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]" /><select value={customUnit} onChange={event => setCustomUnit(event.target.value)} className="rounded-lg border border-gray-700 bg-[#202c33] px-2 text-xs text-white">{Object.keys(unitSeconds).map(unit => <option key={unit} value={unit}>{unit}</option>)}</select><button type="button" onClick={() => { const seconds = Math.max(1, Math.min(315360000, (Number(customValue) || 1) * unitSeconds[customUnit])); onDisappearingChange(seconds); }} className="rounded-lg bg-[#00a884] px-3 text-xs font-bold text-white">Set</button></div>}
            <span className="mt-1 block text-[11px] leading-4 text-gray-500">New messages will disappear after the selected time.</span>
          </label>
        </PreferenceSection>
        <PreferenceSection title="Chat wallpapers" open={expandedSection === 'wallpaper'} onClick={() => toggleSection('wallpaper')}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {WALLPAPERS.map(([id, label, color]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onWallpaperChange(id)}
                        className={`rounded-lg border p-2 text-center ${wallpaper === id ? 'border-[#00a884]' : 'border-gray-700'}`}
                    >
                        <span className={`mx-auto mb-1 block h-8 w-full rounded ${color}`} />
                        <span className="text-[10px] text-gray-300">{label}</span>
                    </button>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden" onChange={handleWallpaperFile} />
                <button type="button" onClick={() => wallpaperInputRef.current?.click()} className="rounded-lg border border-[#00a884]/50 bg-[#00a884]/10 px-3 py-2 text-xs font-semibold text-[#7ee6ce] hover:bg-[#00a884]/20">Choose from gallery</button>
                {customWallpaper && <button type="button" onClick={onResetWallpaper} className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5">Use default wallpaper</button>}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">Wallpaper changes apply only to this conversation and are saved on this device.</p>
        </PreferenceSection>
        {chatId && <PreferenceSection title="Chat font" open={expandedSection === 'font'} onClick={() => toggleSection('font')}>
            <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">Font style<select value={selectedFont} onChange={event => { const value = event.target.value; setSelectedFont(value); if (value) localStorage.setItem(`chat_custom_font_${chatId}`, value); else localStorage.removeItem(`chat_custom_font_${chatId}`); window.dispatchEvent(new Event('cheetchat-colour-updated')); }} className="mt-1 w-full rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white"><option value="">Default</option><option value="sans">Sans</option><option value="serif">Serif</option><option value="rounded">Rounded</option><option value="mono">Monospace</option></select></label>
                <label className="block text-xs text-gray-400">Text size<select value={fontSize} onChange={event => { const value = event.target.value; setFontSize(value); if (value) localStorage.setItem(`chat_font_size_${chatId}`, value); else localStorage.removeItem(`chat_font_size_${chatId}`); window.dispatchEvent(new Event('cheetchat-colour-updated')); }} className="mt-1 w-full rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white"><option value="">Default</option><option value="small">Small</option><option value="normal">Medium</option><option value="large">Large</option></select></label>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">Font style and size are saved separately for this conversation.</p>
        </PreferenceSection>}
        <PreferenceSection title="Bubble colours for this conversation" open={expandedSection === 'colors'} onClick={() => toggleSection('colors')}>
            <div className="grid grid-cols-2 gap-3"><label className="rounded-xl bg-white/5 p-3"><span className="mb-2 block text-xs text-gray-400">My messages</span><input type="color" value={contactColor} onChange={event => { setContactColor(event.target.value); localStorage.setItem(colorKey, event.target.value); window.dispatchEvent(new Event('cheetchat-colour-updated')); }} className="h-10 w-full rounded border-0 bg-transparent" /></label><label className="rounded-xl bg-white/5 p-3"><span className="mb-2 block text-xs text-gray-400">Their messages</span><input type="color" value={receivedColor} onChange={event => { setReceivedColor(event.target.value); localStorage.setItem(receivedColorKey, event.target.value); window.dispatchEvent(new Event('cheetchat-colour-updated')); }} className="h-10 w-full rounded border-0 bg-transparent" /></label></div>
            <span className="mt-2 block text-[11px] text-gray-500">These colours are stored only on your device.</span>
        </PreferenceSection>
        {onOpenDraw && <button type="button" onClick={onOpenDraw} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00a884] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#079474]"><span className="text-xl">✎</span> Draw in this chat</button>}
        {onLiveNoteChange && <button type="button" role="switch" aria-checked={liveNoteEnabled} onClick={() => onLiveNoteChange(!liveNoteEnabled)} className={`mt-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${liveNoteEnabled ? 'border-sky-400/60 bg-sky-400/10' : 'border-gray-700 bg-white/5'}`}><span><span className={`block text-sm font-bold ${liveNoteEnabled ? 'text-sky-200' : 'text-white'}`}>📝 NoteIt Live {liveNoteEnabled ? 'ON' : 'OFF'}</span><span className="mt-1 block text-[11px] leading-4 text-gray-400">When enabled, people in this chat can see your draft as you type. It is encrypted and never saved as a message.</span></span><span className={`h-6 w-11 shrink-0 rounded-full p-0.5 ${liveNoteEnabled ? 'bg-sky-400' : 'bg-gray-700'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${liveNoteEnabled ? 'translate-x-5' : ''}`} /></span></button>}
        {onSnapModeChange && <button type="button" onClick={() => setShowSnapConfirm(true)} className={`mt-3 w-full rounded-xl border px-4 py-3 text-left transition ${snapMode ? 'border-yellow-400 bg-yellow-400/10' : 'border-gray-700 bg-white/5'}`}><span className={`block text-sm font-bold ${snapMode ? 'text-yellow-300' : 'text-white'}`}>👻 Snap Mode {snapMode ? 'ON' : 'OFF'}</span><span className="mt-1 block text-[11px] leading-4 text-gray-400">Content disappears ten minutes after the chat ends.</span></button>}
        {canRingBell && onRingBell && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"><button type="button" disabled={ringingBell} onClick={async () => { setRingingBell(true); setBellFeedback(''); try { await onRingBell(); setBellFeedback('Bell sent. They can silence it on their device.'); } catch (error) { setBellFeedback(error.message || 'Could not ring the bell.'); } finally { setRingingBell(false); } }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 py-3 text-sm font-black text-[#231803] disabled:opacity-50">🔔 {ringingBell ? 'Ringing…' : 'Ring their bell'}</button><p className="mt-2 text-[11px] leading-4 text-gray-400">Keeps ringing on their screen until they silence it. You cannot stop it from your side.</p>{bellFeedback && <p role="status" className="mt-2 text-xs text-amber-100">{bellFeedback}</p>}</div>}
        {showSnapConfirm && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowSnapConfirm(false)}><div className="w-full max-w-sm rounded-3xl border border-yellow-400/25 bg-[#111b21] p-6 shadow-2xl" onClick={event => event.stopPropagation()}><div className="mb-4 text-5xl">👻</div><h3 className="text-xl font-bold text-white">{snapMode ? 'End Snap Chat?' : 'Start Snap Mode?'}</h3><p className="mt-2 text-sm leading-6 text-gray-300">{snapMode ? 'Messages, photos, audio and video from this session will disappear from every participant’s chat ten minutes after Snap Chat ends.' : 'Messages and media remain visible while Snap Chat is active, then disappear for every participant ten minutes after it ends. Downloads, forwarding and common screen-capture shortcuts are restricted.'}</p><div className="mt-4 rounded-xl bg-yellow-400/10 p-3 text-xs leading-5 text-yellow-200">An encrypted server copy is retained for security for up to seven days. The database record and managed media are then permanently deleted.</div><div className="mt-5 flex gap-2"><button type="button" onClick={() => setShowSnapConfirm(false)} className="flex-1 rounded-xl border border-gray-700 py-3 text-sm font-semibold text-gray-300">Cancel</button><button type="button" onClick={() => { onSnapModeChange(!snapMode); setShowSnapConfirm(false); }} className="flex-1 rounded-xl bg-yellow-400 py-3 text-sm font-black text-black">{snapMode ? 'End Snap Chat' : 'Start Snap Mode'}</button></div></div></div>}
        {chatId && <PreferenceSection title="Custom Tone & Ringtones" open={expandedSection === 'sounds'} onClick={() => toggleSection('sounds')}><ChatSoundPreferences chatId={chatId} /></PreferenceSection>}
        {chatId && <PreferenceSection title="Story and profile privacy" open={expandedSection === 'privacy'} onClick={() => toggleSection('privacy')}><PrivacyToggle label="Show my profile photo" value={photoVisible} onChange={value => { setPhotoVisible(value); localStorage.setItem(photoKey, value ? '1' : '0'); }} /><PrivacyToggle label="Show my story" value={storyVisible} onChange={value => { setStoryVisible(value); localStorage.setItem(storyKey, value ? '1' : '0'); }} /><p className="mt-2 text-[11px] leading-4 text-gray-500">Choose visibility separately for this contact.</p></PreferenceSection>}
        {chatId && <PreferenceSection title="Universal message" open={expandedSection === 'universal-message'} onClick={() => toggleSection('universal-message')}>
            <p className="mb-2 text-[11px] leading-4 text-gray-400">Set one message for your profile and all conversations. It stays visible for 24 hours.</p>
            <textarea value={universalMessage} onChange={event => setUniversalMessage(event.target.value.slice(0, 160))} rows={3} maxLength={160} placeholder="Write a message for everyone…" className="w-full resize-none rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#00a884]" />
            <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[11px] text-gray-500">{universalMessage.length}/160</span><button type="button" disabled={savingUniversalMessage} onClick={saveUniversalMessage} className="rounded-lg bg-[#00a884] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{savingUniversalMessage ? 'Saving…' : 'Save message'}</button></div>
            {universalMessageFeedback && <p role="status" className="mt-2 text-[11px] text-gray-300">{universalMessageFeedback}</p>}
        </PreferenceSection>}
    </div>
    );
};

const PreferenceSection = ({ title, open, onClick, children }) => (
    <section className="border-b border-gray-800 last:border-b-0">
        <button type="button" onClick={onClick} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/5">
            <span>{title}</span><span className={`text-[#00a884] transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {open && <div className="pb-4 pt-1">{children}</div>}
    </section>
);

const PrivacyToggle = ({ label, value, onChange }) => <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-white/5"><span className="text-sm text-gray-200">{label}</span><span className={`h-6 w-11 rounded-full p-0.5 ${value ? 'bg-[#00a884]' : 'bg-gray-700'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${value ? 'translate-x-5' : ''}`} /></span></button>;

export default ChatPreferences;
