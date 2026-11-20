import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from '../utils/clientRouter';
import { AuthContext } from '../context/AuthContext';
import { getRazorpayUpiPrefill } from '../utils/razorpayCheckout';

const loadRazorpay = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error('Secure checkout could not be loaded.'));
    document.head.appendChild(script);
});

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
    const [guestProduct, setGuestProduct] = useState(null);
    const [guestDetails, setGuestDetails] = useState({ name: '', email: '', phone: '', address: '' });
    const [deliveryOptionId, setDeliveryOptionId] = useState('');
    const [guestBusy, setGuestBusy] = useState(false);
    const [guestError, setGuestError] = useState('');
    const [guestSuccess, setGuestSuccess] = useState('');
    const [guestOrderSession, setGuestOrderSession] = useState(null);

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
    const activity = item => {
        navigate(`/?shop=${encodeURIComponent(sellerId || store?.owner?.id || '')}&product=${encodeURIComponent(item?.id || productId || '')}`);
    };
    const startShopping = item => {
        if (token || localStorage.getItem('accessToken') || sessionStorage.getItem('cheetchat_legacy_token')) return activity(item);
        setGuestProduct(item);
        setGuestOrderSession(null);
        setGuestError(''); setGuestSuccess('');
        setDeliveryOptionId(String(store?.deliveryOptions?.[0]?.id || ''));
    };
    const openSellerRegistration = mode => {
        if (token || localStorage.getItem('accessToken') || sessionStorage.getItem('cheetchat_legacy_token')) {
            navigate('/settings?seller=1');
            return;
        }
        sessionStorage.setItem('pending_seller_setup', '1');
        navigate(mode === 'register' ? '/signup?intent=seller' : '/login?mode=login&intent=seller');
    };
    const openGuestCheckout = async () => {
        if (!guestProduct || !store?.owner?.id || !deliveryOptionId || guestBusy) return;
        setGuestBusy(true); setGuestError(''); setGuestSuccess('');
        try {
            const randomId = () => globalThis.crypto?.randomUUID?.() || `g${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const guestAccessToken = `${randomId()}${randomId()}`;
            const requestId = randomId();
            const { data } = await axios.post('/api/business/guest-orders', {
                requestId, guestAccessToken, sellerId: store.owner.id,
                deliveryOptionId: Number(deliveryOptionId), deliveryAddress: guestDetails.address,
                name: guestDetails.name, email: guestDetails.email, phone: guestDetails.phone,
                items: [{ productId: guestProduct.id, quantity: 1 }],
                affiliateCode: new URLSearchParams(window.location.search).get('ref') || undefined,
            });
            const nextSession = { orderId: data.order.id, guestAccessToken, checkoutEnabled: data.checkoutEnabled };
            setGuestOrderSession(nextSession);
            if (data.checkoutEnabled) await startGuestPayment(nextSession);
            else setGuestSuccess(`Order request #${data.order.id} sent to ${store.business.businessName}. The shop will contact you to arrange payment.`);
        } catch (err) {
            setGuestError(err.response?.data?.error || err.message || 'Could not place this order. Please try again.');
        } finally { setGuestBusy(false); }
    };
    const startGuestPayment = async orderSession => {
        setGuestBusy(true); setGuestError('');
        try {
            const { data } = await axios.post(`/api/marketplace/guest-orders/${orderSession.orderId}/checkout`, {
                guestAccessToken: orderSession.guestAccessToken,
                clientRequestId: globalThis.crypto?.randomUUID?.() || `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            });
            await loadRazorpay();
            const instance = new window.Razorpay({
                key: data.checkout.keyId, amount: Math.round(data.payment.amount * 100), currency: data.payment.currency,
                name: 'Ducor Shopping', description: `Order #${orderSession.orderId}`, order_id: data.payment.providerOrderId,
                prefill: getRazorpayUpiPrefill({ username: guestDetails.name, email: guestDetails.email, phone: guestDetails.phone }),
                handler: async result => {
                    try {
                        const verified = await axios.post(`/api/payments/orders/${data.payment.id}/verify`, {
                            ...result, guestAccessToken: orderSession.guestAccessToken,
                        });
                        if (verified.data.status === 'captured') {
                            setGuestSuccess(`Payment verified. Order #${orderSession.orderId} is with the shop.`);
                            setGuestOrderSession(null);
                        } else setGuestError('Payment is still being confirmed. Keep this page open and try again shortly.');
                    } catch (err) { setGuestError(err.response?.data?.error || 'Payment is being checked. Please try again shortly.'); }
                },
                modal: { ondismiss: () => setGuestError('Checkout closed. Your order is not confirmed; you can continue payment here.') },
                theme: { color: '#10b981' },
            });
            instance.on('payment.failed', event => setGuestError(event.error?.description || 'Payment failed. You can try again.'));
            instance.open();
        } catch (err) { setGuestError(err.response?.data?.error || err.message || 'Secure checkout could not start.'); }
        finally { setGuestBusy(false); }
    };
    const share = async (url, title) => {
        const absolute = new URL(url, window.location.origin).href;
        try {
            if (navigator.share) await navigator.share({ title, url: absolute });
            else { await navigator.clipboard.writeText(absolute); window.alert('Link copied.'); }
        } catch (err) { if (err?.name !== 'AbortError') window.alert('Could not share this link.'); }
    };

    const visibleShops = shops.filter(shop => `${shop.business?.businessName || ''} ${shop.business?.category || ''} ${shop.business?.description || ''} ${shop.business?.address || ''} ${(shop.products || []).map(item => item.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));

    return <>
    <main className="min-h-screen bg-[#080b0d] px-4 py-8 text-white sm:px-6">
        <div className="mx-auto max-w-6xl">
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><a href="/" className="text-sm font-bold text-emerald-300">Ducor</a><div className="flex items-center gap-3 text-xs text-gray-300 sm:text-sm"><span>Have a shop?</span><button onClick={() => openSellerRegistration('register')} className="rounded-full bg-emerald-400 px-4 py-2 font-bold text-[#06251f]">List your shop</button><button onClick={() => openSellerRegistration('login')} className="rounded-full border border-white/15 px-3 py-2 font-semibold">Seller log in</button></div></header>
            {loading ? <p className="py-24 text-center text-gray-400">Loading…</p> : error ? <section className="rounded-3xl border border-white/10 bg-white/[.03] p-10 text-center"><h1 className="text-2xl font-black">Shop unavailable</h1><p className="mt-2 text-gray-400">{error}</p><button onClick={() => navigate('/shopping')} className="mt-5 rounded-full bg-emerald-400 px-5 py-2 font-bold text-black">Browse shops</button></section> : sellerId ? <>
                <button onClick={() => navigate('/shopping')} className="mb-5 text-sm text-emerald-300">← All shops</button>
                <section className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/80 to-slate-900 p-6 sm:p-9">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">{store?.business?.category || 'Independent shop'}</p>
                    <h1 className="mt-2 text-3xl font-black">{store?.business?.businessName}</h1>
                    <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-gray-300">{store?.business?.description || 'Explore products from this shop.'}</p>
                    {store?.business?.address && <p className="mt-3 text-xs text-gray-400">{store.business.address}</p>}
                    <p className="mt-4 text-xs text-gray-400">Browse and place an order without creating a Ducor account.</p>
                </section>
                {productId && !product ? <p className="rounded-2xl bg-white/5 p-8 text-center text-gray-300">This product is no longer available.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(product ? [product] : store?.products || []).map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#11191d]">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-white/5 text-gray-500">No product image</div>}
                    <div className="p-4"><h2 className="text-lg font-bold">{item.name}</h2><p className="mt-2 min-h-10 whitespace-pre-wrap text-sm text-gray-400">{item.description || 'Ask the seller for more details.'}</p><div className="mt-4 flex items-center justify-between"><strong className="text-xl text-emerald-300">{money(item.price, item.currency)}</strong><span className={`text-xs font-bold ${item.inStock ? 'text-emerald-300' : 'text-gray-500'}`}>{item.inStock ? 'Available' : 'Out of stock'}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={!item.inStock} onClick={() => startShopping(item)} className="rounded-xl bg-emerald-400 px-3 py-3 text-sm font-black text-black disabled:opacity-40">Buy this item</button><button onClick={() => share(`/shop/${sellerId}/products/${item.id}`, item.name)} className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold">Share product</button></div></div>
                </article>)}</div>}
            </> : <>
                <section className="mb-7 rounded-3xl bg-gradient-to-br from-emerald-950/80 to-slate-900 p-6 sm:p-10"><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Ducor Shopping</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Discover independent shops</h1><p className="mt-2 text-sm text-gray-300">Browse shops and products, then place an order with your contact and delivery details. No buyer account needed.</p><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search shops and products" className="mt-5 w-full max-w-xl rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-emerald-400" /></section>
                {visibleShops.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleShops.map(shop => <article key={shop.owner.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#11191d]"><button onClick={() => navigate(`/shop/${shop.owner.id}`)} className="block w-full text-left">{shop.products?.[0]?.imageUrl ? <img src={shop.products[0].imageUrl} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-white/5 text-gray-500">Shop</div>}<div className="p-4"><p className="text-xs font-semibold text-emerald-300">{shop.business?.category}</p><h2 className="mt-1 text-lg font-bold">{shop.business?.businessName}</h2><p className="mt-2 line-clamp-2 text-sm text-gray-400">{shop.business?.description || 'Explore this shop’s products.'}</p><p className="mt-3 text-xs text-gray-500">{shop.products?.length || 0} featured products · {shop.business?.address || 'Location not provided'}</p></div></button>{shop.products?.length > 0 && <div className="flex gap-2 overflow-x-auto px-4 pb-4">{shop.products.slice(0, 3).map(item => <button key={item.id} onClick={() => goToProduct(shop.owner.id, item)} className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold">{item.name} · {money(item.price, item.currency)}</button>)}</div>}</article>)}</div> : <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-gray-400">No shops found.</p>}
            </>}
        </div>
    </main>
    {guestProduct && <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/75 p-4 text-white backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="guest-checkout-title"><section className="my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-[#11191d] p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Guest checkout</p><h2 id="guest-checkout-title" className="mt-1 text-2xl font-black">{guestProduct.name}</h2><p className="mt-1 text-sm text-gray-400">{store?.business?.businessName} · {money(guestProduct.price, guestProduct.currency)}</p></div><button onClick={() => setGuestProduct(null)} className="rounded-full px-3 py-1 text-xl text-gray-400 hover:bg-white/10" aria-label="Close checkout">×</button></div>
        {guestSuccess ? <div><p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">{guestSuccess}</p><button onClick={() => setGuestProduct(null)} className="mt-5 w-full rounded-xl bg-emerald-400 py-3 font-black text-[#06251f]">Done</button></div> : <>
            <p className="mb-4 text-sm leading-6 text-gray-400">No account needed. Add your contact details so the shop can handle delivery or pickup and send you order updates.</p>
            <form onSubmit={event => { event.preventDefault(); if (guestOrderSession?.checkoutEnabled) startGuestPayment(guestOrderSession); else openGuestCheckout(); }} className="space-y-3">
                <input required minLength={2} maxLength={120} autoComplete="name" value={guestDetails.name} onChange={event => setGuestDetails({ ...guestDetails, name: event.target.value })} placeholder="Your name" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                <input required type="email" maxLength={120} autoComplete="email" value={guestDetails.email} onChange={event => setGuestDetails({ ...guestDetails, email: event.target.value })} placeholder="Email address" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                <input required type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="tel-national" value={guestDetails.phone} onChange={event => setGuestDetails({ ...guestDetails, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit mobile number" className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                <label className="block text-xs font-semibold text-gray-300">Delivery or pickup<select required value={deliveryOptionId} onChange={event => setDeliveryOptionId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white">{(store?.deliveryOptions || []).map(option => <option key={option.id} value={option.id}>{option.label} · {money(option.fee)} · {option.etaDays} day ETA</option>)}</select></label>
                {store?.deliveryOptions?.find(option => String(option.id) === String(deliveryOptionId))?.mode === 'seller_delivery' && <textarea required minLength={8} maxLength={500} autoComplete="street-address" value={guestDetails.address} onChange={event => setGuestDetails({ ...guestDetails, address: event.target.value })} placeholder="House, street, locality, city" rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-emerald-400" />}
                {guestError && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{guestError}</p>}
                {guestOrderSession?.checkoutEnabled ? <button type="submit" disabled={guestBusy} className="w-full rounded-xl bg-emerald-400 py-3 font-black text-[#06251f] disabled:opacity-50">{guestBusy ? 'Opening secure checkout…' : 'Continue payment'}</button> : <button type="submit" disabled={guestBusy || !deliveryOptionId} className="w-full rounded-xl bg-emerald-400 py-3 font-black text-[#06251f] disabled:opacity-50">{guestBusy ? 'Placing order…' : 'Place order'}</button>}
                <p className="text-center text-[11px] leading-5 text-gray-500">Your contact details are shared with this shop only to fulfill your order. Online checkout, when available, is verified by Razorpay.</p>
            </form>
        </>}</section></div>}
    </>;
}
