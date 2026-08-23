import React, { useCallback, useEffect, useRef, useState } from 'react';

export const BOARD_SIZE = 20;
const VECTORS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const placeSnakeFood = (snake, random = Math.random) => {
    const occupied = new Set(snake.map(point => `${point.x}-${point.y}`));
    const empty = [];
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) if (!occupied.has(`${x}-${y}`)) empty.push({ x, y });
    return empty.length ? empty[Math.floor(random() * empty.length)] : null;
};

export const advanceSnake = ({ snake, direction, food }) => {
    const vector = VECTORS[direction];
    if (!vector || !snake.length) return { snake, food, ate: false, crashed: true };
    const head = { x: snake[0].x + vector.x, y: snake[0].y + vector.y };
    const ate = Boolean(food && head.x === food.x && head.y === food.y);
    const bodyToCheck = ate ? snake : snake.slice(0, -1);
    const crashed = head.x < 0 || head.y < 0 || head.x >= BOARD_SIZE || head.y >= BOARD_SIZE || bodyToCheck.some(point => point.x === head.x && point.y === head.y);
    if (crashed) return { snake, food, ate: false, crashed: true };
    return { snake: [head, ...snake.slice(0, ate ? snake.length : -1)], food, ate, crashed: false };
};

const initialSnake = () => [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
const readHighScore = () => {
    try { return Number(localStorage.getItem('cheetchat_snake_high_score')) || 0; } catch { return 0; }
};

export const SnakeGame = () => {
    const [snake, setSnake] = useState(initialSnake);
    const [food, setFood] = useState(() => placeSnakeFood(initialSnake()));
    const [direction, setDirection] = useState('right');
    const [running, setRunning] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(readHighScore);
    const [muted, setMuted] = useState(false);
    const directionRef = useRef('right');
    const lockedRef = useRef(false);
    const audioRef = useRef(null);
    const touchRef = useRef(null);
    const level = Math.floor(score / 50) + 1;
    const speed = Math.max(65, 170 - (level - 1) * 12);

    const sound = useCallback((kind) => {
        if (muted) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioRef.current ||= new AudioContext();
            const ctx = audioRef.current;
            if (ctx.state === 'suspended') ctx.resume();
            const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
            oscillator.connect(gain); gain.connect(ctx.destination);
            oscillator.type = kind === 'eat' ? 'square' : 'sawtooth';
            oscillator.frequency.setValueAtTime(kind === 'eat' ? 520 : 150, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(kind === 'eat' ? 880 : 55, ctx.currentTime + (kind === 'eat' ? 0.11 : 0.3));
            gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'eat' ? 0.13 : 0.35));
            oscillator.start(); oscillator.stop(ctx.currentTime + (kind === 'eat' ? 0.14 : 0.36));
        } catch { /* Audio is optional on restricted browsers. */ }
    }, [muted]);
    const unlockSound = useCallback(() => {
        if (muted) return;
        try { const AudioContext = window.AudioContext || window.webkitAudioContext; audioRef.current ||= new AudioContext(); audioRef.current.resume?.(); } catch { /* optional */ }
    }, [muted]);

    const changeDirection = useCallback(next => {
        if (!VECTORS[next] || lockedRef.current || OPPOSITE[directionRef.current] === next) return;
        directionRef.current = next; setDirection(next); lockedRef.current = true;
    }, []);

    const reset = useCallback(() => {
        unlockSound();
        const fresh = initialSnake(); setSnake(fresh); setFood(placeSnakeFood(fresh));
        directionRef.current = 'right'; setDirection('right'); setScore(0); setGameOver(false); setRunning(true); lockedRef.current = false;
    }, [unlockSound]);

    useEffect(() => {
        const keydown = event => {
            const keys = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
            if (keys[event.key]) { event.preventDefault(); changeDirection(keys[event.key]); if (!gameOver) setRunning(true); }
            if (event.code === 'Space') { event.preventDefault(); setRunning(value => !value); }
        };
        window.addEventListener('keydown', keydown, { passive: false });
        return () => window.removeEventListener('keydown', keydown);
    }, [changeDirection, gameOver]);

    useEffect(() => {
        if (!running || gameOver) return undefined;
        const timer = window.setInterval(() => {
            setSnake(current => {
                const result = advanceSnake({ snake: current, direction: directionRef.current, food });
                lockedRef.current = false;
                if (result.crashed) { setRunning(false); setGameOver(true); sound('crash'); return current; }
                if (result.ate) {
                    sound('eat');
                    setScore(value => {
                        const next = value + 10; setHighScore(high => { const best = Math.max(high, next); try { localStorage.setItem('cheetchat_snake_high_score', String(best)); } catch { /* ignore */ } return best; }); return next;
                    });
                    setFood(placeSnakeFood(result.snake));
                }
                return result.snake;
            });
        }, speed);
        return () => window.clearInterval(timer);
    }, [running, gameOver, food, speed, sound]);

    const cells = new Map(); snake.forEach((point, index) => cells.set(`${point.x}-${point.y}`, index));
    const swipeEnd = event => {
        if (!touchRef.current) return;
        const touch = event.changedTouches[0]; const dx = touch.clientX - touchRef.current.x; const dy = touch.clientY - touchRef.current.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) changeDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        touchRef.current = null;
    };

    return <div className="w-full max-w-[620px] select-none text-white">
        <div className="rounded-2xl border border-lime-400/25 bg-gradient-to-r from-emerald-950 to-lime-950 p-3 text-center shadow-lg"><div className="font-black">🐍 Nokia Snake 3D</div><div className="mt-1 text-[11px] text-lime-200/70">Solo arcade · eat, grow and survive</div></div>
        <div className="my-3 grid grid-cols-4 gap-2 text-center"><Stat label="Score" value={score} /><Stat label="Best" value={highScore} /><Stat label="Level" value={level} /><Stat label="Speed" value={`${Math.round(1000 / speed)}×`} /></div>
        <div className="relative mx-auto w-full max-w-[560px] rounded-[1.4rem] border-[8px] border-[#17210d] bg-[#17210d] p-2 shadow-[0_22px_50px_rgba(0,0,0,.7),inset_0_2px_0_rgba(255,255,255,.2)] [transform:perspective(1100px)_rotateX(3deg)]" onTouchStart={e => { const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY }; }} onTouchEnd={swipeEnd}>
            <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] overflow-hidden rounded-xl border-2 border-lime-800 bg-[#8fb36a] shadow-[inset_0_8px_20px_rgba(22,60,20,.45)]">
                {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
                    const x = i % BOARD_SIZE, y = Math.floor(i / BOARD_SIZE), body = cells.get(`${x}-${y}`), isFood = food?.x === x && food?.y === y;
                    return <div key={i} className={`relative aspect-square border-[0.5px] border-lime-950/10 ${(x + y) % 2 ? 'bg-lime-900/[.04]' : 'bg-white/[.025]'}`}>
                        {body !== undefined && <div className={`absolute inset-[7%] rounded-[28%] border border-lime-200/60 bg-gradient-to-br ${body === 0 ? 'from-lime-200 via-emerald-500 to-emerald-900' : 'from-lime-300 via-green-600 to-emerald-950'} shadow-[0_3px_3px_rgba(0,0,0,.55),inset_0_2px_2px_rgba(255,255,255,.6)] ${body === 0 ? 'z-10 scale-110' : ''}`}>{body === 0 && <><span className="absolute left-[18%] top-[18%] h-[18%] w-[18%] rounded-full bg-white"><i className="block h-1/2 w-1/2 rounded-full bg-black" /></span><span className="absolute right-[18%] top-[18%] h-[18%] w-[18%] rounded-full bg-white"><i className="block h-1/2 w-1/2 rounded-full bg-black" /></span></>}</div>}
                        {isFood && <div className="absolute inset-[12%] animate-pulse rounded-full border border-red-200 bg-gradient-to-br from-yellow-200 via-red-500 to-red-900 shadow-[0_0_9px_#ef4444,0_3px_3px_rgba(0,0,0,.6)]"><span className="absolute left-1/2 top-[-28%] h-[35%] w-[18%] -translate-x-1/2 rotate-12 rounded bg-green-800" /></div>}
                    </div>;
                })}
            </div>
            {!running && <div className="absolute inset-2 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-[2px]"><div className="text-center"><div className="text-5xl">{gameOver ? '💥' : '🐍'}</div><h3 className="mt-2 text-2xl font-black">{gameOver ? 'Game Over' : score ? 'Paused' : 'Ready?'}</h3><p className="mt-1 text-xs text-white/60">{gameOver ? `Final score: ${score}` : 'Arrow keys, WASD or swipe'}</p><button onClick={gameOver ? reset : () => { unlockSound(); setRunning(true); }} className="mt-4 rounded-xl bg-lime-400 px-7 py-3 text-sm font-black text-emerald-950 shadow-lg">{gameOver ? 'Play again' : 'Start game'}</button></div></div>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 mx-auto max-w-[230px]"><span /><Control label="▲" onClick={() => changeDirection('up')} /><button onClick={() => setMuted(value => !value)} className="rounded-xl bg-white/5 text-lg">{muted ? '🔇' : '🔊'}</button><Control label="◀" onClick={() => changeDirection('left')} /><Control label={running ? 'Ⅱ' : '▶'} onClick={() => !gameOver && setRunning(value => !value)} /><Control label="▶" onClick={() => changeDirection('right')} /><span /><Control label="▼" onClick={() => changeDirection('down')} /></div>
        <p className="mt-3 text-center text-xs text-white/45">Moving {direction} · food sound · progressive levels · keyboard + mobile controls · Space to pause</p>
    </div>;
};

const Stat = ({ label, value }) => <div className="rounded-xl border border-white/10 bg-white/5 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</p><p className="mt-0.5 text-sm font-black text-lime-300">{value}</p></div>;
const Control = ({ label, onClick }) => <button onClick={onClick} className="h-12 rounded-xl border border-white/10 bg-gradient-to-b from-white/15 to-white/5 text-lg font-black shadow-[0_4px_0_rgba(0,0,0,.4)] active:translate-y-1 active:shadow-none">{label}</button>;
