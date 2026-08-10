import React, { useEffect, useRef, useState } from 'react';
import { ArrowUturnLeftIcon, PhotoIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';

const COLORS = ['#ffffff', '#22c55e', '#38bdf8', '#facc15', '#fb7185', '#a78bfa', '#111827'];

const DrawStudio = ({ onClose, onSend, onSendDrawing, initialSource = null, inline = false }) => {
    const canvasRef = useRef(null);
    const fileRef = useRef(null);
    const historyRef = useRef([]);
    const drawingRef = useRef(false);
    const startRef = useRef(null);
    const snapshotRef = useRef(null);
    const activePointsRef = useRef([]);
    const actionsRef = useRef([]);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#22c55e');
    const [size, setSize] = useState(5);
    const [caption, setCaption] = useState('');

    const paintMedia = React.useCallback((source, isVideo = false) => {
        const canvas = canvasRef.current;
        if (!canvas || !source) return;
        const media = document.createElement(isVideo ? 'video' : 'img');
        media.crossOrigin = 'anonymous';
        media.muted = true;
        media.playsInline = true;
        const draw = () => {
            const width = media.videoWidth || media.naturalWidth;
            const height = media.videoHeight || media.naturalHeight;
            if (!width || !height) return;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(canvas.width / width, canvas.height / height);
            const w = width * scale; const h = height * scale;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(media, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
            saveHistory();
        };
        if (isVideo) { media.addEventListener('loadeddata', () => { media.currentTime = Math.min(0.1, media.duration || 0); }); media.addEventListener('seeked', draw, { once: true }); }
        else media.addEventListener('load', draw, { once: true });
        media.src = source;
    }, []);

    const saveHistory = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        historyRef.current = [...historyRef.current.slice(-19), canvas.toDataURL()];
    };

    const restore = (url) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const image = new Image();
        image.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); };
        image.src = url;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const previous = canvas.width ? canvas.toDataURL() : null;
            canvas.width = Math.max(320, Math.floor(rect.width));
            canvas.height = Math.max(360, Math.floor(rect.height));
            const ctx = canvas.getContext('2d');
            if (inline) ctx.clearRect(0, 0, canvas.width, canvas.height);
            else { ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            if (previous) restore(previous);
            else saveHistory();
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    useEffect(() => {
        if (!initialSource) return;
        const timer = window.setTimeout(() => paintMedia(initialSource.src, initialSource.type === 'video'), 80);
        return () => window.clearTimeout(timer);
    }, [initialSource, paintMedia]);

    const point = (event) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const source = event.touches?.[0] || event;
        return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };

    const start = (event) => {
        event.preventDefault();
        const ctx = canvasRef.current.getContext('2d');
        const p = point(event);
        drawingRef.current = true;
        startRef.current = p;
        activePointsRef.current = [p];
        snapshotRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
    };

    const move = (event) => {
        if (!drawingRef.current) return;
        event.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const p = point(event);
        activePointsRef.current.push(p);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.globalAlpha = tool === 'highlighter' ? 0.3 : 1;
        ctx.lineWidth = tool === 'highlighter' ? size * 4 : size;
        if (tool === 'arrow') {
            ctx.putImageData(snapshotRef.current, 0, 0);
            ctx.beginPath(); ctx.moveTo(startRef.current.x, startRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            const angle = Math.atan2(p.y - startRef.current.y, p.x - startRef.current.x);
            ctx.beginPath(); ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - 18 * Math.cos(angle - Math.PI / 6), p.y - 18 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(p.x - 18 * Math.cos(angle + Math.PI / 6), p.y - 18 * Math.sin(angle + Math.PI / 6));
            ctx.closePath(); ctx.fill();
        } else { ctx.lineTo(p.x, p.y); ctx.stroke(); }
        ctx.globalAlpha = 1;
    };

    const end = () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        const canvas = canvasRef.current;
        const normalize = p => ({ x: Math.round((p.x / canvas.width) * 1000), y: Math.round((p.y / canvas.height) * 1000) });
        const points = activePointsRef.current.map(normalize);
        if (points.length > 1) actionsRef.current.push({ tool, color, size, points: tool === 'arrow' ? [points[0], points[points.length - 1]] : points });
        saveHistory();
    };
    const addText = () => {
        const value = window.prompt('Canvas par kya likhna hai?');
        if (!value) return;
        const ctx = canvasRef.current.getContext('2d');
        ctx.fillStyle = color; ctx.font = `700 ${Math.max(22, size * 5)}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText(value, canvasRef.current.width / 2, canvasRef.current.height / 2);
        actionsRef.current.push({ tool: 'text', color, size, text: value.slice(0, 240), x: 500, y: 500 });
        saveHistory();
    };
    const addPhoto = (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.type.startsWith('video/')) {
            const url = URL.createObjectURL(file);
            paintMedia(url, true);
            window.setTimeout(() => URL.revokeObjectURL(url), 5000);
            return;
        }
        const image = new Image();
        image.onload = () => {
            const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
            const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
            const w = image.width * scale; const h = image.height * scale;
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h); saveHistory();
            URL.revokeObjectURL(image.src);
        };
        image.src = URL.createObjectURL(file);
    };
    const send = () => {
        if (onSendDrawing && actionsRef.current.length) {
            onSendDrawing({ version: 1, width: 1000, height: 1000, background: initialSource?.src ? { src: initialSource.src, type: initialSource.type } : null, actions: actionsRef.current, caption: caption.trim() });
            return;
        }
        canvasRef.current.toBlob(blob => {
        if (!blob) return;
        onSend(new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' }), caption.trim());
        }, 'image/png');
    };

    return (
        <div className={`${inline ? 'absolute inset-0 z-[55] bg-black/10 backdrop-blur-[1px]' : 'fixed inset-0 z-[100] bg-[#090e11]'} flex flex-col text-white`}>
            <header className="flex h-16 items-center gap-3 border-b border-white/10 bg-[#111b21]/95 px-4">
                <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><XMarkIcon className="h-6 w-6" /></button>
                <div className="flex-1"><h2 className="font-bold">Draw & point</h2><p className="text-xs text-gray-400">Photo, chat screenshot ya blank canvas par mark karein</p></div>
                <button onClick={() => { const h = historyRef.current; if (h.length > 1) { h.pop(); actionsRef.current.pop(); restore(h[h.length - 1]); } }} className="rounded-full p-2 hover:bg-white/10" title="Undo"><ArrowUturnLeftIcon className="h-5 w-5" /></button>
                <button onClick={() => { actionsRef.current = []; const ctx = canvasRef.current.getContext('2d'); if (inline) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); else { ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); } saveHistory(); }} className="rounded-full p-2 hover:bg-white/10" title="Clear"><TrashIcon className="h-5 w-5" /></button>
            </header>
            <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/10 bg-[#111b21] p-3">
                {['pen', 'highlighter', 'arrow'].map(item => <button key={item} onClick={() => setTool(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${tool === item ? 'bg-[#00a884]' : 'bg-white/10'}`}>{item}</button>)}
                <button onClick={addText} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">Text</button>
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"><PhotoIcon className="h-4 w-4" /> Photo</button>
                <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addPhoto} />
                <span className="mx-1 h-6 w-px bg-white/10" />
                {COLORS.map(c => <button key={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-white/20'}`} style={{ background: c }} aria-label={`Choose ${c}`} />)}
                <input type="range" min="2" max="14" value={size} onChange={e => setSize(Number(e.target.value))} className="w-24 accent-[#00a884]" />
            </div>
            <main className={`min-h-0 flex-1 ${inline ? '' : 'p-2 sm:p-4'}`}><canvas ref={canvasRef} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} className={`h-full w-full touch-none ${inline ? 'bg-transparent' : 'rounded-2xl bg-[#111827] shadow-2xl'}`} /></main>
            <footer className="flex items-center gap-2 border-t border-white/10 bg-[#111b21] p-3 sm:px-6">
                <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption likhein…" className="min-w-0 flex-1 rounded-full bg-[#202c33] px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-[#00a884]" />
                <button onClick={send} className="rounded-full bg-[#00a884] px-5 py-3 text-sm font-bold hover:bg-[#079474]">Send drawing</button>
            </footer>
        </div>
    );
};

export default DrawStudio;
