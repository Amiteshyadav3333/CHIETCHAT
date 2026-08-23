import React, { useCallback, useEffect, useRef, useState } from 'react';

export const CHARO_LANES = 3;
const COLLECTIBLES = [
    { type: 'food', icon: '🍎', label: 'Energy Food', points: 20, escape: 6 },
    { type: 'book', icon: '📘', label: 'Motivation Book', points: 35, escape: 4 },
    { type: 'gadget', icon: '⌚', label: 'Smart Gadget', points: 50, escape: 9 },
];
const MOTIVATION = ['Keep moving forward!', 'Dream big. Run farther.', 'Discipline creates freedom.', 'You are stronger than fear.', 'Every step builds your future.'];

export const createCharoState = (random = Math.random) => ({
    lane: 1, distance: 0, bonus: 0, demonGap: 72, collected: { food: 0, book: 0, gadget: 0 },
    items: createItems(2, 28, random), gameOver: false, message: 'Run! The demon is coming…',
});
export const createItems = (from, to, random = Math.random) => {
    const items = [];
    for (let at = from; at <= to; at += 2 + Math.floor(random() * 3)) items.push({ at, lane: Math.floor(random() * CHARO_LANES), ...COLLECTIBLES[Math.floor(random() * COLLECTIBLES.length)] });
    return items;
};
export const takeCharoStep = (state, random = Math.random) => {
    if (state.gameOver) return state;
    const distance = state.distance + 1;
    const found = state.items.find(item => item.at === distance && item.lane === state.lane);
    let items = state.items.filter(item => item.at > distance);
    const furthest = Math.max(distance + 8, ...items.map(item => item.at));
    if (furthest < distance + 22) items = [...items, ...createItems(furthest + 2, distance + 30, random)];
    const collected = { ...state.collected };
    if (found) collected[found.type] += 1;
    return {
        ...state, distance, items, collected,
        bonus: state.bonus + (found?.points || 0),
        demonGap: Math.min(100, state.demonGap + 3.5 + (found?.escape || 0)),
        message: found ? (found.type === 'book' ? MOTIVATION[distance % MOTIVATION.length] : `${found.label} +${found.points}`) : state.message,
        lastCollected: found?.type || null,
    };
};
export const drainDemonGap = (state, amount) => {
    if (state.gameOver) return state;
    const demonGap = state.demonGap - amount;
    return { ...state, demonGap: Math.max(0, demonGap), gameOver: demonGap <= 0, message: demonGap <= 0 ? 'The demon caught CHARO!' : state.message };
};

const highScore = () => { try { return Number(localStorage.getItem('cheetchat_charo_best')) || 0; } catch { return 0; } };

export const CharoGame = () => {
    const canvasRef = useRef(null);
    const stateRef = useRef(createCharoState());
    const starsRef = useRef(Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), size: 0.4 + Math.random() * 2.2, phase: Math.random() * 6.28 })));
    const audioRef = useRef(null);
    const lastFrameRef = useRef(0);
    const lastStepRef = useRef(0);
    const [view, setView] = useState(stateRef.current);
    const [running, setRunning] = useState(false);
    const [muted, setMuted] = useState(false);
    const [best, setBest] = useState(highScore);
    const score = view.distance * 10 + view.bonus;

    const tone = useCallback((kind) => {
        if (muted) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext; audioRef.current ||= new AudioContext(); const ctx = audioRef.current; ctx.resume?.();
            const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination);
            const frequencies = { step: [130, 100], food: [440, 660], book: [520, 880], gadget: [700, 1100], over: [180, 45] }; const [from, to] = frequencies[kind] || frequencies.step;
            osc.type = kind === 'over' ? 'sawtooth' : kind === 'step' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(from, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + 0.16);
            gain.gain.setValueAtTime(0.001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(kind === 'step' ? 0.04 : 0.16, ctx.currentTime + 0.01); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); osc.start(); osc.stop(ctx.currentTime + 0.21);
        } catch { /* optional audio */ }
    }, [muted]);
    const unlockAudio = useCallback(() => { if (!muted) try { const AudioContext = window.AudioContext || window.webkitAudioContext; audioRef.current ||= new AudioContext(); audioRef.current.resume?.(); } catch { /* optional */ } }, [muted]);
    const publish = useCallback(next => { stateRef.current = next; setView(next); const total = next.distance * 10 + next.bonus; setBest(old => { const value = Math.max(old, total); try { localStorage.setItem('cheetchat_charo_best', String(value)); } catch { /* ignore */ } return value; }); }, []);

    const moveLane = useCallback(delta => {
        if (!running || stateRef.current.gameOver) return;
        publish({ ...stateRef.current, lane: Math.max(0, Math.min(2, stateRef.current.lane + delta)) });
    }, [running, publish]);
    const step = useCallback(() => {
        if (!running || stateRef.current.gameOver || performance.now() - lastStepRef.current < 115) return;
        lastStepRef.current = performance.now(); const next = takeCharoStep(stateRef.current); publish(next); tone(next.lastCollected || 'step');
    }, [running, publish, tone]);
    const restart = useCallback(() => { unlockAudio(); const next = createCharoState(); stateRef.current = next; setView(next); setRunning(true); lastFrameRef.current = performance.now(); }, [unlockAudio]);

    useEffect(() => {
        const key = event => {
            if (['ArrowLeft','ArrowRight','ArrowDown',' ','a','A','d','D','s','S'].includes(event.key)) event.preventDefault();
            if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') moveLane(-1);
            if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') moveLane(1);
            if (event.key === 'ArrowDown' || event.key === ' ' || event.key.toLowerCase() === 's') step();
        };
        window.addEventListener('keydown', key, { passive: false }); return () => window.removeEventListener('keydown', key);
    }, [moveLane, step]);

    useEffect(() => {
        if (!running) return undefined;
        let frame;
        const loop = now => {
            const elapsed = Math.min(0.05, (now - (lastFrameRef.current || now)) / 1000); lastFrameRef.current = now;
            const next = drainDemonGap(stateRef.current, elapsed * (5.2 + stateRef.current.distance / 180));
            if (next.gameOver && !stateRef.current.gameOver) { tone('over'); setRunning(false); }
            stateRef.current = next;
            if (Math.floor(now / 100) !== Math.floor((now - elapsed * 1000) / 100)) setView({ ...next });
            if (!next.gameOver) frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop); return () => cancelAnimationFrame(frame);
    }, [running, tone]);

    useEffect(() => {
        let frame;
        const draw = time => {
            const canvas = canvasRef.current;
            if (canvas) {
                const box = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
                if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) { canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr); }
                const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); drawWorld(ctx, box.width, box.height, stateRef.current, starsRef.current, time);
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
    }, []);

    return <div className="w-full max-w-[680px] text-white">
        <div className="rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-indigo-950 via-violet-950 to-cyan-950 p-3 text-center shadow-lg"><h3 className="text-lg font-black tracking-[.18em]">🚀 CHARO</h3><p className="mt-1 text-[11px] text-cyan-200/70">Infinite Space Stair Adventure</p></div>
        <div className="my-3 grid grid-cols-4 gap-2"><Stat label="Distance" value={`${view.distance}m`} /><Stat label="Score" value={score} /><Stat label="Best" value={best} /><Stat label="Demon" value={`${Math.ceil(view.demonGap)}m`} danger={view.demonGap < 25} /></div>
        <div className="relative mx-auto aspect-[9/13] max-h-[68vh] w-full max-w-[500px] overflow-hidden rounded-[1.7rem] border-[7px] border-indigo-950 shadow-[0_25px_60px_rgba(0,0,0,.75),inset_0_2px_0_rgba(255,255,255,.25)]">
            <canvas ref={canvasRef} className="h-full w-full bg-[#030314]" aria-label="CHARO 3D space stair game" />
            <div className="pointer-events-none absolute left-3 right-3 top-3"><div className="h-2 overflow-hidden rounded-full bg-red-950/80"><div className={`h-full transition-all ${view.demonGap < 25 ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-red-500 via-yellow-400 to-emerald-400'}`} style={{ width: `${view.demonGap}%` }} /></div><p className="mt-1 text-center text-[10px] font-bold text-white/70">Demon escape distance</p></div>
            {view.lastCollected && <div key={`${view.distance}-${view.lastCollected}`} className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 animate-bounce rounded-full bg-black/65 px-4 py-2 text-sm font-black text-yellow-300">{view.message}</div>}
            {!running && <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-5 text-center backdrop-blur-sm"><div><div className="text-6xl">{view.gameOver ? '👹' : '🌟'}</div><h2 className="mt-3 text-3xl font-black">{view.gameOver ? 'Demon Caught You!' : 'Save CHARO'}</h2><p className="mt-2 text-sm text-white/65">{view.gameOver ? `You travelled ${view.distance} metres · Score ${score}` : 'Run down the infinite stairs and collect your future.'}</p><button onClick={view.gameOver ? restart : () => { unlockAudio(); setRunning(true); lastFrameRef.current = performance.now(); }} className="mt-5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 py-3 text-sm font-black text-gray-950 shadow-lg">{view.gameOver ? 'Run again' : 'Start adventure'}</button></div></div>}
        </div>
        <div className="mx-auto mt-4 grid max-w-sm grid-cols-3 gap-2"><Control label="← LEFT" onClick={() => moveLane(-1)} /><Control label="🏃 RUN" primary onClick={step} /><Control label="RIGHT →" onClick={() => moveLane(1)} /></div>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-white/55"><span>🍎 {view.collected.food}</span><span>📘 {view.collected.book}</span><span>⌚ {view.collected.gadget}</span><button onClick={() => setMuted(v => !v)}>{muted ? '🔇' : '🔊'}</button></div>
        <p className="mt-3 text-center text-xs text-white/45">A/D or arrows change lanes · Space/Down runs · keep moving or the demon catches you</p>
    </div>;
};

const drawWorld = (ctx, width, height, state, stars, time) => {
    const gradient = ctx.createLinearGradient(0,0,0,height); gradient.addColorStop(0,'#05051f'); gradient.addColorStop(.5,'#13072d'); gradient.addColorStop(1,'#02030c'); ctx.fillStyle = gradient; ctx.fillRect(0,0,width,height);
    const nebula = ctx.createRadialGradient(width*.2,height*.32,0,width*.2,height*.32,width*.65); nebula.addColorStop(0,'rgba(94,64,255,.22)'); nebula.addColorStop(1,'transparent'); ctx.fillStyle = nebula; ctx.fillRect(0,0,width,height);
    stars.forEach(star => { const alpha = .25 + .75 * Math.abs(Math.sin(time/700 + star.phase)); ctx.fillStyle = `rgba(220,240,255,${alpha})`; ctx.beginPath(); ctx.arc(star.x*width, star.y*height, star.size, 0, Math.PI*2); ctx.fill(); });
    const horizon = height * .18, base = height * .91;
    for (let depth = 13; depth >= 0; depth--) {
        const t1 = depth / 14, t2 = (depth + 1) / 14; const y1 = horizon + (base-horizon) * Math.pow(t1,1.7), y2 = horizon + (base-horizon) * Math.pow(t2,1.7);
        const w1 = width * (.1 + .72*Math.pow(t1,1.25)), w2 = width * (.1 + .72*Math.pow(t2,1.25));
        ctx.beginPath(); ctx.moveTo(width/2-w1/2,y1); ctx.lineTo(width/2+w1/2,y1); ctx.lineTo(width/2+w2/2,y2); ctx.lineTo(width/2-w2/2,y2); ctx.closePath();
        const shade = depth % 2 ? 34 : 47; ctx.fillStyle = `rgb(${shade},${36+depth*2},${74+depth*4})`; ctx.fill(); ctx.strokeStyle='rgba(128,190,255,.32)'; ctx.stroke();
        for (let lane=1; lane<3; lane++) { ctx.beginPath(); ctx.moveTo(width/2-w1/2+w1*lane/3,y1); ctx.lineTo(width/2-w2/2+w2*lane/3,y2); ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.stroke(); }
    }
    state.items.filter(item => item.at > state.distance && item.at <= state.distance+12).forEach(item => {
        const depth = item.at-state.distance; const t = 1-depth/14; const y = horizon+(base-horizon)*Math.pow(t,1.7); const roadWidth=width*(.1+.72*Math.pow(t,1.25)); const x=width/2-roadWidth/2+roadWidth*(item.lane+.5)/3; const size=14+34*t;
        ctx.font=`${size}px sans-serif`; ctx.textAlign='center'; ctx.shadowColor=item.type==='book'?'#60a5fa':'#facc15'; ctx.shadowBlur=12; ctx.fillText(item.icon,x,y); ctx.shadowBlur=0;
    });
    const laneX = width/2-width*.82/2+width*.82*(state.lane+.5)/3; ctx.font=`${Math.max(42,width*.13)}px sans-serif`; ctx.textAlign='center'; ctx.shadowColor='#60a5fa'; ctx.shadowBlur=18; ctx.fillText('🧒',laneX,base-20-Math.abs(Math.sin(time/90))*7); ctx.shadowBlur=0;
    const danger = 1-state.demonGap/100; const demonSize=Math.max(30,width*(.08+.13*danger)); ctx.font=`${demonSize}px sans-serif`; ctx.shadowColor='#ef4444'; ctx.shadowBlur=20; ctx.fillText('👹',width/2,height-8); ctx.shadowBlur=0;
};
const Stat = ({ label, value, danger }) => <div className="rounded-xl border border-white/10 bg-white/5 py-2 text-center"><p className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</p><p className={`mt-0.5 text-sm font-black ${danger ? 'animate-pulse text-red-400' : 'text-cyan-300'}`}>{value}</p></div>;
const Control = ({ label, onClick, primary }) => <button onClick={onClick} className={`h-12 rounded-xl border text-xs font-black shadow-[0_5px_0_rgba(0,0,0,.45)] active:translate-y-1 active:shadow-none ${primary ? 'border-cyan-300/40 bg-gradient-to-b from-cyan-400 to-blue-600 text-gray-950' : 'border-white/10 bg-gradient-to-b from-white/15 to-white/5'}`}>{label}</button>;
