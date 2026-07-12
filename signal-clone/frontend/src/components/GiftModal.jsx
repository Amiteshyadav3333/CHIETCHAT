import React, { useState, useRef } from 'react';
import { XMarkIcon, ShoppingBagIcon, PhotoIcon } from '@heroicons/react/24/outline';

const TEMPLATES = [
    { id: 'birthday', label: '🎂 Birthday', bg: 'from-fuchsia-500 to-pink-500', icon: '🎂' },
    { id: 'love', label: '❤️ Love', bg: 'from-red-500 to-rose-400', icon: '❤️' },
    { id: 'congrats', label: '🎉 Congrats', bg: 'from-yellow-400 to-orange-500', icon: '🎉' },
    { id: 'friendship', label: '🤝 Friendship', bg: 'from-blue-500 to-cyan-400', icon: '🤝' },
    { id: 'custom', label: '✨ Custom', bg: 'from-violet-500 to-indigo-500', icon: '✨' },
];

const GiftModal = ({ onClose, onSend }) => {
    const [tab, setTab] = useState('design'); // 'design' | 'myntra'
    const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
    const [wishText, setWishText] = useState('');
    const [uploadedPhoto, setUploadedPhoto] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const photoInputRef = useRef(null);

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setUploadedPhoto(ev.target.result);
        reader.readAsDataURL(file);
    };

    const handleSendGift = () => {
        setIsSending(true);
        setTimeout(() => {
            onSend({
                template: selectedTemplate,
                message: wishText || `${selectedTemplate.icon} Sending you love!`,
                photo: uploadedPhoto,
                status: 'Sent'
            });
            onClose();
        }, 800);
    };

    const handleMyntraSelect = () => {
        onSend({
            template: selectedTemplate,
            message: wishText || '🛍️ A gift from Myntra for you!',
            photo: uploadedPhoto,
            myntraLink: 'https://www.myntra.com',
            status: 'Sent'
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-0 sm:p-4">
            <div className="w-full h-[90vh] sm:h-[85vh] max-w-lg bg-[#0b141a] sm:rounded-2xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#111b21] border-b border-white/5 shrink-0">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-gray-300">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <ShoppingBagIcon className="w-5 h-5 text-pink-500" />
                        <h2 className="text-white font-bold text-base">Gift & Wish</h2>
                    </div>
                    <div className="w-9" />
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 shrink-0">
                    {[{ id: 'design', label: '🎁 Design Gift' }, { id: 'myntra', label: '🛍️ Myntra' }].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${tab === t.id ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'design' ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Template selector */}
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Choose Template</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {TEMPLATES.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedTemplate(t)}
                                        className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${selectedTemplate.id === t.id ? 'border-pink-400 bg-pink-500/20 text-white' : 'border-white/10 text-gray-400 hover:border-white/30'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preview card */}
                        <div className={`relative rounded-2xl bg-gradient-to-br ${selectedTemplate.bg} p-6 flex flex-col items-center gap-3 overflow-hidden min-h-[180px]`}>
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />
                            {uploadedPhoto ? (
                                <img src={uploadedPhoto} alt="gift" className="w-24 h-24 rounded-full object-cover border-4 border-white/40 shadow-xl relative z-10" />
                            ) : (
                                <div className="text-6xl relative z-10 drop-shadow-xl">{selectedTemplate.icon}</div>
                            )}
                            <p className="text-white font-bold text-center text-lg relative z-10 drop-shadow-md break-words max-w-full">
                                {wishText || `${selectedTemplate.icon} Sending you love!`}
                            </p>
                        </div>

                        {/* Photo upload */}
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Add Photo (Optional)</p>
                            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                            <button
                                onClick={() => photoInputRef.current?.click()}
                                className="w-full py-3 rounded-xl border border-dashed border-white/20 text-gray-400 hover:border-pink-400 hover:text-pink-400 transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
                            >
                                <PhotoIcon className="w-5 h-5" />
                                {uploadedPhoto ? '✅ Photo Added — Tap to Change' : 'Upload a Photo'}
                            </button>
                        </div>

                        {/* Wish text */}
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Write Your Wish</p>
                            <textarea
                                value={wishText}
                                onChange={(e) => setWishText(e.target.value)}
                                placeholder="Write anything you want to say... 💬"
                                className="w-full bg-[#202c33] border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-pink-500 outline-none resize-none h-20"
                                maxLength={200}
                            />
                            <p className="text-right text-[10px] text-gray-500 mt-1">{wishText.length}/200</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col">
                        <div className="px-4 py-3 bg-[#111b21] border-b border-white/5 flex items-center justify-between shrink-0">
                            <span className="text-xs text-gray-400">Browse Myntra & send gift to chat</span>
                            <button
                                onClick={handleMyntraSelect}
                                className="text-xs bg-pink-500 hover:bg-pink-400 text-white font-bold px-3 py-1.5 rounded-lg"
                            >
                                Send to Chat
                            </button>
                        </div>
                        <iframe
                            src="https://www.myntra.com"
                            className="flex-1 w-full border-none"
                            title="Myntra"
                        />
                    </div>
                )}

                {/* Footer */}
                {tab === 'design' && (
                    <div className="p-4 bg-[#111b21] border-t border-white/5 shrink-0">
                        <button
                            onClick={handleSendGift}
                            disabled={isSending}
                            className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-90 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20"
                        >
                            {isSending ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>🎁 Send Gift</>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GiftModal;
