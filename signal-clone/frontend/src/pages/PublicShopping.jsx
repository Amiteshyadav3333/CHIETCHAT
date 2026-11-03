import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from '../utils/clientRouter';
import { AuthContext } from '../context/AuthContext';

const money = (amount, currency = 'INR') => {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount || 0)); }
    catch { return `₹${Number(amount || 0).toFixed(2)}`; }
};

export default function PublicShopping() {
    const { sellerId, productId } = useParams();
    const navigate = useNavigate();
    const { token } = useContext(AuthContext);
    const [shops, setShops] = useState([]);
    const [store, setStore] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const trackedRef = useRef('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        const request = sellerId
            ? axios.get(`/api/business/storefront/${encodeURIComponent(sellerId)}`).then(({ data }) => ({ store: data }))
            : axios.get('/api/business/shops').then(({ data }) => ({ shops: data.shops || [] }));
        request.then(data => { if (active) { setStore(data.store || null); setShops(data.shops || []); setError(''); } })
            .catch(err => { if (active) setError(err.response?.data?.error || 'This shop or product is unavailable.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [sellerId]);

    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('ref');
        if (!code || trackedRef.current === code) return;
        trackedRef.current = code;
        axios.post(`/api/affiliate/${encodeURIComponent(code)}/click`, {}).catch(() => {});
    }, []);

    const product = useMemo(() => store?.products?.find(item => String(item.id) === String(productId)) || null, [store, productId]);
    const goToProduct = (owner, item) => navigate(`/shop/${encodeURIComponent(owner)}/products/${encodeURIComponent(item.id)}`);
    const requireLogin = () => {
        sessionStorage.setItem('pending_nav', window.location.pathname + window.location.search);
        navigate('/login?mode=login');
    };
    const activity = () => {
        if (!token && !localStorage.getItem('accessToken') && !sessionStorage.getItem('cheetchat_legacy_token')) return requireLogin();
        navigate(`/?shop=${encodeURIComponent(sellerId || store?.owner?.id || '')}&product=${encodeURIComponent(productId || '')}`);
    };
    const share = async (url, title) => {
        const absolute = new URL(url, window.location.origin).href;
        try {
            if (navigator.share) await navigator.share({ title, url: absolute });
            else { await navigator.clipboard.writeText(absolute); window.alert('Link copied.'); }
        } catch (err) { if (err?.name !== 'AbortError') window.alert('Could not share this link.'); }
    };

    const visibleShops = shops.filter(shop => `${shop.business?.businessName || ''} ${shop.business?.category || ''} ${shop.business?.description || ''} ${shop.business?.address || ''} ${(shop.products || []).map(item => item.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));

    return <main className="min-h-screen bg-[#080b0d] px-4 py-8 text-white sm:px-6">
        <div className="mx-auto max-w-6xl">
            <header className="mb-8 flex items-center justify-between gap-4"><a href="/" className="text-sm font-bold text-emerald-300">Ducor</a><button onClick={requireLogin} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold">Log in</button></header>
            {loading ? <p className="py-24 text-center text-gray-400">Loading…</p> : error ? <section className="rounded-3xl border border-white/10 bg-white/[.03] p-10 text-center"><h1 className="text-2xl font-black">Shop unavailable</h1><p className="mt-2 text-gray-400">{error}</p><button onClick={() => navigate('/shopping')} className="mt-5 rounded-full bg-emerald-400 px-5 py-2 font-bold text-black">Browse shops</button></section> : sellerId ? <>
                <button onClick={() => navigate('/shopping')} className="mb-5 text-sm text-emerald-300">← All shops</button>
                <section className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/80 to-slate-900 p-6 sm:p-9">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">{store?.business?.category || 'Independent shop'}</p>
                    <h1 className="mt-2 text-3xl font-black">{store?.business?.businessName}</h1>
                    <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-gray-300">{store?.business?.description || 'Explore products from this shop.'}</p>
                    {store?.business?.address && <p className="mt-3 text-xs text-gray-400">{store.business.address}</p>}
                </section>
                {productId && !product ? <p className="rounded-2xl bg-white/5 p-8 text-center text-gray-300">This product is no longer available.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(product ? [product] : store?.products || []).map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#11191d]">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-white/5 text-gray-500">No product image</div>}
                    <div className="p-4"><h2 className="text-lg font-bold">{item.name}</h2><p className="mt-2 min-h-10 whitespace-pre-wrap text-sm text-gray-400">{item.description || 'Ask the seller for more details.'}</p><div className="mt-4 flex items-center justify-between"><strong className="text-xl text-emerald-300">{money(item.price, item.currency)}</strong><span className={`text-xs font-bold ${item.inStock ? 'text-emerald-300' : 'text-gray-500'}`}>{item.inStock ? 'Available' : 'Out of stock'}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={!item.inStock} onClick={activity} className="rounded-xl bg-emerald-400 px-3 py-3 text-sm font-black text-black disabled:opacity-40">Continue to buy</button><button onClick={() => share(`/shop/${sellerId}/products/${item.id}`, item.name)} className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold">Share product</button></div></div>
                </article>)}</div>}
            </> : <>
                <section className="mb-7 rounded-3xl bg-gradient-to-br from-emerald-950/80 to-slate-900 p-6 sm:p-10"><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Ducor Shopping</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Discover independent shops</h1><p className="mt-2 text-sm text-gray-300">Browse shops and products without signing in. Log in when you are ready to contact a seller or place an order.</p><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search shops and products" className="mt-5 w-full max-w-xl rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></section>
                {visibleShops.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleShops.map(shop => <article key={shop.owner.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#11191d]"><button onClick={() => navigate(`/shop/${shop.owner.id}`)} className="block w-full text-left">{shop.products?.[0]?.imageUrl ? <img src={shop.products[0].imageUrl} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-white/5 text-gray-500">Shop</div>}<div className="p-4"><p className="text-xs font-semibold text-emerald-300">{shop.business?.category}</p><h2 className="mt-1 text-lg font-bold">{shop.business?.businessName}</h2><p className="mt-2 line-clamp-2 text-sm text-gray-400">{shop.business?.description || 'Explore this shop’s products.'}</p><p className="mt-3 text-xs text-gray-500">{shop.products?.length || 0} featured products · {shop.business?.address || 'Location not provided'}</p></div></button>{shop.products?.length > 0 && <div className="flex gap-2 overflow-x-auto px-4 pb-4">{shop.products.slice(0, 3).map(item => <button key={item.id} onClick={() => goToProduct(shop.owner.id, item)} className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold">{item.name} · {money(item.price, item.currency)}</button>)}</div>}</article>)}</div> : <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-gray-400">No shops found.</p>}
            </>}
        </div>
    </main>;
}
