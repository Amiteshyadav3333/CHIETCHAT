import React, { useState } from 'react';
import { XMarkIcon, SparklesIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';

const THEMES = [
    { id: 'confetti', name: 'Confetti Party', color: 'from-fuchsia-500 to-pink-500', icon: '🎊' },
    { id: 'cake', name: 'Sweet Cake', color: 'from-amber-400 to-orange-500', icon: '🎂' },
    { id: 'balloons', name: 'Balloons', color: 'from-blue-400 to-indigo-500', icon: '🎈' },
    { id: 'neon', name: 'Neon Vibes', color: 'from-green-400 to-emerald-600', icon: '✨' },
    { id: 'ocean', name: 'Deep Ocean', color: 'from-cyan-500 to-blue-700', icon: '🌊' },
    { id: 'sunset', name: 'Golden Sunset', color: 'from-orange-500 to-red-500', icon: '🌅' },
    { id: 'midnight', name: 'Midnight Magic', color: 'from-purple-600 to-blue-900', icon: '🌌' },
];

const FONTS = [
    { id: 'inter', name: 'Modern', style: "'Inter', sans-serif" },
    { id: 'dancing', name: 'Elegant', style: "'Dancing Script', cursive" },
    { id: 'bangers', name: 'Bold Poster', style: "'Bangers', cursive" },
    { id: 'pacifico', name: 'Playful', style: "'Pacifico', cursive" },
];

const EFFECTS = [
    { id: 'none', name: 'None', icon: '🚫' },
    { id: 'confetti', name: 'Confetti', icon: '🎊' },
    { id: 'balloons', name: 'Balloons', icon: '🎈' },
    { id: 'stars', name: 'Sparkles', icon: '✨' },
];

const BirthdayModal = ({ onClose, onSend }) => {
    const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
    const [selectedFont, setSelectedFont] = useState(FONTS[1]);
    const [selectedEffect, setSelectedEffect] = useState(EFFECTS[1]);
    const [playMusic, setPlayMusic] = useState(true);
    const [message, setMessage] = useState('Wishing you a very Happy Birthday! 🎂🎉');
    const [isSending, setIsSending] = useState(false);

    const handleSend = () => {
        if (!message.trim()) return;
        setIsSending(true);
        setTimeout(() => {
            onSend({
                theme: selectedTheme,
                font: selectedFont,
                effect: selectedEffect,
                playMusic,
                message,
                interactive: true 
            });
            onClose();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-0 sm:p-4 animate-fade-in">
            <div className="w-full h-[90vh] sm:h-[auto] sm:max-h-[90vh] max-w-md bg-[#111b21] sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col animate-slide-up relative">
                
                {/* Header background with gradient based on theme */}
                <div className={`absolute top-0 inset-x-0 h-40 bg-gradient-to-br ${selectedTheme.color} opacity-20 transition-colors duration-500`} />

                {/* Header Controls */}
                <div className="flex items-center justify-between px-4 py-3 relative z-10">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-md">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full backdrop-blur-md text-white font-bold text-sm shadow-md">
                        <SparklesIcon className="w-4 h-4 text-yellow-400" />
                        Premium Card Studio
                    </div>
                    <div className="w-9" />
                </div>

                <div className="flex-1 overflow-y-auto p-5 relative z-10 flex flex-col gap-6 hide-scrollbar">
                    
                    {/* Live Preview Card */}
                    <div className="relative">
                        <div className={`w-full aspect-[4/3] rounded-2xl bg-gradient-to-br ${selectedTheme.color} p-6 flex flex-col items-center justify-center text-center shadow-lg transition-colors duration-500 relative overflow-hidden group border border-white/20`}>
                            {/* Effects overlay preview */}
                            {selectedEffect.id === 'confetti' && <div className="absolute inset-0 bg-[url('https://cdn-icons-png.flaticon.com/512/1769/1769062.png')] bg-repeat opacity-20 animate-float mix-blend-overlay"></div>}
                            {selectedEffect.id === 'stars' && <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay animate-pulse"></div>}

                            <div className="text-6xl drop-shadow-xl transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 z-10">
                                {selectedTheme.icon}
                            </div>
                            <p 
                                className="text-white mt-4 drop-shadow-md px-2 z-10 break-words"
                                style={{ 
                                    fontFamily: selectedFont.style, 
                                    fontSize: selectedFont.id === 'inter' ? '1.25rem' : '1.75rem',
                                    lineHeight: '1.4'
                                }}
                            >
                                {message || 'Your wish here...'}
                            </p>
                            
                            {/* Tap to Reveal Hint Overlay */}
                            <div className="absolute bottom-3 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md border border-white/20 flex items-center gap-2">
                                <span className="animate-pulse text-xl">🎁</span>
                                <span className="text-white text-xs font-semibold">Tap to Reveal enabled</span>
                            </div>
                        </div>
                    </div>

                    {/* Controls Studio */}
                    <div className="space-y-5 bg-black/20 p-4 rounded-2xl border border-white/5">
                        
                        {/* Themes (Colors) */}
                        <div>
                            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span> Card Theme
                            </label>
                            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                                {THEMES.map(theme => (
                                    <button
                                        key={theme.id}
                                        onClick={() => setSelectedTheme(theme)}
                                        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${selectedTheme.id === theme.id ? `bg-gradient-to-br ${theme.color} ring-4 ring-white shadow-[0_0_15px_rgba(255,255,255,0.4)]` : `bg-gradient-to-br ${theme.color} opacity-50 hover:opacity-100`}`}
                                        title={theme.name}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Fonts */}
                        <div>
                            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Typography
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {FONTS.map(font => (
                                    <button
                                        key={font.id}
                                        onClick={() => setSelectedFont(font)}
                                        className={`py-2 px-3 rounded-lg border text-sm transition-all ${selectedFont.id === font.id ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-[#111b21] border-white/10 text-gray-400 hover:bg-white/5'}`}
                                        style={{ fontFamily: font.style }}
                                    >
                                        {font.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Effects */}
                        <div>
                            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Magic Effects
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {EFFECTS.map(effect => (
                                    <button
                                        key={effect.id}
                                        onClick={() => setSelectedEffect(effect)}
                                        className={`py-2 flex flex-col items-center gap-1 rounded-lg border transition-all ${selectedEffect.id === effect.id ? 'bg-yellow-500/20 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]' : 'bg-[#111b21] border-white/10 opacity-60 hover:opacity-100'}`}
                                    >
                                        <span className="text-xl">{effect.icon}</span>
                                        <span className={`text-[10px] ${selectedEffect.id === effect.id ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{effect.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Music Toggle */}
                        <div 
                            onClick={() => setPlayMusic(!playMusic)}
                            className={`flex items-center justify-between border p-3 rounded-xl cursor-pointer transition-all ${playMusic ? 'bg-fuchsia-500/10 border-fuchsia-500' : 'bg-[#111b21] border-white/5 hover:bg-white/5'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${playMusic ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-white/5 text-gray-400'}`}>
                                    <MusicalNoteIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className={`text-sm font-bold ${playMusic ? 'text-fuchsia-400' : 'text-gray-300'}`}>Attach Birthday Tune</h4>
                                    <p className="text-gray-500 text-[10px]">Plays automatically on open</p>
                                </div>
                            </div>
                            <div className={`w-10 h-5 rounded-full transition-colors relative ${playMusic ? 'bg-fuchsia-500' : 'bg-gray-600'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${playMusic ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                        </div>

                        {/* Message */}
                        <div>
                            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Your Message
                            </label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full bg-[#111b21] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:ring-1 focus:ring-fuchsia-500 outline-none resize-none h-24"
                                style={{ fontFamily: selectedFont.style, fontSize: '1.1rem' }}
                            />
                        </div>

                    </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-[#111b21] border-t border-white/5 relative z-10">
                    <button
                        onClick={handleSend}
                        disabled={isSending || !message.trim()}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl relative overflow-hidden bg-gradient-to-r ${selectedTheme.color} text-white hover:opacity-90 disabled:opacity-50`}
                    >
                        {isSending ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <SparklesIcon className="w-5 h-5" />
                                Send Magic Card
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BirthdayModal;
