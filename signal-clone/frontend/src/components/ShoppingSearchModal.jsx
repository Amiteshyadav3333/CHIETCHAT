import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const CATEGORIES = [
    ['📱', 'Mobiles'], ['👕', 'Fashion'], ['💻', 'Electronics'],
    ['🏠', 'Home'], ['📚', 'Books'], ['🎮', 'Gaming'],
];

export const amazonSearchUrl = query => `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;

const openExternal = url => window.open(url, '_blank', 'noopener,noreferrer');

const ShoppingSearchModal = ({ onClose }) => {
    const [query, setQuery] = useState('');

    const submit = event => {
        event.preventDefault();
        const normalizedQuery = query.trim();
        if (normalizedQuery) openExternal(amazonSearchUrl(normalizedQuery));
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#131921] text-white shadow-2xl">
                <div className="flex items-center justify-between bg-[#232f3e] px-5 py-4">
                    <div><h3 className="text-lg font-bold">Shopping</h3><p className="text-xs text-gray-300">Search products on Amazon India</p></div>
                    <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close shopping search"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                <div className="p-5">
                    <form onSubmit={submit} className="flex gap-2">
                        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search mobiles, fashion, books…" className="min-w-0 flex-1 rounded-xl bg-white px-4 py-3 text-sm text-black outline-none" />
                        <button className="rounded-xl bg-[#ff9900] px-4 text-sm font-bold text-black">Search</button>
                    </form>
                    <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-wider text-gray-400">Popular categories</p>
                    <div className="grid grid-cols-2 gap-2">
                        {CATEGORIES.map(([icon, label]) => (
                            <button key={label} onClick={() => openExternal(amazonSearchUrl(label))} className="flex items-center gap-2 rounded-xl bg-white/5 p-3 text-left text-sm font-semibold hover:bg-white/10">
                                <span className="text-xl">{icon}</span>{label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => openExternal('https://www.amazon.in/')} className="mt-4 w-full rounded-xl border border-[#ff9900]/50 py-3 text-sm font-bold text-[#ffb84d] hover:bg-[#ff9900]/10">
                        Open Amazon India ↗
                    </button>
                    <p className="mt-3 text-center text-[10px] text-gray-500">Amazon opens in a new tab. CHEETCHAT does not process purchases.</p>
                </div>
            </div>
        </div>
    );
};

export default ShoppingSearchModal;
