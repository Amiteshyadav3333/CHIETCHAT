import React, { useState } from 'react';
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline';

const THEMES = [
    { id: 'confetti', name: 'Confetti Party', color: 'from-fuchsia-500 to-pink-500', icon: '🎊' },
    { id: 'cake', name: 'Sweet Cake', color: 'from-amber-400 to-orange-500', icon: '🎂' },
    { id: 'balloons', name: 'Balloons', color: 'from-blue-400 to-indigo-500', icon: '🎈' },
    { id: 'neon', name: 'Neon Vibes', color: 'from-green-400 to-emerald-600', icon: '✨' }
];

const BirthdayModal = ({ onClose, onSend }) => {
    const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
    const [message, setMessage] = useState('Wishing you a very Happy Birthday! 🎂🎉');
    const [includeGift, setIncludeGift] = useState(true);
    const [isSending, setIsSending] = useState(false);

    const handleSend = () => {
        if (!message.trim()) return;
        setIsSending(true);
        setTimeout(() => {
            onSend({
                theme: selectedTheme,
                message,
                includeGift
            });
            onClose();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-0 sm:p-4">
            <div className="w-full h-[85vh] sm:h-[auto] sm:max-h-[85vh] max-w-sm bg-[#111b21] sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col animate-slide-up relative">
                
                {/* Header background with gradient based on theme */}
                <div className={`absolute top-0 inset-x-0 h-40 bg-gradient-to-br ${selectedTheme.color} opacity-20 transition-colors duration-500`} />

                {/* Header Controls */}
                <div className="flex items-center justify-between px-4 py-3 relative z-10">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-md">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full backdrop-blur-md text-white font-bold text-sm">
                        <SparklesIcon className="w-4 h-4 text-yellow-400" />
                        Birthday Wish
                    </div>
                    <div className="w-9" />
                </div>

                <div className="flex-1 overflow-y-auto p-5 relative z-10 flex flex-col gap-6">
                    
                    {/* Live Preview Card */}
                    <div className={`w-full aspect-[4/3] rounded-2xl bg-gradient-to-br ${selectedTheme.color} p-5 flex flex-col items-center justify-center text-center shadow-lg transition-colors duration-500 relative overflow-hidden group`}>
                        <div className="text-6xl drop-shadow-xl transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">
                            {selectedTheme.icon}
                        </div>
                        <p className="text-white font-bold text-lg mt-4 drop-shadow-md px-2 line-clamp-3 leading-snug">
                            {message || 'Your wish here...'}
                        </p>
                        {includeGift && (
                            <div className="absolute bottom-3 right-3 text-2xl animate-bounce drop-shadow-lg">🎁</div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="space-y-4">
                        {/* Themes */}
                        <div>
                            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Select Theme</label>
                            <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                                {THEMES.map(theme => (
                                    <button
                                        key={theme.id}
                                        onClick={() => setSelectedTheme(theme)}
                                        className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${selectedTheme.id === theme.id ? `bg-gradient-to-br ${theme.color} ring-2 ring-white scale-110 shadow-lg` : 'bg-[#202c33] border border-white/5 opacity-60 hover:opacity-100'}`}
                                    >
                                        {theme.icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Message */}
                        <div>
                            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Your Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full bg-[#202c33] border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-fuchsia-500 outline-none resize-none h-24"
                            />
                        </div>

                        {/* Gift Toggle */}
                        <div 
                            onClick={() => setIncludeGift(!includeGift)}
                            className="flex items-center justify-between bg-[#202c33] border border-white/5 p-4 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="text-2xl">🎁</div>
                                <div>
                                    <h4 className="text-white text-sm font-bold">Attach Virtual Gift Box</h4>
                                    <p className="text-gray-400 text-xs mt-0.5">They can tap to open it</p>
                                </div>
                            </div>
                            <div className={`w-12 h-6 rounded-full transition-colors relative ${includeGift ? 'bg-fuchsia-500' : 'bg-gray-600'}`}>
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${includeGift ? 'translate-x-6' : 'translate-x-0'}`} />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Action */}
                <div className="p-4 bg-[#111b21] border-t border-white/5 relative z-10">
                    <button
                        onClick={handleSend}
                        disabled={isSending || !message.trim()}
                        className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg relative overflow-hidden bg-gradient-to-r ${selectedTheme.color} text-white hover:opacity-90 disabled:opacity-50`}
                    >
                        {isSending ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>Send Birthday Wish</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BirthdayModal;
