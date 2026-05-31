import React, { useState } from 'react';
import { XMarkIcon, ShieldCheckIcon, LockClosedIcon, SparklesIcon, IdentificationIcon, ArrowRightOnRectangleIcon, ChartBarIcon, CheckBadgeIcon, ShoppingBagIcon, ChatBubbleBottomCenterTextIcon, EyeSlashIcon, KeyIcon } from '@heroicons/react/24/outline';

const SettingsModal = ({ user, onClose, onLogout, theme, wallpaper, onThemeChange, onWallpaperChange }) => {
    const [hideLastSeen, setHideLastSeen] = useState(() => localStorage.getItem('hide_last_seen') === '1');
    const [incognitoKeyboard, setIncognitoKeyboard] = useState(() => localStorage.getItem('incognito_keyboard') === '1');
    const [twoStep, setTwoStep] = useState(() => localStorage.getItem('two_step_verification') === '1');

    const toggleStored = (key, value, setter) => {
        const next = !value;
        localStorage.setItem(key, next ? '1' : '0');
        setter(next);
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#111b21] w-full max-w-2xl h-[85vh] rounded-2xl shadow-2xl border border-gray-800 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#202c33]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-signal-accent/20 rounded-lg">
                            <SparklesIcon className="w-6 h-6 text-signal-accent" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Settings</h2>
                            <p className="text-xs text-gray-400">Manage your CHEETCHAT experience</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {/* Profile Section */}
                    <section className="bg-[#202c33] rounded-xl p-6 border border-gray-700/50 shadow-inner">
                        <div className="flex items-center gap-6">
                            <img src={user?.avatar} alt="Profile" className="w-20 h-20 rounded-full ring-4 ring-signal-accent/30" />
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-white">{user?.username}</h3>
                                <p className="text-gray-400 text-sm mb-2">{user?.bio || "No bio set yet"}</p>
                                <div className="flex gap-2">
                                    <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold uppercase rounded tracking-wider border border-green-500/20">Active Account</span>
                                    <span className="px-2 py-1 bg-signal-accent/10 text-signal-accent text-[10px] font-bold uppercase rounded tracking-wider border border-signal-accent/20">Pro User</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Privacy & Security */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-signal-accent font-bold text-sm uppercase tracking-widest">
                                <ShieldCheckIcon className="w-5 h-5" />
                                <span>Privacy & Security</span>
                            </div>
                            <div className="bg-[#202c33]/50 p-4 rounded-xl border border-gray-800 space-y-4">
                                <div className="flex gap-3">
                                    <LockClosedIcon className="w-5 h-5 text-green-500 shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-bold text-white">End-to-End Encryption</h4>
                                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                                            Your messages are secured with military-grade encryption. Not even CHEETCHAT can read your conversations.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3 border-t border-gray-800 pt-4">
                                    <IdentificationIcon className="w-5 h-5 text-blue-500 shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-bold text-white">Anonymized Identity</h4>
                                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                                            We prioritize your anonymity. Your email address is never shared with contacts or visible on your profile.
                                        </p>
                                    </div>
                                </div>
                                <ToggleRow icon={<KeyIcon className="w-5 h-5 text-yellow-400" />} label="Two-step verification" value={twoStep} onClick={() => toggleStored('two_step_verification', twoStep, setTwoStep)} />
                                <ToggleRow icon={<EyeSlashIcon className="w-5 h-5 text-purple-400" />} label="Hide last seen" value={hideLastSeen} onClick={() => toggleStored('hide_last_seen', hideLastSeen, setHideLastSeen)} />
                                <ToggleRow icon={<ShieldCheckIcon className="w-5 h-5 text-cyan-400" />} label="Incognito keyboard" value={incognitoKeyboard} onClick={() => toggleStored('incognito_keyboard', incognitoKeyboard, setIncognitoKeyboard)} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-signal-accent font-bold text-sm uppercase tracking-widest">
                                <SparklesIcon className="w-5 h-5" />
                                <span>Features</span>
                            </div>
                            <div className="bg-[#202c33]/50 p-4 rounded-xl border border-gray-800 space-y-4">
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-200">Ephemeral Stories</span>
                                        <span className="text-[10px] bg-signal-accent text-white px-2 py-0.5 rounded-full font-bold">LIVE</span>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        Share moments that disappear after 24 hours. Keep your feed fresh and spontaneous.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 border-t border-gray-800 pt-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-200">High-Definition Reels</span>
                                        <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-bold">HD</span>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        Experience fluid, high-resolution short-form video content directly within your messenger.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <section className="grid md:grid-cols-2 gap-6">
                        <div className="bg-[#202c33]/50 p-4 rounded-xl border border-gray-800 space-y-3">
                            <div className="flex items-center gap-2 text-signal-accent font-bold text-sm uppercase tracking-widest">
                                <SparklesIcon className="w-5 h-5" />
                                <span>Themes</span>
                            </div>
                            <Segmented value={theme} onChange={onThemeChange} options={[['dark', 'Dark'], ['midnight', 'Midnight'], ['business', 'Business']]} />
                            <Segmented value={wallpaper} onChange={onWallpaperChange} options={[['gradient', 'Gradient'], ['dots', 'Dots'], ['emerald', 'Emerald']]} />
                        </div>

                        <div className="bg-[#202c33]/50 p-4 rounded-xl border border-gray-800 space-y-3">
                            <div className="flex items-center gap-2 text-signal-accent font-bold text-sm uppercase tracking-widest">
                                <CheckBadgeIcon className="w-5 h-5" />
                                <span>Business</span>
                            </div>
                            <BusinessRow icon={<CheckBadgeIcon className="w-5 h-5" />} title="Business profile" value={`${user?.username || 'Profile'} · Verified badge ready`} />
                            <BusinessRow icon={<ShoppingBagIcon className="w-5 h-5" />} title="Catalog / Products" value="3 demo products prepared" />
                            <BusinessRow icon={<ChatBubbleBottomCenterTextIcon className="w-5 h-5" />} title="Auto reply / Chatbot" value="Instant welcome reply enabled" />
                            <BusinessRow icon={<ChartBarIcon className="w-5 h-5" />} title="Analytics dashboard" value="Views, replies, conversion cards" />
                        </div>
                    </section>

                    {/* App Info */}
                    <div className="pt-4">
                        <div className="bg-gradient-to-br from-signal-accent/10 to-transparent p-6 rounded-2xl border border-signal-accent/20">
                            <h4 className="text-lg font-bold text-white mb-2">CHEETCHAT v1.0.4</h4>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Thank you for being part of the CHEETCHAT community. We are committed to building the most secure and vibrant communication platform in the world. Our mission is to bridge the gap between absolute privacy and modern social features.
                            </p>
                        </div>
                    </div>

                    {/* Logout Button */}
                    <div className="pt-4">
                        <button 
                            onClick={onLogout}
                            className="w-full flex items-center justify-center gap-3 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all border border-red-500/20 font-bold"
                        >
                            <ArrowRightOnRectangleIcon className="w-6 h-6" />
                            Sign Out of CHEETCHAT
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ToggleRow = ({ icon, label, value, onClick }) => (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 border-t border-gray-800 pt-4 text-left">
        <span className="flex items-center gap-3 text-sm text-gray-200">{icon}{label}</span>
        <span className={`h-6 w-11 rounded-full p-0.5 transition ${value ? 'bg-signal-accent' : 'bg-gray-700'}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${value ? 'translate-x-5' : ''}`} />
        </span>
    </button>
);

const Segmented = ({ value, onChange, options }) => (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#111b21] p-1">
        {options.map(([id, label]) => (
            <button key={id} onClick={() => onChange(id)} className={`rounded-lg px-2 py-2 text-xs font-bold ${value === id ? 'bg-signal-accent text-white' : 'text-gray-400 hover:text-white'}`}>
                {label}
            </button>
        ))}
    </div>
);

const BusinessRow = ({ icon, title, value }) => (
    <div className="flex gap-3 rounded-xl bg-[#111b21] p-3">
        <span className="text-signal-accent">{icon}</span>
        <div>
            <p className="text-sm font-bold text-white">{title}</p>
            <p className="text-xs text-gray-400">{value}</p>
        </div>
    </div>
);

export default SettingsModal;
