import React, { useEffect } from 'react';

const IncomingChatBell = ({ bell, onSilence }) => {
    useEffect(() => {
        let audioContext;
        const playChime = () => {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                audioContext ||= new AudioContextClass();
                if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
                const now = audioContext.currentTime;
                [880, 1175].forEach((frequency, index) => {
                    const oscillator = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    oscillator.type = 'sine';
                    oscillator.frequency.value = frequency;
                    gain.gain.setValueAtTime(0.0001, now + index * 0.13);
                    gain.gain.exponentialRampToValueAtTime(0.14, now + index * 0.13 + 0.025);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.34);
                    oscillator.connect(gain); gain.connect(audioContext.destination);
                    oscillator.start(now + index * 0.13); oscillator.stop(now + index * 0.13 + 0.36);
                });
            } catch { /* The persistent visual alert still works when autoplay is blocked. */ }
        };
        playChime();
        const timer = window.setInterval(playChime, 1800);
        return () => { window.clearInterval(timer); audioContext?.close().catch(() => {}); };
    }, []);

    return (
        <div className="fixed inset-x-3 top-3 z-[500] mx-auto max-w-sm animate-bounce rounded-2xl border border-amber-300/60 bg-[#21190b] p-4 text-white shadow-[0_0_45px_rgba(251,191,36,.35)]" role="alertdialog" aria-live="assertive" aria-label="Incoming chat bell">
            <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-400/20 text-3xl" aria-hidden="true">🔔</span>
                <div className="min-w-0 flex-1"><p className="font-black">{bell.callerName} is calling your attention</p><p className="mt-1 text-xs text-amber-100/80">Your contact rang the bell in chat.</p></div>
            </div>
            <button type="button" onClick={() => onSilence(bell.bellId)} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-[#231803]">Silence bell</button>
        </div>
    );
};

export default IncomingChatBell;
