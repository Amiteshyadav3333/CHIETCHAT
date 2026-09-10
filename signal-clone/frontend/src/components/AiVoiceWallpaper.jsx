import React, { useEffect, useRef } from 'react';

export const AI_WALLPAPER_THEMES = [
    { id: 'quantum_sphere', name: 'Quantum Orb', icon: '🔮', desc: 'Glowing plasma core with liquid voice ripples' },
    { id: 'cosmic_nebula', name: 'Cosmic Nebula', icon: '🌌', desc: 'Galactic stardust with gravitational voice waves' },
    { id: 'cyber_aurora', name: 'Cyber Aurora', icon: '⚡', desc: 'Undulating neon emerald & cyan aurora waves' },
    { id: 'sunset_glow', name: 'Sunset Horizon', icon: '🌅', desc: 'Warm golden & magenta harmonic sunset soundwaves' },
];

export default function AiVoiceWallpaper({
    theme = 'quantum_sphere',
    aiSpeaking = false,
    userSpeaking = false,
    loading = false,
    callState = 'connected',
    stream = null,
}) {
    const canvasRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const dataArrayRef = useRef(null);

    // Setup live audio analyser if a media stream is available
    useEffect(() => {
        if (!stream) return undefined;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return undefined;
            const ctx = new AudioContextClass();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            audioContextRef.current = ctx;
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

            return () => {
                ctx.close().catch(() => {});
            };
        } catch {
            return undefined;
        }
    }, [stream]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const ctx = canvas.getContext('2d');
        let animId;
        let time = 0;
        let energy = 0.2;

        // Particle system
        const particleCount = 45;
        const particles = Array.from({ length: particleCount }, () => ({
            x: Math.random(),
            y: Math.random(),
            vx: (Math.random() - 0.5) * 0.0015,
            vy: (Math.random() - 0.5) * 0.0015,
            size: Math.random() * 2.5 + 1,
            baseAlpha: Math.random() * 0.6 + 0.2,
            pulseOffset: Math.random() * Math.PI * 2,
        }));

        const handleResize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.scale(dpr, dpr);
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        const render = () => {
            time += 0.025;
            const width = window.innerWidth;
            const height = window.innerHeight;
            const cx = width / 2;
            const cy = height * 0.42; // Center around the avatar area

            // Determine voice intensity target
            let targetEnergy = 0.15; // idle breathing
            if (analyserRef.current && dataArrayRef.current && userSpeaking) {
                analyserRef.current.getByteFrequencyData(dataArrayRef.current);
                const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
                targetEnergy = Math.max(0.2, avg / 128);
            } else if (aiSpeaking) {
                // Procedural rhythmic vocal modulation for AI
                targetEnergy = 0.65 + Math.sin(time * 5.2) * 0.25 + Math.sin(time * 11.4) * 0.1;
            } else if (userSpeaking) {
                targetEnergy = 0.55 + Math.sin(time * 6.5) * 0.2;
            } else if (loading) {
                targetEnergy = 0.4 + Math.sin(time * 3.5) * 0.15;
            }

            // Smooth interpolation
            energy += (targetEnergy - energy) * 0.12;

            // 1. Draw Background Gradient
            ctx.save();
            let bgGrad;
            switch (theme) {
                case 'cyber_aurora':
                    bgGrad = ctx.createLinearGradient(0, 0, width, height);
                    bgGrad.addColorStop(0, '#031412');
                    bgGrad.addColorStop(0.5, '#062822');
                    bgGrad.addColorStop(1, '#02100d');
                    break;
                case 'sunset_glow':
                    bgGrad = ctx.createLinearGradient(0, 0, width, height);
                    bgGrad.addColorStop(0, '#1c0818');
                    bgGrad.addColorStop(0.5, '#2e0f2b');
                    bgGrad.addColorStop(1, '#150616');
                    break;
                case 'cosmic_nebula':
                    bgGrad = ctx.createLinearGradient(0, 0, width, height);
                    bgGrad.addColorStop(0, '#0a091e');
                    bgGrad.addColorStop(0.5, '#170e38');
                    bgGrad.addColorStop(1, '#080614');
                    break;
                case 'quantum_sphere':
                default:
                    bgGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(width, height) * 0.85);
                    bgGrad.addColorStop(0, '#1b1238');
                    bgGrad.addColorStop(0.4, '#100c24');
                    bgGrad.addColorStop(1, '#060410');
                    break;
            }
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);

            // 2. Theme Specific Central Voice-Reactive Core & Waves
            if (theme === 'quantum_sphere') {
                // Liquid Quantum Orb pulsating with voice
                const baseRadius = 85 + energy * 45;
                const ringCount = 5;

                for (let i = ringCount; i >= 1; i--) {
                    const r = baseRadius + i * 26 * (0.8 + energy * 0.5);
                    const grad = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, r);
                    const hue = aiSpeaking ? 280 : userSpeaking ? 165 : 255;
                    grad.addColorStop(0, `hsla(${hue}, 90%, 65%, ${0.25 / i})`);
                    grad.addColorStop(0.7, `hsla(${hue + 30}, 85%, 55%, ${0.12 / i})`);
                    grad.addColorStop(1, 'transparent');

                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                }

                // Wavy acoustic ripple circles
                if (energy > 0.25) {
                    ctx.lineWidth = 1.8;
                    const rippleHue = aiSpeaking ? '280' : userSpeaking ? '170' : '220';
                    ctx.strokeStyle = `hsla(${rippleHue}, 90%, 65%, ${Math.min(0.6, energy * 0.7)})`;

                    ctx.beginPath();
                    const points = 60;
                    const rippleRadius = baseRadius + 30;
                    for (let p = 0; p <= points; p++) {
                        const angle = (p / points) * Math.PI * 2;
                        const distortion = Math.sin(angle * 7 + time * 6) * (energy * 18) +
                                           Math.cos(angle * 4 - time * 4) * (energy * 10);
                        const rad = rippleRadius + distortion;
                        const x = cx + Math.cos(angle) * rad;
                        const y = cy + Math.sin(angle) * rad;
                        if (p === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            } else if (theme === 'cyber_aurora') {
                // Flowing neon ribbons of aurora that dance with speech
                const bands = 4;
                for (let b = 0; b < bands; b++) {
                    ctx.beginPath();
                    const waveY = cy + (b - 1.5) * 45;
                    ctx.moveTo(0, height);

                    for (let x = 0; x <= width; x += 15) {
                        const freq = 0.0035 + b * 0.001;
                        const speed = 1.8 + b * 0.6;
                        const amp = (25 + energy * 65) * (1 + b * 0.2);
                        const y = waveY + Math.sin(x * freq + time * speed) * amp +
                                  Math.cos(x * 0.007 - time * 1.5) * (amp * 0.4);
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(width, height);
                    ctx.closePath();

                    const auroraGrad = ctx.createLinearGradient(0, cy - 80, 0, height);
                    const hue = b % 2 === 0 ? 160 : 185;
                    auroraGrad.addColorStop(0, `hsla(${hue}, 95%, 55%, ${0.18 + energy * 0.2})`);
                    auroraGrad.addColorStop(0.6, `hsla(${hue + 20}, 90%, 45%, ${0.08 + energy * 0.1})`);
                    auroraGrad.addColorStop(1, 'transparent');
                    ctx.fillStyle = auroraGrad;
                    ctx.fill();
                }
            } else if (theme === 'cosmic_nebula') {
                // Swirling nebula with voice gravitational distortion
                const coreR = 120 + energy * 60;
                const nebGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, coreR * 2.2);
                nebGrad.addColorStop(0, `rgba(168, 85, 247, ${0.35 + energy * 0.3})`);
                nebGrad.addColorStop(0.35, `rgba(99, 102, 241, ${0.2 + energy * 0.2})`);
                nebGrad.addColorStop(0.7, `rgba(236, 72, 153, ${0.1 + energy * 0.15})`);
                nebGrad.addColorStop(1, 'transparent');

                ctx.beginPath();
                ctx.arc(cx, cy, coreR * 2, 0, Math.PI * 2);
                ctx.fillStyle = nebGrad;
                ctx.fill();

                // Swirling energy spiral arms
                const spiralRays = 3;
                ctx.lineWidth = 2.5;
                for (let s = 0; s < spiralRays; s++) {
                    ctx.beginPath();
                    const startAngle = (s / spiralRays) * Math.PI * 2 + time * (0.8 + energy * 1.2);
                    ctx.strokeStyle = `rgba(192, 132, 252, ${0.25 + energy * 0.4})`;

                    for (let d = 30; d < coreR * 1.8; d += 8) {
                        const a = startAngle + d * 0.025;
                        const px = cx + Math.cos(a) * d;
                        const py = cy + Math.sin(a) * d;
                        if (d === 30) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
            } else if (theme === 'sunset_glow') {
                // Radiant golden-rose sunset beams
                const sunR = 90 + energy * 50;
                const sunGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, sunR * 2.4);
                sunGrad.addColorStop(0, `rgba(251, 146, 60, ${0.4 + energy * 0.3})`);
                sunGrad.addColorStop(0.4, `rgba(244, 63, 94, ${0.25 + energy * 0.2})`);
                sunGrad.addColorStop(0.8, `rgba(162, 28, 175, ${0.12 + energy * 0.1})`);
                sunGrad.addColorStop(1, 'transparent');

                ctx.beginPath();
                ctx.arc(cx, cy, sunR * 2.2, 0, Math.PI * 2);
                ctx.fillStyle = sunGrad;
                ctx.fill();

                // Horizontal acoustic horizon lines
                const lineCount = 5;
                for (let l = 0; l < lineCount; l++) {
                    const ly = cy + 120 + l * 26;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(251, 191, 36, ${Math.max(0.05, 0.4 - l * 0.07)})`;
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(0, ly);
                    for (let lx = 0; lx <= width; lx += 20) {
                        const distFromCenter = Math.abs(lx - cx);
                        const waveAmp = (energy * 35) * Math.exp(-distFromCenter / 280);
                        const yVal = ly + Math.sin(lx * 0.02 + time * 4 + l) * waveAmp;
                        ctx.lineTo(lx, yVal);
                    }
                    ctx.stroke();
                }
            }

            // 3. Floating Voice-Reactive Stardust / Embers
            particles.forEach((p) => {
                // Update position with dynamic speed based on voice energy
                const speedMult = 1 + energy * 4;
                p.x += p.vx * speedMult;
                p.y += p.vy * speedMult;

                if (p.x < 0) p.x = 1;
                if (p.x > 1) p.x = 0;
                if (p.y < 0) p.y = 1;
                if (p.y > 1) p.y = 0;

                const px = p.x * width;
                const py = p.y * height;
                const alpha = Math.min(1, p.baseAlpha + Math.sin(time * 3 + p.pulseOffset) * 0.25 + energy * 0.4);

                let pColor;
                if (theme === 'cyber_aurora') pColor = `rgba(52, 211, 153, ${alpha})`;
                else if (theme === 'sunset_glow') pColor = `rgba(253, 186, 116, ${alpha})`;
                else if (theme === 'cosmic_nebula') pColor = `rgba(192, 132, 252, ${alpha})`;
                else pColor = `rgba(216, 180, 254, ${alpha})`;

                ctx.beginPath();
                ctx.arc(px, py, p.size * (1 + energy * 0.5), 0, Math.PI * 2);
                ctx.fillStyle = pColor;
                ctx.fill();
            });

            ctx.restore();
            animId = requestAnimationFrame(render);
        };

        animId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', handleResize);
        };
    }, [theme, aiSpeaking, userSpeaking, loading, callState]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ zIndex: 1 }}
        />
    );
}
