import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    ArrowLeftIcon, ArrowTopRightOnSquareIcon, BuildingStorefrontIcon, ChatBubbleLeftRightIcon,
    MagnifyingGlassIcon, MapPinIcon, PhoneIcon, ShoppingBagIcon, VideoCameraIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

const categories = ['All', 'Fashion', 'Electronics', 'Food', 'Home', 'Books', 'Services', 'Other'];
const auth = token => ({ headers: { Authorization: `Bearer ${token}` } });
const websiteHref = value => {
    if (!value) return '';
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const url = new URL(candidate);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
};
const money = (price, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(price || 0));

export default function ShopMarketplace({ token, onClose, onManageShop, onStartChat, onStartCall }) {
    const [query, setQuery] = useState('');
    const [location, setLocation] = useState('');
    const [category, setCategory] = useState('All');
    const [shops, setShops] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [working, setWorking] = useState(false);

    const loadShops = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { data } = await axios.get('/api/business/shops', {
                ...auth(token), params: { q: query.trim(), category: category === 'All' ? '' : category, location: location.trim() },
            });
            setShops(data.shops || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Shops could not be loaded. Please try again.');
        } finally { setLoading(false); }
    }, [token, query, category, location]);

    useEffect(() => {
        const timer = window.setTimeout(loadShops, 220);
        return () => window.clearTimeout(timer);
    }, [loadShops]);

    const openShop = async shop => {
        if (!shop?.owner?.id) return;
        setSelected(shop);
        try {
            const { data } = await axios.get(`/api/business/storefront/${shop.owner.id}`, auth(token));
            setSelected(data);
        } catch (err) {
            setError(err.response?.data?.error || 'This shop is currently unavailable.');
            setSelected(null);
        }
    };

    const startConversation = async product => {
        if (!selected?.owner?.id || working) return;
        setWorking(true);
        try {
            const chat = await onStartChat?.(selected.owner, product);
            if (chat) {
                if (product) {
                    const message = `Hi, I’m interested in ${product.name} listed at ${money(product.price, product.currency)}. Is it available? Please share delivery and payment details.`;
                    window.setTimeout(() => window.dispatchEvent(new CustomEvent('ducor-prefill-chat-message', { detail: { chatId: chat.id, text: message } })), 80);
                }
                onClose?.();
            } else setError('Could not open a chat with this seller. Please try again.');
        } finally { setWorking(false); }
    };

    const startSellerCall = async type => {
        if (!selected?.owner?.id || working) return;
        setWorking(true);
        try {
            const chat = await onStartChat?.(selected.owner);
            if (chat) {
                onClose?.();
                await onStartCall?.(chat, type);
            } else setError('Could not open a chat with this seller. Please try again.');
        } finally { setWorking(false); }
    };

    const selectedWebsite = useMemo(() => websiteHref(selected?.business?.websiteUrl), [selected]);

    return (
        <div className="fixed inset-0 z-[105] flex flex-col bg-[#0b141a] text-white" role="dialog" aria-modal="true" aria-labelledby="shops-title">
            <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#111b21] px-4 py-3 sm:px-6">
                <button type="button" onClick={selected ? () => setSelected(null) : onClose} className="rounded-full p-2 text-gray-300 hover:bg-white/10" aria-label={selected ? 'Back to shops' : 'Close shopping'}>
                    {selected ? <ArrowLeftIcon className="h-5 w-5" /> : <XMarkIcon className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-300">Ducor local marketplace</p><h1 id="shops-title" className="truncate text-lg font-bold">{selected?.business?.businessName || 'Shopping'}</h1></div>
                <button type="button" onClick={onManageShop} className="rounded-full border border-emerald-300/30 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-300/10 sm:px-4 sm:text-sm">List your shop</button>
            </header>

            {selected ? (
                <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-4 sm:p-8">
                    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div>}
                    <section className="grid gap-5 rounded-3xl border border-white/10 bg-gradient-to-br from-[#13272b] to-[#121a20] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
                        <div className="flex min-w-0 items-start gap-4">
                            <img src={selected.owner?.avatar || '/ducor-mark.svg'} alt="" className="h-14 w-14 rounded-2xl bg-white/10 object-cover" />
                            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{selected.business?.category || 'Local shop'}{selected.owner?.verified ? ' · Verified' : ''}</p><h2 className="mt-1 text-2xl font-black">{selected.business?.businessName}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">{selected.business?.description || 'Discover products from this seller.'}</p><p className="mt-2 text-sm text-gray-400">{selected.business?.address || 'Location not provided'}{selected.business?.openingHours ? ` · ${selected.business.openingHours}` : ''}</p></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={working} onClick={() => startConversation()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-[#06251f] disabled:opacity-50"><ChatBubbleLeftRightIcon className="h-5 w-5" />Chat with seller</button>
                            <button type="button" disabled={working} onClick={() => startSellerCall('voice')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/10 disabled:opacity-50"><PhoneIcon className="h-5 w-5" />Call shop</button>
                            <button type="button" disabled={working} onClick={() => startSellerCall('video')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/10 disabled:opacity-50"><VideoCameraIcon className="h-5 w-5" />Video shop</button>
                        </div>
                        {selectedWebsite && <div className="flex flex-wrap gap-4 text-sm text-gray-300 sm:col-span-2"><a href={selectedWebsite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-200 hover:underline">Shop website <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a></div>}
                        <p className="text-xs text-gray-500 sm:col-span-2">Calls stay inside Ducor; phone numbers are not part of the call.</p>
                        {selected.business?.aiSupportEnabled && <p className="text-xs text-violet-200 sm:col-span-2">This shop uses AI customer support while the seller is online. Your message may be processed by its configured AI provider, and AI replies are labeled.</p>}
                    </section>
                    <div className="mb-4 mt-8 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-gray-500">Seller catalogue</p><h3 className="mt-1 text-xl font-black">Products and projects</h3></div><span className="text-xs text-gray-500">{selected.products?.length || 0} items</span></div>
                    {selected.products?.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{selected.products.map(product => <article key={product.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111b21]">
                        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="aspect-[4/3] w-full object-cover" loading="lazy" /> : <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-emerald-900/50 to-slate-800"><ShoppingBagIcon className="h-10 w-10 text-emerald-300/70" /></div>}
                        <div className="p-3"><h4 className="line-clamp-1 text-sm font-bold">{product.name}</h4><p className="mt-1 line-clamp-2 min-h-9 text-xs leading-4 text-gray-400">{product.description || 'Ask the seller for more details.'}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="font-black text-emerald-300">{money(product.price, product.currency)}</span><span className={`text-[10px] font-bold ${product.inStock ? 'text-emerald-400' : 'text-gray-500'}`}>{product.inStock ? 'Available' : 'Out of stock'}</span></div><button type="button" disabled={!product.inStock || working} onClick={() => startConversation(product)} className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2.5 text-xs font-bold hover:bg-emerald-400/15 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{product.inStock ? 'Chat to buy' : 'Unavailable'}</button></div>
                    </article>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">This shop has no items listed yet.</div>}
                    <p className="mt-6 text-xs leading-5 text-gray-500">Purchases are arranged directly with the seller in chat. Confirm item details, delivery, and payment with the shop before paying.</p>
                </main>
            ) : (
                <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-4 sm:p-8">
                    <section className="mb-6 rounded-3xl bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,.2),transparent_38%),linear-gradient(135deg,#10231f,#111b21_55%,#152333)] p-5 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Discover independent sellers</p><h2 className="mt-2 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Your next great find is closer than you think.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-gray-300">Browse local businesses, explore their products, and talk face to face before you buy.</p><div className="mt-5 grid max-w-3xl gap-2 sm:grid-cols-[1fr_220px]"><div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3"><MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-gray-400" /><input aria-label="Search shops" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search shops, products or categories" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500" /></div><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3"><MapPinIcon className="h-5 w-5 shrink-0 text-gray-400" /><input aria-label="Filter by location" value={location} onChange={event => setLocation(event.target.value)} placeholder="City or locality" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500" /></div></div></section>
                    <div className="mb-5 flex gap-2 overflow-x-auto pb-2">{categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${category === item ? 'bg-emerald-400 text-[#06251f]' : 'bg-white/[.06] text-gray-300 hover:bg-white/10'}`}>{item}</button>)}</div>
                    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div>}
                    {loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/[.05]" />)}</div> : shops.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{shops.map(shop => <button key={shop.owner.id} type="button" onClick={() => openShop(shop)} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111b21] text-left transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-[#15232a]">
                        {shop.products?.[0]?.imageUrl ? <img src={shop.products[0].imageUrl} alt="" className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" /> : <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-emerald-950 to-slate-800"><BuildingStorefrontIcon className="h-11 w-11 text-emerald-300/70" /></div>}
                        <div className="p-3 sm:p-4"><div className="flex items-center gap-2"><img src={shop.owner?.avatar || '/ducor-mark.svg'} alt="" className="h-8 w-8 rounded-full bg-white/10 object-cover" /><div className="min-w-0"><p className="truncate text-sm font-bold">{shop.business.businessName}</p><p className="truncate text-[11px] text-gray-500">{shop.business.category} · {shop.business.address || 'Local seller'}</p></div></div><p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-gray-400">{shop.business.description || 'Open shop to browse available items.'}</p><p className="mt-3 text-xs font-bold text-emerald-300">{shop.products?.length || 0} featured items <span className="float-right">View shop →</span></p></div>
                    </button>)}</div> : <div className="rounded-3xl border border-dashed border-white/15 px-5 py-12 text-center"><BuildingStorefrontIcon className="mx-auto h-10 w-10 text-gray-500" /><h3 className="mt-3 text-lg font-bold">No shops found yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-gray-400">Try a different search, or list your shop so customers can find you here.</p><button type="button" onClick={onManageShop} className="mt-5 rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-bold text-[#06251f]">Set up your shop</button></div>}
                    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-gray-400"><strong className="text-white">Are you a seller?</strong> Create a business profile, add products in Business tools, and turn on “List my shop in Shopping” to appear here.</div>
                </main>
            )}
        </div>
    );
}
