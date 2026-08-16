import React, { useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { AuthContext } from '../context/AuthContext';

const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector('script[data-cheetchat-razorpay]');
    if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Payment checkout failed to load')), { once: true });
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.cheetchatRazorpay = '1';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Payment checkout failed to load'));
    document.head.appendChild(script);
});

const newPaymentRequestId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
};

const VerifiedPaymentComposer = ({ open, onClose, chatId, payeeId, payeeName, onVerified }) => {
    const { token } = useContext(AuthContext);
    const [form, setForm] = useState({ amount: '', note: '' });
    const [error, setError] = useState('');
    const [starting, setStarting] = useState(false);
    const requestIdRef = useRef(newPaymentRequestId());

    useEffect(() => {
        if (open) setError('');
    }, [open]);

    if (!open) return null;

    const startPayment = async event => {
        event.preventDefault();
        const amount = Number(form.amount);
        if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
            setError('The amount must be between ₹1 and ₹1,00,000.');
            return;
        }
        if (!chatId || !payeeId) {
            setError('Business recipient is unavailable.');
            return;
        }
        if (!token) {
            setError('Your session expired. Please sign in again.');
            return;
        }
        setError('');
        setStarting(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const configResponse = await axios.get('/api/payments/config', { headers });
            if (!configResponse.data?.enabled) {
                throw new Error('Verified payments are not configured yet.');
            }
            const orderResponse = await axios.post('/api/payments/orders', {
                chatId, payeeId, amount, description: form.note.trim(),
                clientRequestId: requestIdRef.current,
            }, { headers });
            await loadRazorpayCheckout();
            const { payment, checkout } = orderResponse.data;
            const checkoutInstance = new window.Razorpay({
                key: checkout.keyId,
                amount: Math.round(payment.amount * 100),
                currency: payment.currency,
                name: 'CHEETCHAT Pay',
                description: payment.description || `Payment to ${payeeName || 'business'}`,
                order_id: payment.providerOrderId,
                handler: async providerResult => {
                    try {
                        const verified = await axios.post(
                            `/api/payments/orders/${payment.id}/verify`, providerResult, { headers }
                        );
                        onVerified({ ...verified.data, payeeName: payeeName || 'Business' });
                        setForm({ amount: '', note: '' });
                        requestIdRef.current = newPaymentRequestId();
                        onClose();
                    } catch (verificationError) {
                        setError(verificationError.response?.data?.error || 'Payment verification failed. Check your bank before retrying.');
                    }
                },
                modal: { ondismiss: () => setError('Payment was not completed.') },
                theme: { color: '#10b981' },
            });
            checkoutInstance.on('payment.failed', response => {
                setError(response.error?.description || 'Payment failed.');
            });
            checkoutInstance.open();
        } catch (paymentError) {
            setError(paymentError.response?.data?.error || paymentError.message || 'Could not start verified payment.');
        } finally {
            setStarting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
            <form onSubmit={startPayment} onClick={event => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#101d19] shadow-2xl">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-5 text-white">
                    <div className="flex items-start justify-between">
                        <div><span className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest">Provider verified</span><h3 className="mt-3 text-2xl font-black">CHEETCHAT Pay</h3><p className="text-xs text-emerald-50/80">Secure Razorpay checkout</p></div>
                        <button type="button" onClick={onClose} className="rounded-full bg-black/15 p-2"><XMarkIcon className="h-5 w-5" /></button>
                    </div>
                </div>
                <div className="space-y-4 p-5">
                    <div className="rounded-xl border border-white/10 bg-[#1d2d27] px-4 py-3 text-sm text-white">Paying verified business: <strong>{payeeName || 'Current business'}</strong></div>
                    <label className="relative block text-xs font-semibold text-gray-300">Amount<span className="absolute bottom-3 left-4 text-xl font-bold text-emerald-400">₹</span><input type="number" min="1" max="100000" step="0.01" value={form.amount} onChange={event => { requestIdRef.current = newPaymentRequestId(); setForm({ ...form, amount: event.target.value }); }} placeholder="0.00" required className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#1d2d27] py-3 pl-9 pr-4 text-xl font-black text-white outline-none focus:border-emerald-400" /></label>
                    <label className="block text-xs font-semibold text-gray-300">Note (optional)<input maxLength={80} value={form.note} onChange={event => { requestIdRef.current = newPaymentRequestId(); setForm({ ...form, note: event.target.value }); }} placeholder="What is this payment for?" className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#1d2d27] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400" /></label>
                    {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
                    <button type="submit" disabled={starting} className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-black text-black hover:bg-emerald-400 disabled:opacity-60">{starting ? 'Starting secure checkout…' : 'Pay securely'}</button>
                    <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center text-[10px] leading-4 text-emerald-200">The receipt is sent only after server signature verification and provider reconciliation.</p>
                    <p className="text-center text-[10px] leading-4 text-gray-500">CHEETCHAT never stores your UPI PIN, card number or bank credentials.</p>
                </div>
            </form>
        </div>
    );
};

export default VerifiedPaymentComposer;
