import React from 'react';

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

const ChatPreferences = ({ wallpaper, onWallpaperChange, disappearingTtl, onDisappearingChange, chatId, onOpenDraw, snapMode = false, onSnapModeChange }) => {
    const colorKey = `chat_bubble_color_${chatId || 'default'}`;
    const [contactColor, setContactColor] = React.useState(() => localStorage.getItem(colorKey) || localStorage.getItem('chat_bubble_color') || '#00a884');
    const [customValue, setCustomValue] = React.useState('');
    const [customUnit, setCustomUnit] = React.useState('minutes');
    const storyKey = `story_visible_to_${chatId || 'default'}`;
    const photoKey = `profile_visible_to_${chatId || 'default'}`;
    const [storyVisible, setStoryVisible] = React.useState(() => localStorage.getItem(storyKey) !== '0');
    const [photoVisible, setPhotoVisible] = React.useState(() => localStorage.getItem(photoKey) !== '0');
    const unitSeconds = { seconds: 1, minutes: 60, hours: 3600, days: 86400, years: 31536000 };
    return (
    <div className="border-b border-gray-800 bg-[#111b21] px-4 py-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#00a884]">Chat settings</h4>
        <label className="mb-4 block">
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
        <div>
            <span className="mb-2 block text-sm font-medium text-white">Chat wallpaper</span>
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
        </div>
        <div className="mt-4 border-t border-gray-800 pt-4">
            <span className="mb-2 block text-sm font-medium text-white">This contact's chat colour</span>
            <div className="flex items-center gap-3">
                <input type="color" value={contactColor} onChange={event => { setContactColor(event.target.value); localStorage.setItem(colorKey, event.target.value); window.dispatchEvent(new Event('cheetchat-colour-updated')); }} className="h-10 w-14 rounded border-0 bg-transparent" />
                <span className="text-xs text-gray-500">Only this conversation</span>
            </div>
        </div>
        {onOpenDraw && <button type="button" onClick={onOpenDraw} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00a884] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#079474]"><span className="text-xl">✎</span> Draw in this chat</button>}
        {onSnapModeChange && <button type="button" onClick={() => onSnapModeChange(!snapMode)} className={`mt-3 w-full rounded-xl border px-4 py-3 text-left transition ${snapMode ? 'border-yellow-400 bg-yellow-400/10' : 'border-gray-700 bg-white/5'}`}><span className={`block text-sm font-bold ${snapMode ? 'text-yellow-300' : 'text-white'}`}>👻 Snap Mode {snapMode ? 'ON' : 'OFF'}</span><span className="mt-1 block text-[11px] leading-4 text-gray-400">Messages and media expire in 10 minutes. Downloads and forwarding are restricted.</span></button>}
        {chatId && <div className="mt-4 border-t border-gray-800 pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#00a884]">Story & profile privacy</p><PrivacyToggle label="Show my profile photo" value={photoVisible} onChange={value => { setPhotoVisible(value); localStorage.setItem(photoKey, value ? '1' : '0'); }} /><PrivacyToggle label="Show my story" value={storyVisible} onChange={value => { setStoryVisible(value); localStorage.setItem(storyKey, value ? '1' : '0'); }} /><p className="mt-2 text-[11px] leading-4 text-gray-500">Per-contact audience choice, similar to WhatsApp privacy exceptions.</p></div>}
    </div>
    );
};

const PrivacyToggle = ({ label, value, onChange }) => <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-white/5"><span className="text-sm text-gray-200">{label}</span><span className={`h-6 w-11 rounded-full p-0.5 ${value ? 'bg-[#00a884]' : 'bg-gray-700'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${value ? 'translate-x-5' : ''}`} /></span></button>;

export default ChatPreferences;
