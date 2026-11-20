export const getRazorpayUpiPrefill = user => {
    const prefill = {};
    if (user?.username) prefill.name = user.username;
    if (user?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) prefill.email = user.email;

    const rawPhone = String(user?.phone || '').trim();
    if (!rawPhone.startsWith('google:')) {
        const digits = rawPhone.replace(/\D/g, '');
        if (rawPhone.startsWith('+') && digits.length >= 8 && digits.length <= 15) prefill.contact = `+${digits}`;
        else if (digits.length === 10) prefill.contact = `+91${digits}`;
        else if (digits.length > 10 && digits.length <= 15) prefill.contact = `+${digits}`;
    }

    // Razorpay preselects UPI only when both email and phone are supplied.
    if (prefill.email && prefill.contact) prefill.method = 'upi';
    return prefill;
};

// Keep UPI at the top of Razorpay Checkout while leaving other enabled
// payment methods available as a fallback. This also works for subscription
// mandate authorisation when UPI Autopay is enabled on the Razorpay account.
export const getRazorpayUpiCheckoutConfig = () => ({
    display: {
        blocks: {
            upi: {
                name: 'Pay via UPI',
                instruments: [{ method: 'upi' }],
            },
        },
        sequence: ['block.upi'],
        preferences: { show_default_blocks: true },
    },
});
