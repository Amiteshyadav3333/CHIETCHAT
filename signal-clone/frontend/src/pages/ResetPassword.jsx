import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { KeyIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const getResetAccessToken = () => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    return hashParams.get('access_token') || searchParams.get('access_token') || '';
};

const ResetPassword = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();
    const accessToken = useMemo(() => getResetAccessToken(), []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        if (!accessToken) {
            setMessage('Reset link is invalid or expired. Please request a new link.');
            return;
        }
        if (password !== confirmPassword) {
            setMessage('New password and confirm password do not match.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await axios.post('/api/reset-password', {
                accessToken,
                newPassword: password
            });
            setMessage(res.data.message || 'Password reset successfully.');
            setTimeout(() => navigate('/login'), 1200);
        } catch (err) {
            setMessage(err.response?.data?.error || 'Unable to reset password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#08090b] p-4 text-signal-text">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121418] p-8 shadow-2xl">
                <div className="mb-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-signal-accent/15 text-signal-accent">
                        <ShieldCheckIcon className="h-6 w-6" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-normal">Set new password</h1>
                    <p className="mt-2 text-sm leading-6 text-gray-400">
                        Create a new password for your CHEETCHAT account.
                    </p>
                </div>

                {message && (
                    <div className="mb-4 rounded-lg border border-signal-accent/40 bg-signal-accent/10 px-4 py-3 text-sm">
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                        <input
                            type="password"
                            placeholder="New password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-signal-input py-3 pl-11 pr-4 text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30"
                            minLength={6}
                            required
                        />
                    </div>
                    <input
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-signal-input px-4 py-3 text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30"
                        minLength={6}
                        required
                    />
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-signal-accent py-3 font-bold text-white transition-colors hover:bg-signal-accentHover disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {submitting ? 'Please wait...' : 'Update password'}
                    </button>
                </form>

                <Link to="/login" className="mt-6 block text-center text-sm font-semibold text-signal-accent hover:underline">
                    Back to login
                </Link>
            </div>
        </div>
    );
};

export default ResetPassword;
