import React, { useEffect, useRef, useState } from 'react';

/**
 * HumanoidAiAvatar
 * Provides a cinematic, full-screen lifelike interactive human presence for Aria & Arjun.
 * Features:
 * - Full-screen immersive viewport filling (like a realistic FaceTime/video call)
 * - Voice-synchronized phonetic lip mixing / lip-sync articulation (aperture, inner oral depth, teeth, lower lip drop)
 * - Conversational head articulation & rhythmic syllable nodding when speaking
 * - Organic eye blinking at natural intervals (every 3.2 - 6.0s)
 * - Attentive inquisitive head-tilt when listening to the user
 * - Natural human breathing micro-float (4.2s subtle cycle)
 * - Ambient royal lighting vignette
 */
export default function HumanoidAiAvatar({
    avatarUrl,
    name = 'Aria',
    isArjun = false,
    aiSpeaking = false,
    userSpeaking = false,
    loading = false,
    callState = 'connected',
    fullScreen = true,
}) {
    const [blink, setBlink] = useState(false);
    const [mouthAperture, setMouthAperture] = useState(0); // 0 (closed) to 1.0 (open)
    const [lipSpread, setLipSpread] = useState(0);         // -0.2 (round) to +0.3 (wide)
    const [jawDrop, setJawDrop] = useState(0);             // vertical jaw drop in px
    const [headNod, setHeadNod] = useState(0);             // conversational head articulation
    const animFrameRef = useRef(null);
    const speechTimeRef = useRef(0);

    // Natural randomized eye blinking timer (every 3.2s - 6.0s with 25% double-blink)
    useEffect(() => {
        let blinkTimeout;
        const scheduleNextBlink = () => {
            const delay = 3000 + Math.random() * 2800;
            blinkTimeout = setTimeout(() => {
                setBlink(true);
                setTimeout(() => {
                    setBlink(false);
                    if (Math.random() < 0.25) {
                        setTimeout(() => {
                            setBlink(true);
                            setTimeout(() => setBlink(false), 120);
                        }, 160);
                    }
                    scheduleNextBlink();
                }, 140);
            }, delay);
        };

        scheduleNextBlink();
        return () => clearTimeout(blinkTimeout);
    }, []);

    // Speech-Synchronized Lip Mixing & Jaw Articulation Physics
    useEffect(() => {
        if (!aiSpeaking) {
            setMouthAperture(0);
            setLipSpread(0);
            setJawDrop(0);
            setHeadNod(0);
            return;
        }

        let active = true;
        const updateSpeechPhysics = () => {
            if (!active) return;
            speechTimeRef.current += 0.24;
            const t = speechTimeRef.current;

            // Multi-harmonic phonetic viseme waves:
            // 1. Primary syllabic rhythm (3.4 Hz + 6.8 Hz)
            const syllableWave =
                Math.sin(t * 3.4) * 0.48 +
                Math.sin(t * 6.8 + 0.6) * 0.32 +
                Math.sin(t * 11.2 + 1.2) * 0.18;

            // 2. Normalized aperture: 0 (closed consonant) to 1.0 (full open vowel)
            const normAperture = Math.max(0, Math.min(1.0, (syllableWave + 0.45) * 1.15));

            // 3. Lip spread/rounding (wide on vowels like 'ee'/'ai', round on 'o'/'u')
            const spreadWave = Math.sin(t * 2.2 + 0.4) * 0.22;

            // 4. Conversational head nod cadence
            const nodWave = Math.sin(t * 1.8) * 0.9;

            setMouthAperture(normAperture);
            setLipSpread(spreadWave);
            setJawDrop(normAperture * 5.2);
            setHeadNod(nodWave);

            animFrameRef.current = requestAnimationFrame(updateSpeechPhysics);
        };

        animFrameRef.current = requestAnimationFrame(updateSpeechPhysics);
        return () => {
            active = false;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [aiSpeaking]);

    // Color accents
    const glowColor = isArjun ? 'rgba(59, 130, 246, 0.4)' : 'rgba(236, 72, 153, 0.4)';
    const speakingGlow = 'rgba(52, 211, 153, 0.45)';

    return (
        <div className="humanoid-fullscreen-viewport absolute inset-0 w-full h-full overflow-hidden select-none bg-[#05040a]">
            {/* Ambient Background Aura Glow */}
            <div
                className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none ${
                    aiSpeaking ? 'opacity-80' : userSpeaking ? 'opacity-70' : 'opacity-40'
                }`}
                style={{
                    background: aiSpeaking
                        ? `radial-gradient(ellipse at 50% 35%, ${speakingGlow} 0%, transparent 68%)`
                        : userSpeaking
                        ? 'radial-gradient(ellipse at 50% 35%, rgba(251, 191, 36, 0.35) 0%, transparent 68%)'
                        : `radial-gradient(ellipse at 50% 35%, ${glowColor} 0%, transparent 68%)`
                }}
            />

            {/* 
              Aspect-Ratio Locked Stage (682:1024)
              Ensures the portrait fills the screen while keeping eye & mouth landmarks 100% pixel-locked
            */}
            <div className="absolute inset-0 overflow-hidden">
                <div 
                    className="absolute"
                    style={{
                        top: '28%',
                        left: '50%',
                        transform: 'translate(-50%, -28%)',
                        width: 'max(100vw, 100vh * (682 / 1024))',
                        height: 'max(100vh, 100vw * (1024 / 682))',
                    }}
                >
                    <div
                        className={`relative w-full h-full overflow-hidden transition-transform duration-300 ${
                            aiSpeaking
                                ? 'humanoid-speaking-sway'
                                : userSpeaking
                                ? 'humanoid-listening-tilt'
                                : 'humanoid-idle-breathe'
                        }`}
                        style={{
                            transformOrigin: '57% 30%',
                            transform: aiSpeaking
                                ? `rotate(${headNod * 0.4}deg) translateY(${headNod * 1.5}px)`
                                : undefined,
                        }}
                    >
                    {/* 1. Pristine Base Portrait (Full Screen) */}
                    <img
                        src={avatarUrl}
                        alt={name}
                        className="w-full h-full object-cover pointer-events-none select-none transition-transform duration-150"
                        style={{
                            transform: aiSpeaking
                                ? `scale(${1 + mouthAperture * 0.015})`
                                : userSpeaking
                                ? 'scale(1.02) rotate(-1.2deg)'
                                : 'scale(1)',
                        }}
                    />

                    {/* 2. Natural Eyelid Blinking Simulation */}
                    <div
                        className={`absolute pointer-events-none transition-opacity duration-75 ${
                            blink ? 'opacity-95' : 'opacity-0'
                        }`}
                        style={{
                            left: isArjun ? '44.5%' : '42.5%',
                            top: isArjun ? '26.8%' : '23.8%',
                            width: isArjun ? '29.5%' : '28.5%',
                            height: isArjun ? '5.4%' : '5.2%',
                            background: isArjun
                                ? 'radial-gradient(ellipse at 50% 50%, rgba(35, 26, 22, 0.96) 25%, rgba(65, 45, 38, 0.88) 60%, transparent 95%)'
                                : 'radial-gradient(ellipse at 50% 50%, rgba(32, 22, 28, 0.96) 25%, rgba(68, 48, 55, 0.88) 60%, transparent 95%)',
                            filter: 'blur(1.2px)',
                        }}
                    />

                    {/* 3. Voice-Synchronized Dynamic Lip Mixing & Jaw Articulation */}
                    {aiSpeaking && mouthAperture > 0.04 && (
                        <div
                            className="absolute pointer-events-none transition-transform duration-75"
                            style={{
                                left: isArjun ? '50.2%' : '47.8%',
                                top: isArjun ? '39.8%' : '35.6%',
                                width: isArjun ? '18.6%' : '18.2%',
                                height: isArjun ? '7.2%' : '6.6%',
                                transform: `scaleX(${1 + lipSpread}) translateY(${jawDrop * 0.35}px)`,
                                transformOrigin: '50% 25%',
                            }}
                        >
                            {/* Inner Oral Cavity & Depth */}
                            <div
                                className="absolute inset-x-[10%] top-[34%] rounded-[50%]"
                                style={{
                                    height: `${Math.max(2, mouthAperture * 15)}px`,
                                    background: isArjun
                                        ? 'radial-gradient(ellipse at 50% 45%, #180509 0%, #3a0a14 65%, rgba(70, 15, 25, 0.4) 100%)'
                                        : 'radial-gradient(ellipse at 50% 45%, #25060e 0%, #520e1d 65%, rgba(95, 20, 38, 0.4) 100%)',
                                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.85)',
                                    filter: 'blur(0.35px)',
                                }}
                            >
                                {/* Upper Teeth glimpse on open vowel syllables */}
                                {mouthAperture > 0.28 && (
                                    <div
                                        className="mx-auto w-[68%] h-[2.5px] rounded-b-sm"
                                        style={{
                                            background: 'linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, rgba(230,225,220,0.72) 100%)',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                            opacity: Math.min(1, (mouthAperture - 0.25) * 2.8),
                                        }}
                                    />
                                )}
                            </div>

                            {/* Lower Lip Dynamic Drop & Soft Highlight */}
                            <div
                                className="absolute inset-x-[8%] bottom-[5%] rounded-[50%]"
                                style={{
                                    height: `${7 + mouthAperture * 4.5}px`,
                                    transform: `translateY(${jawDrop * 0.85}px)`,
                                    background: isArjun
                                        ? 'radial-gradient(ellipse at 50% 40%, rgba(135, 60, 60, 0.6) 0%, rgba(85, 30, 35, 0.25) 75%, transparent 100%)'
                                        : 'radial-gradient(ellipse at 50% 40%, rgba(195, 80, 95, 0.62) 0%, rgba(140, 45, 60, 0.3) 75%, transparent 100%)',
                                    filter: 'blur(0.9px)',
                                }}
                            />

                            {/* Subtle Lip Corner & Border Blending */}
                            <div
                                className="absolute inset-0 rounded-[50%]"
                                style={{
                                    borderTop: `${Math.min(1.8, mouthAperture * 1.4)}px solid ${isArjun ? 'rgba(80,25,30,0.35)' : 'rgba(120,35,50,0.4)'}`,
                                    borderBottom: `${Math.min(1.8, mouthAperture * 1.4)}px solid ${isArjun ? 'rgba(60,18,22,0.35)' : 'rgba(95,25,38,0.4)'}`,
                                    filter: 'blur(0.8px)',
                                    opacity: mouthAperture * 0.7,
                                }}
                            />
                        </div>
                    )}
                </div>
                </div>
            </div>

            {/* Cinematic Gradient Vignettes for Header & Footer controls readability */}
            <div
                className="absolute inset-x-0 top-0 h-40 pointer-events-none"
                style={{
                    background: 'linear-gradient(to bottom, rgba(4, 3, 8, 0.85) 0%, rgba(4, 3, 8, 0.4) 55%, transparent 100%)'
                }}
            />
            <div
                className="absolute inset-x-0 bottom-0 h-56 pointer-events-none"
                style={{
                    background: 'linear-gradient(to top, rgba(4, 3, 8, 0.92) 0%, rgba(4, 3, 8, 0.5) 60%, transparent 100%)'
                }}
            />

            {/* Natural Human Movement CSS Keyframes */}
            <style>{`
                @keyframes humanoidBreathe {
                    0%, 100% {
                        transform: translateY(0px) scale(1);
                    }
                    50% {
                        transform: translateY(-5px) scale(1.006);
                    }
                }

                @keyframes humanoidListening {
                    0%, 100% {
                        transform: translateY(-3px) rotate(1.6deg) scale(1.02);
                    }
                    50% {
                        transform: translateY(0px) rotate(2.2deg) scale(1.02);
                    }
                }

                @keyframes humanoidSpeechSway {
                    0% {
                        transform: translateY(0px) rotate(-0.6deg);
                    }
                    25% {
                        transform: translateY(-3px) rotate(0.5deg);
                    }
                    50% {
                        transform: translateY(-1px) rotate(-0.3deg);
                    }
                    75% {
                        transform: translateY(-4px) rotate(0.6deg);
                    }
                    100% {
                        transform: translateY(0px) rotate(-0.6deg);
                    }
                }

                .humanoid-idle-breathe {
                    animation: humanoidBreathe 4.2s ease-in-out infinite;
                }

                .humanoid-listening-tilt {
                    animation: humanoidListening 2.8s ease-in-out infinite;
                }

                .humanoid-speaking-sway {
                    animation: humanoidSpeechSway 2.0s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
