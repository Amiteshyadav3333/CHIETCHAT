import React, { useEffect, useRef, useState } from 'react';

/**
 * HumanoidAiAvatar
 * Provides lifelike, humanistic interactive presence for Aria & Arjun.
 * Features:
 * - Natural human breathing micro-sway (torso/head subtle breathing float)
 * - Conversational head articulation & rhythmic speech nodding when speaking
 * - Organic eye blinking at natural intervals (every 3.5 - 5.5s)
 * - Speech-driven jaw/lip articulation and subtle facial responsiveness
 * - Inquisitive attentive head-tilt when listening to the user
 * - Warm ambient aura matching royal dark embroidery
 */
export default function HumanoidAiAvatar({
    avatarUrl,
    name = 'Aria',
    isArjun = false,
    aiSpeaking = false,
    userSpeaking = false,
    loading = false,
    callState = 'connected',
    audioLevel = 0 // 0 to 1 speech intensity
}) {
    const [blink, setBlink] = useState(false);
    const [mouthOpen, setMouthOpen] = useState(0);
    const animFrameRef = useRef(null);
    const speechTimeRef = useRef(0);

    // Natural eye blink timer (realistic double/single blinks every 3.5 to 6s)
    useEffect(() => {
        let blinkTimeout;
        const scheduleNextBlink = () => {
            const delay = 3200 + Math.random() * 2800; // 3.2s - 6.0s
            blinkTimeout = setTimeout(() => {
                setBlink(true);
                setTimeout(() => {
                    setBlink(false);
                    // 20% chance of natural double-blink
                    if (Math.random() < 0.25) {
                        setTimeout(() => {
                            setBlink(true);
                            setTimeout(() => setBlink(false), 140);
                        }, 180);
                    }
                    scheduleNextBlink();
                }, 160);
            }, delay);
        };

        scheduleNextBlink();
        return () => clearTimeout(blinkTimeout);
    }, []);

    // Speech articulation loop (smooth mouth & facial physics)
    useEffect(() => {
        if (!aiSpeaking) {
            setMouthOpen(0);
            return;
        }

        let active = true;
        const updateSpeechPhysics = () => {
            if (!active) return;
            speechTimeRef.current += 0.22;
            const t = speechTimeRef.current;
            // Harmonic wave creating realistic syllables, pauses, and cadence
            const rawMouth = (
                Math.sin(t * 2.8) * 0.4 +
                Math.sin(t * 5.2 + 0.5) * 0.35 +
                Math.sin(t * 8.7 + 1.2) * 0.25
            );
            // Normalized between 0.05 (closed/slight open) and 1.0 (vowel sound)
            const normalized = Math.max(0.08, Math.min(1.0, (rawMouth + 0.6) * 0.85));
            setMouthOpen(normalized);

            animFrameRef.current = requestAnimationFrame(updateSpeechPhysics);
        };

        animFrameRef.current = requestAnimationFrame(updateSpeechPhysics);
        return () => {
            active = false;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [aiSpeaking]);

    // Color theme accents (gold & navy royal aesthetic)
    const accentBorder = isArjun ? 'rgba(96, 165, 250, 0.7)' : 'rgba(216, 180, 254, 0.7)';
    const glowColor = isArjun ? 'rgba(59, 130, 246, 0.45)' : 'rgba(236, 72, 153, 0.45)';
    const speakingGlow = 'rgba(52, 211, 153, 0.5)';

    return (
        <div className="humanoid-avatar-root relative flex flex-col items-center select-none">
            {/* Ambient Aura Backdrop */}
            <div
                className={`absolute -inset-6 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
                    aiSpeaking
                        ? 'opacity-80 scale-110'
                        : userSpeaking
                        ? 'opacity-70 scale-105'
                        : 'opacity-40 scale-100'
                }`}
                style={{
                    background: aiSpeaking
                        ? `radial-gradient(circle, ${speakingGlow} 0%, transparent 70%)`
                        : userSpeaking
                        ? 'radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 70%)'
                        : `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`
                }}
            />

            {/* Main Interactive Portrait Frame */}
            <div
                className={`relative w-48 h-48 md:w-56 md:h-56 rounded-full overflow-hidden transition-all duration-300 ${
                    aiSpeaking ? 'humanoid-speaking-sway' : userSpeaking ? 'humanoid-listening-tilt' : 'humanoid-idle-breathe'
                }`}
                style={{
                    border: `3.5px solid ${aiSpeaking ? '#34d399' : userSpeaking ? '#fbbf24' : accentBorder}`,
                    boxShadow: aiSpeaking
                        ? '0 0 35px rgba(52, 211, 153, 0.55), 0 16px 40px rgba(0,0,0,0.8)'
                        : userSpeaking
                        ? '0 0 30px rgba(251, 191, 36, 0.45), 0 16px 40px rgba(0,0,0,0.8)'
                        : `0 0 25px ${glowColor}, 0 16px 40px rgba(0,0,0,0.8)`
                }}
            >
                {/* 1. Base Portrait Image */}
                <img
                    src={avatarUrl}
                    alt={name}
                    className="w-full h-full object-cover object-top transition-transform duration-150 pointer-events-none"
                    style={{
                        transform: aiSpeaking
                            ? `scale(${1 + mouthOpen * 0.025}) translateY(${mouthOpen * 2.2}px)`
                            : userSpeaking
                            ? 'scale(1.02) rotate(-1.5deg)'
                            : 'scale(1)'
                    }}
                />

                {/* 2. Realistic Eyelid Blink Simulation Layer */}
                <div
                    className={`absolute inset-0 pointer-events-none transition-opacity duration-75 ${
                        blink ? 'opacity-95' : 'opacity-0'
                    }`}
                    style={{
                        background: 'radial-gradient(circle at 50% 32%, rgba(18, 12, 28, 0.88) 14%, transparent 35%)'
                    }}
                />

                {/* 3. Subtle Jaw / Mouth Lip Articulation Overlay during speech */}
                {aiSpeaking && (
                    <div
                        className="absolute inset-x-0 bottom-[18%] mx-auto w-14 h-8 pointer-events-none transition-transform duration-75"
                        style={{
                            transform: `scaleY(${1 + mouthOpen * 0.85}) scaleX(${1 + mouthOpen * 0.15}) translateY(${mouthOpen * 3.5}px)`,
                            opacity: mouthOpen * 0.45,
                            background: 'radial-gradient(ellipse at center, rgba(120, 20, 40, 0.4) 0%, transparent 70%)',
                            filter: 'blur(3px)'
                        }}
                    />
                )}

                {/* 4. Natural Soft Spotlight Vignette */}
                <div
                    className="absolute inset-0 pointer-events-none rounded-full"
                    style={{
                        background: 'radial-gradient(circle at 50% 35%, transparent 55%, rgba(6, 9, 20, 0.65) 100%)'
                    }}
                />
            </div>

            {/* CSS Animations for organic human breathing, tilt, and speech cadence */}
            <style>{`
                @keyframes humanoidBreathe {
                    0%, 100% {
                        transform: translateY(0px) rotate(0deg);
                    }
                    50% {
                        transform: translateY(-4px) rotate(0.4deg);
                    }
                }

                @keyframes humanoidListening {
                    0%, 100% {
                        transform: translateY(-2px) rotate(1.8deg) scale(1.02);
                    }
                    50% {
                        transform: translateY(0px) rotate(2.4deg) scale(1.02);
                    }
                }

                @keyframes humanoidSpeechSway {
                    0% {
                        transform: translateY(0px) rotate(-0.8deg);
                    }
                    25% {
                        transform: translateY(-3px) rotate(0.6deg);
                    }
                    50% {
                        transform: translateY(-1px) rotate(-0.4deg);
                    }
                    75% {
                        transform: translateY(-4px) rotate(0.8deg);
                    }
                    100% {
                        transform: translateY(0px) rotate(-0.8deg);
                    }
                }

                .humanoid-idle-breathe {
                    animation: humanoidBreathe 4.2s ease-in-out infinite;
                }

                .humanoid-listening-tilt {
                    animation: humanoidListening 2.8s ease-in-out infinite;
                }

                .humanoid-speaking-sway {
                    animation: humanoidSpeechSway 1.8s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
