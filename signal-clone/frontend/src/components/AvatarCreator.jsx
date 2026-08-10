import React, { useMemo, useState } from 'react';
import axios from 'axios';

const FACES = ['🙂', '😊', '😎', '🤓', '🥰', '🧔', '👩', '👨'];
const ACCESSORIES = ['', '✨', '🎧', '👑', '🌈', '⚡', '🌸', '🕶️'];
const BACKGROUNDS = ['#7c3aed', '#0ea5e9', '#10b981', '#f97316', '#ec4899', '#111827'];

const AvatarCreator = ({ token, onCreated }) => {
    const [face, setFace] = useState('😎');
    const [accessory, setAccessory] = useState('✨');
    const [background, setBackground] = useState('#7c3aed');
    const [busy, setBusy] = useState(false);
    const svg = useMemo(() => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="256" fill="${background}"/><circle cx="256" cy="270" r="170" fill="rgba(255,255,255,.14)"/><text x="256" y="335" text-anchor="middle" font-size="230" font-family="Apple Color Emoji,Segoe UI Emoji,sans-serif">${face}</text><text x="405" y="145" text-anchor="middle" font-size="90" font-family="Apple Color Emoji,Segoe UI Emoji,sans-serif">${accessory}</text></svg>`, [face, accessory, background]);
    const preview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const randomize = () => { setFace(FACES[Math.floor(Math.random() * FACES.length)]); setAccessory(ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)]); setBackground(BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]); };
    const save = async () => {
        setBusy(true);
        try {
            const image = new Image();
            const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = imageUrl; });
            const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
            canvas.getContext('2d').drawImage(image, 0, 0, 512, 512); URL.revokeObjectURL(imageUrl);
            const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
            const data = new FormData(); data.append('avatar', new File([png], `avatar-${Date.now()}.png`, { type: 'image/png' }));
            const response = await axios.post('/api/user/avatar', data, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
            onCreated?.(response.data.user);
        } catch (error) { alert(error.response?.data?.error || 'Avatar save nahi ho saka.'); }
        finally { setBusy(false); }
    };
    return <div className="space-y-5 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-5">
        <div className="flex items-center gap-4"><img src={preview} alt="Avatar preview" className="h-24 w-24 rounded-full ring-4 ring-white/10" /><div><h3 className="font-semibold text-white">Create your avatar</h3><p className="mt-1 text-xs leading-5 text-gray-400">Face, vibe aur background choose karein.</p></div></div>
        <Choices label="Face" values={FACES} selected={face} onSelect={setFace} />
        <Choices label="Accessory" values={ACCESSORIES} selected={accessory} onSelect={setAccessory} />
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Background</p><div className="flex flex-wrap gap-3">{BACKGROUNDS.map(value => <button type="button" aria-label={value} key={value} onClick={() => setBackground(value)} className={`h-9 w-9 rounded-full border-2 ${background === value ? 'scale-110 border-white' : 'border-transparent'}`} style={{ background: value }} />)}</div></div>
        <div className="flex gap-2"><button type="button" onClick={randomize} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-gray-200">Surprise me</button><button type="button" disabled={busy} onClick={save} className="flex-1 rounded-xl bg-[#00a884] py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Use avatar'}</button></div>
    </div>;
};

const Choices = ({ label, values, selected, onSelect }) => <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><div className="flex flex-wrap gap-2">{values.map((value, index) => <button type="button" key={`${value}-${index}`} onClick={() => onSelect(value)} className={`flex h-11 min-w-11 items-center justify-center rounded-xl border px-2 text-2xl ${selected === value ? 'border-[#00a884] bg-[#00a884]/15' : 'border-white/10 bg-white/5'}`}>{value || <span className="text-xs text-gray-400">None</span>}</button>)}</div></div>;

export default AvatarCreator;
