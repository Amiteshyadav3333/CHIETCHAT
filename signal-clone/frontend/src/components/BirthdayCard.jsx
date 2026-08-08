import { useState } from 'react';

const CONFETTI = ['🎊', '✨', '🎉', '⭐', '💫', '🎈'];

const playCelebrationTone = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.12;
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.3);
    });
    window.setTimeout(() => context.close().catch(() => {}), 800);
};

const BirthdayCard = ({ data }) => {
    const [isRevealed, setIsRevealed] = useState(false);

    const handleReveal = event => {
        event.stopPropagation();
        event.preventDefault();
        setIsRevealed(true);
        if (data.playMusic) playCelebrationTone();
    };

    const themeColor = data.theme?.color || 'from-fuchsia-500 to-pink-500';
    const fontStyle = data.font?.style || "'Inter', sans-serif";
    const effect = data.effect?.id || 'none';

    if (!isRevealed && data.interactive) {
        return (
            <button
                type="button"
                onClick={handleReveal}
                className="group relative flex h-[320px] w-[260px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-fuchsia-500/40 bg-gradient-to-b from-[#1c2431] to-[#111b21] shadow-[0_0_30px_rgba(217,70,239,0.15)] transition-all hover:border-fuchsia-400"
                aria-label="Open birthday gift"
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.16),transparent_25%),radial-gradient(circle_at_80%_70%,rgba(217,70,239,.18),transparent_30%)]" />
                <div className="relative z-10 text-7xl drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-transform duration-500 group-hover:scale-125">🎁</div>
                <div className="relative z-10 mt-8 rounded-full border border-fuchsia-500/50 bg-fuchsia-500/20 px-6 py-2 text-sm font-extrabold uppercase tracking-widest text-fuchsia-300 shadow-xl backdrop-blur-md transition-colors group-hover:bg-fuchsia-500/40">Tap to Open</div>
                <div className="relative z-10 mt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Special Gift Enclosed</div>
            </button>
        );
    }

    return (
        <div className="flex w-[280px] origin-center animate-open-envelope flex-col gap-2 sm:w-[320px]">
            <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-white/30 bg-gradient-to-br ${themeColor} p-8 text-center shadow-[0_10px_40px_rgba(0,0,0,0.5)]`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,.25),transparent_22%),radial-gradient(circle_at_85%_75%,rgba(255,255,255,.18),transparent_25%)]" />
                {effect !== 'none' && CONFETTI.map((item, index) => (
                    <span
                        key={`${item}-${index}`}
                        aria-hidden="true"
                        className="absolute z-10 animate-pulse text-xl"
                        style={{ left: `${8 + index * 16}%`, top: `${8 + (index % 3) * 28}%`, animationDelay: `${index * 120}ms` }}
                    >
                        {effect === 'balloons' ? '🎈' : effect === 'stars' ? '⭐' : item}
                    </span>
                ))}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0" />
                <div className="relative z-20 mt-2 text-7xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]">{data.theme?.icon || '🎂'}</div>
                <h3 className="relative z-20 mt-8 w-full break-words px-2 text-2xl font-extrabold leading-snug text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" style={{ fontFamily: fontStyle, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                    {data.message || 'Happy Birthday! 🎉'}
                </h3>
                {data.playMusic && (
                    <div className="relative z-20 mt-8 flex items-center justify-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/90 shadow-inner backdrop-blur-md">
                        <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" /> Local celebration sound
                    </div>
                )}
            </div>
        </div>
    );
};

export default BirthdayCard;
