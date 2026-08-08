import React, { useMemo, useState } from 'react';
import { useNavigate } from '../utils/clientRouter';
import { ArrowDownTrayIcon, ClipboardDocumentIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const RecoveryCode = () => {
    const navigate = useNavigate();
    const code = useMemo(() => sessionStorage.getItem('recovery_code_once') || '', []);
    const [confirmed, setConfirmed] = useState(false);
    const [copied, setCopied] = useState(false);

    const download = () => {
        const blob = new Blob([
            `CHEETCHAT RECOVERY CODE\n\n${code}\n\nKeep this offline. Anyone with this code and access to your account recovery email may restore your encrypted chats.`,
        ], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'cheetchat-recovery-code.txt';
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const continueSetup = () => {
        sessionStorage.removeItem('recovery_code_once');
        sessionStorage.removeItem('pending_nav');
        navigate('/setup-profile');
    };

    if (!code) return <div className="flex min-h-screen items-center justify-center bg-[#08090b] text-white">Recovery code is no longer available.</div>;

    return (
        <main className="flex min-h-[100dvh] items-center justify-center bg-[#08090b] p-4 text-white">
            <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#121418] p-7 shadow-2xl">
                <ShieldCheckIcon className="mb-4 h-12 w-12 text-emerald-400" />
                <h1 className="text-2xl font-black">Save your recovery code</h1>
                <p className="mt-2 text-sm leading-6 text-gray-400">Password bhoolne par isi code se purani encrypted chats restore hongi. CHEETCHAT is code ko dobara show nahi kar sakta.</p>
                <div className="my-6 break-all rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center font-mono text-lg font-bold tracking-wider text-emerald-200">{code}</div>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); }} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-sm font-bold"><ClipboardDocumentIcon className="h-5 w-5" />{copied ? 'Copied' : 'Copy'}</button>
                    <button onClick={download} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-sm font-bold"><ArrowDownTrayIcon className="h-5 w-5" />Download</button>
                </div>
                <label className="mt-6 flex items-start gap-3 text-sm text-gray-300"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" /><span>I saved this code somewhere private and understand that losing it can make old encrypted chats unrecoverable.</span></label>
                <button disabled={!confirmed} onClick={continueSetup} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 font-black text-black disabled:opacity-40">Continue profile setup</button>
            </section>
        </main>
    );
};

export default RecoveryCode;
