import React, { useEffect, useMemo, useState } from 'react';
import { CheckBadgeIcon, LockClosedIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createSafetyNumber } from '../utils/encryption';

const EncryptionInfoModal = ({ chat, user, publicKey, onClose }) => {
    const other = useMemo(() => chat?.participants?.find(item => item.id !== user?.id), [chat, user]);
    const [safety, setSafety] = useState(null);
    const [verified, setVerified] = useState(false);
    const isDirect = !chat?.isGroup && Boolean(other);

    useEffect(() => {
        let active = true;
        if (!isDirect || !publicKey || !other?.publicKey) return undefined;
        createSafetyNumber(publicKey, other.publicKey).then(value => {
            if (!active) return;
            setSafety(value);
            setVerified(localStorage.getItem(`e2ee_verified_${chat.id}_${value.fingerprint}`) === '1');
        }).catch(() => setSafety(null));
        return () => { active = false; };
    }, [chat?.id, isDirect, other?.publicKey, publicKey]);

    const markVerified = () => {
        if (!safety) return;
        localStorage.setItem(`e2ee_verified_${chat.id}_${safety.fingerprint}`, '1');
        setVerified(true);
    };

    return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#111b21] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h2 className="font-bold text-white">Encryption information</h2><button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white"><XMarkIcon className="h-5 w-5" /></button></div>
            <div className="p-6 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400"><LockClosedIcon className="h-8 w-8" /></span>
                <h3 className="mt-4 text-xl font-black text-white">Messages and calls are end-to-end encrypted</h3>
                <p className="mt-2 text-sm leading-6 text-gray-300">Text, photos, videos, voice messages, files and call media are encrypted on your device. CheetChat and the cloud-storage provider cannot read their contents.</p>
                {isDirect && <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-white">Security code with {other.username}</p>{verified && <span className="flex items-center gap-1 text-xs font-bold text-emerald-400"><CheckBadgeIcon className="h-5 w-5" /> Verified</span>}</div>
                    <p className="mt-2 select-all break-words font-mono text-sm leading-7 tracking-wider text-emerald-300">{safety?.display || 'Generating security code…'}</p>
                    <p className="mt-3 text-xs leading-5 text-gray-400">Compare this code with your contact in person or on a trusted call. Both devices must show the same code.</p>
                    {!verified && <button type="button" disabled={!safety} onClick={markVerified} className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Mark this contact as verified</button>}
                </div>}
                {!isDirect && <p className="mt-5 rounded-xl bg-white/5 p-4 text-xs leading-5 text-gray-400">Group messages are encrypted separately for every current participant. A changed participant key will stop sending until it is reviewed.</p>}
                <p className="mt-5 text-[11px] leading-5 text-gray-500">The service can still see limited metadata such as account identifiers, delivery time and encrypted file size.</p>
            </div>
        </div>
    </div>;
};

export default EncryptionInfoModal;
