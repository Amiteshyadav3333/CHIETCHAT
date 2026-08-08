import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '../utils/clientRouter';
import { KeyIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { protectPrivateKeyWithPassword, restorePrivateKeyWithPassword } from '../utils/encryption';

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
    const [recoveryCode, setRecoveryCode] = useState('');
    const [keyBackup, setKeyBackup] = useState(null);
    const [checkingLink, setCheckingLink] = useState(true);
    const navigate = useNavigate();
    const accessToken = useMemo(() => getResetAccessToken(), []);

    useEffect(() => {
        if (!accessToken) { setCheckingLink(false); return; }
        axios.post('/api/reset-password/key-backup', { accessToken })
            .then(response => setKeyBackup(response.data))
            .catch(error => setMessage(error.response?.data?.error || 'Reset link is invalid or expired.'))
            .finally(() => setCheckingLink(false));
    }, [accessToken]);

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
            let encryptedPrivateKey = null;
            if (keyBackup?.recoveryRequired) {
                if (!recoveryCode.trim()) throw new Error('Recovery code is required to preserve encrypted chats.');
                const privateKey = await restorePrivateKeyWithPassword(keyBackup.encryptedRecoveryKey, recoveryCode.trim());
                encryptedPrivateKey = await protectPrivateKeyWithPassword(privateKey, password);
            }
            const res = await axios.post('/api/reset-password', {
                accessToken,
                newPassword: password,
                encryptedPrivateKey,
            });
            setMessage(res.data.message || 'Password reset successfully.');
            setTimeout(() => navigate('/login'), 1200);
        } catch (err) {
            setMessage(err.response?.data?.error || err.message || 'Unable to reset password. Check your recovery code.');
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
                    {keyBackup?.recoveryRequired && (
                        <div>
                            <input
                                type="password"
                                placeholder="CHEETCHAT recovery code"
                                value={recoveryCode}
                                onChange={event => setRecoveryCode(event.target.value)}
                                className="w-full rounded-lg border border-emerald-500/30 bg-signal-input px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                                required
                            />
                            <p className="mt-2 text-xs leading-5 text-gray-400">This code decrypts your chat key locally. It is never sent to CHEETCHAT.</p>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={submitting || checkingLink}
                        className="w-full rounded-lg bg-signal-accent py-3 font-bold text-white transition-colors hover:bg-signal-accentHover disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {checkingLink ? 'Checking reset link...' : submitting ? 'Please wait...' : 'Update password'}
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
