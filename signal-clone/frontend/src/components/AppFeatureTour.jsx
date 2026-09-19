import React, { useState, useEffect } from 'react';
import {
    ChatBubbleLeftRightIcon,
    PlayIcon,
    PhotoIcon,
    MicrophoneIcon,
    SparklesIcon,
    BellIcon,
    PlusIcon,
    Cog6ToothIcon,
    XMarkIcon,
    ArrowRightIcon,
    CheckCircleIcon,
    ShieldCheckIcon,
    AcademicCapIcon,
    LightBulbIcon,
    HandThumbUpIcon
} from '@heroicons/react/24/outline';

export const TOUR_STEPS = [
    {
        id: 'chats',
        title: '1. Chats & Encrypted Messaging',
        subtitle: 'Military-grade end-to-end encryption with instant media',
        badge: 'COMMUNICATIONS CORE',
        icon: ChatBubbleLeftRightIcon,
        targetSelector: '[data-tour="chats"], [data-tour-mobile="chats"]',
        whatItDoes: 'Your secure hub for private 1-on-1 chats, study groups, and campus team conversations.',
        keyPowers: [
            '🔒 End-to-End Encryption: Only you and the recipient have the cryptographic keys to read your messages.',
            '⏱️ Ephemeral Snap Mode: Enable self-destructing messages that vanish instantly after being viewed.',
            '🎙️ Voice Notes & HD Media: Send studio-quality voice clips, lecture PDFs, videos, and full-resolution photos.'
        ],
        proTip: 'Double tap any message to react with emojis, or swipe right to quote-reply instantly.',
        buttonText: 'Got it! Next →'
    },
    {
        id: 'reels',
        title: '2. Reels & Short Videos',
        subtitle: 'Campus trends, creator studio, and viral moments',
        badge: 'VIRAL ENTERTAINMENT',
        icon: PlayIcon,
        targetSelector: '[data-tour="reels"], [data-tour-mobile="stories"]',
        whatItDoes: 'Watch, create, and share short viral video clips trending across your college and nationwide.',
        keyPowers: [
            '🎬 For-You Campus Feed: Algorithmic video stream tuned specifically for student humor, talents, and trends.',
            '🎵 Creator Studio: Record with background music tracks, audio filters, and video effects.',
            '💬 Social Synergy: Share your favorite reels directly into your batch group with a single tap.'
        ],
        proTip: 'Swipe up to transition to the next reel, or tap the sound badge to browse other videos using the same audio track.',
        buttonText: 'Got it! Next →'
    },
    {
        id: 'social',
        title: '3. Campus Social & Feeds',
        subtitle: 'College community posts, student thoughts & live polls',
        badge: 'CAMPUS RADAR',
        icon: PhotoIcon,
        targetSelector: '[data-tour="social"]',
        whatItDoes: 'The town square of your college — discover posts, ask batch questions, and launch student polls.',
        keyPowers: [
            '🎓 Campus Timeline: Filter feeds to view updates and announcements strictly from your university or city.',
            '📊 Interactive Polls: Ask the campus community questions and gather real-time student sentiment.',
            '🤝 1-Click Connect: Instantly follow or send contact requests to peers without awkward introductions.'
        ],
        proTip: 'Link your college in profile settings to unlock the verified campus badge next to your posts.',
        buttonText: 'Got it! Next →'
    },
    {
        id: 'podlive',
        title: '4. PodLive Voice Rooms',
        subtitle: 'Drop-in audio stages, study lounges & live debates',
        badge: 'LIVE AUDIO STAGE',
        icon: MicrophoneIcon,
        targetSelector: '[data-tour="podlive"], [data-tour-mobile="calls"]',
        whatItDoes: 'Host or join live interactive audio stages — perfect for group study sessions, debates, or casual hangouts.',
        keyPowers: [
            '🎙️ Drop-in Audio: Jump into active voice rooms with crystal clear latency-free audio.',
            '✋ Raise Hand: Request permission from hosts to step onto the stage and speak to the room.',
            '🎧 Background Mode: Audio stays playing seamlessly while you multitask or browse other apps.'
        ],
        proTip: 'Start a private PodLive room with your study group right before exams for live problem solving.',
        buttonText: 'Got it! Next →'
    },
    {
        id: 'ai',
        title: '5. Saskat AI Copilot',
        subtitle: 'Your 24/7 intelligent study tutor, coding mentor & creator',
        badge: 'INTELLIGENCE SUITE',
        icon: SparklesIcon,
        targetSelector: '[data-tour="ai"]',
        whatItDoes: 'A personalized AI companion built to help you ace homework, debug code, write essays, and make art.',
        keyPowers: [
            '📚 Homework & Math Solver: Ask complex questions and get step-by-step conceptual breakdowns.',
            '💻 Code Mentor: Debug scripts, learn algorithms, and prep for technical placement interviews.',
            '🎨 AI Wallpapers & Art: Generate customized imagery and personalized chat backgrounds.'
        ],
        proTip: 'Type "@saskat summarize" inside group chats to get instant lecture note summaries.',
        buttonText: 'Got it! Next →'
    },
    {
        id: 'notify',
        title: '6. Notifications & Alerts',
        subtitle: 'Real-time campus connection requests and urgent updates',
        badge: 'SYSTEM RADAR',
        icon: BellIcon,
        targetSelector: '[data-tour="notify"]',
        whatItDoes: 'Never miss an important event — track classmate connection requests, mentions, and replies in real time.',
        keyPowers: [
            '🔔 Peer Requests: Review and accept connection requests from new classmates in 1 tap.',
            '⚡ Live Activity Feed: Stay alerted whenever someone comments on your reel or mentions you.',
            '🔕 Quiet Hours: Configure custom notification sounds or silent hours during study periods.'
        ],
        proTip: 'Tap directly on any notification badge to jump straight into the corresponding conversation.',
        buttonText: 'Got it! Next →'
    },
    {
        id: 'new-chat',
        title: '7. New Chat & Campus Search',
        subtitle: 'Find classmates by @handle or phone number in seconds',
        badge: 'FAST CONNECT',
        icon: PlusIcon,
        targetSelector: '[data-tour="new-chat"]',
        whatItDoes: 'Start a conversation with anyone on campus using their unique @platform ID or 10-digit mobile number.',
        keyPowers: [
            '🔍 Zero-Friction Lookup: Find any classmate instantly without needing their personal contact card.',
            '👥 Class Group Builder: Create project, batch, or club groups with up to thousands of members.',
            '🔗 Shareable Invite Links: Generate instant WhatsApp join links for your class group.'
        ],
        proTip: 'Use 10-digit mobile number search to quickly check if an old friend has already joined CHEETCHAT.',
        buttonText: 'Got it! Next: Settings →'
    },
    {
        id: 'settings',
        title: '8. Settings & Privacy Master Hub',
        subtitle: 'Master control center for privacy locks, 2FA, and campus identity',
        badge: 'CONTROL VAULT',
        icon: Cog6ToothIcon,
        targetSelector: '[data-tour="settings"]',
        whatItDoes: 'The command center for your CHEETCHAT account — configure privacy locks, college identity, and security.',
        keyPowers: [
            '👤 Campus Identity: Update your University, Department, Location, Avatar, and Bio anytime.',
            '🔒 Privacy Shield: Hide your Last Seen, Online Status, Profile Photo, and Read Receipts.',
            '🛡️ 2-Factor Authentication: Safeguard your conversations with biometric and PIN-based 2FA security.',
            '🎨 Custom Themes: Choose custom dark mode aesthetics, bubble colors, and wallpapers.'
        ],
        proTip: 'Head to Settings > Privacy to make your online presence completely invisible to non-contacts.',
        buttonText: 'Got it! Open Settings ⚙️',
        isFinal: true
    }
];

export const AppFeatureTour = ({
    isOpen,
    onClose,
    onOpenSettings,
    user
}) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [spotlightRect, setSpotlightRect] = useState(null);
    const [isAnimating, setIsAnimating] = useState(false);

    const totalSteps = TOUR_STEPS.length;
    const step = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0];
    const Icon = step.icon;
    const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

    // Calculate spotlight position dynamically
    useEffect(() => {
        if (!isOpen) return;

        const updatePosition = () => {
            const el = document.querySelector(step.targetSelector);
            if (el) {
                const rect = el.getBoundingClientRect();
                setSpotlightRect({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                });
            } else {
                setSpotlightRect(null);
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition);

        const timer = setTimeout(updatePosition, 100);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition);
            clearTimeout(timer);
        };
    }, [isOpen, currentStepIndex, step.targetSelector]);

    if (!isOpen) return null;

    const handleGotIt = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setIsAnimating(false);
            if (currentStepIndex < totalSteps - 1) {
                setCurrentStepIndex(i => i + 1);
            } else {
                // Completed tutorial quest
                localStorage.setItem('cheetchat_tour_completed', '1');
                onClose();
                if (onOpenSettings) {
                    onOpenSettings();
                }
            }
        }, 150);
    };

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(i => i - 1);
        }
    };

    const handleSkip = () => {
        localStorage.setItem('cheetchat_tour_completed', '1');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[120] overflow-y-auto flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md transition-all select-none">
            {/* Spotlight cut-out ring if target element exists */}
            {spotlightRect && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: Math.max(0, spotlightRect.top - 8),
                            left: Math.max(0, spotlightRect.left - 8),
                            width: spotlightRect.width + 16,
                            height: spotlightRect.height + 16,
                            pointerEvents: 'none',
                            zIndex: 121,
                            borderRadius: '16px',
                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.82), 0 0 30px 6px #25d366'
                        }}
                        className="animate-pulse"
                    />
                    {/* Targeting Reticle Label */}
                    <div
                        style={{
                            position: 'fixed',
                            top: Math.max(8, spotlightRect.top - 34),
                            left: Math.max(8, spotlightRect.left),
                            zIndex: 122,
                            pointerEvents: 'none'
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25d366] text-black font-black text-[10px] tracking-wider uppercase shadow-lg shadow-[#25d366]/40"
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-black animate-ping" />
                        <span>TARGET ACTIVE</span>
                    </div>
                </>
            )}

            {/* Modern Gaming HUD Card */}
            <div className={`relative z-[130] w-full max-w-lg rounded-3xl border-2 border-[#25d366]/50 bg-[#0d151a]/95 backdrop-blur-xl shadow-[0_0_50px_rgba(37,211,102,0.2)] overflow-hidden text-white transition-transform duration-200 ${
                isAnimating ? 'scale-[0.98] opacity-90' : 'scale-100 opacity-100'
            }`}>
                {/* Gaming HUD Top Bar: Mission Progress & XP */}
                <div className="bg-gradient-to-r from-[#0b141a] via-[#14261f] to-[#00a884]/25 px-6 pt-5 pb-4 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-2.5 w-2.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25d366] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#25d366]"></span>
                            </span>
                            <span className="text-[11px] font-black uppercase tracking-widest text-[#25d366]">
                                TUTORIAL MISSION • LEVEL {currentStepIndex + 1} OF {totalSteps}
                            </span>
                        </div>
                        <button
                            onClick={handleSkip}
                            className="rounded-full p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition"
                            title="Skip Tutorial"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Animated XP Progress Bar */}
                    <div className="mt-3">
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 mb-1">
                            <span>EXPLORATION PROGRESS</span>
                            <span className="text-[#25d366]">{progressPercent}% COMPLETE</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-black/60 border border-white/10 overflow-hidden p-0.5">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#25d366] shadow-[0_0_12px_#25d366] transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* Feature Badge & Icon Header */}
                    <div className="mt-4 flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#25d366]/20 border border-[#25d366]/50 text-[#25d366] shadow-lg shadow-[#25d366]/20">
                            <Icon className="h-8 w-8" />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-block rounded-md bg-[#25d366]/15 border border-[#25d366]/30 px-2 py-0.5 text-[10px] font-black text-[#25d366] uppercase tracking-wider mb-1">
                                {step.badge}
                            </span>
                            <h2 className="text-lg sm:text-xl font-black text-white leading-snug truncate">
                                {step.title}
                            </h2>
                            <p className="text-xs text-gray-400 truncate">
                                {step.subtitle}
                            </p>
                        </div>
                    </div>
                </div>

                {/* HUD Body Content */}
                <div className="p-6 space-y-4">
                    {/* What it does */}
                    <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-3.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">
                            What this feature does:
                        </p>
                        <p className="text-xs sm:text-sm font-medium text-gray-200 leading-relaxed">
                            {step.whatItDoes}
                        </p>
                    </div>

                    {/* Key Powers / Mechanics */}
                    <div className="space-y-2 rounded-2xl bg-[#141f26] border border-white/10 p-4">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            <ShieldCheckIcon className="h-4 w-4 text-[#25d366]" />
                            <span>Core Powers & Capabilities:</span>
                        </p>
                        <ul className="space-y-2 pt-1">
                            {step.keyPowers.map((power, idx) => (
                                <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-300 leading-relaxed">
                                    <span className="text-[#25d366] font-bold shrink-0 mt-0.5">⚡</span>
                                    <span>{power}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Pro Gamer / Power Tip */}
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 flex items-start gap-2 text-xs text-amber-200">
                        <LightBulbIcon className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                        <div>
                            <strong className="text-amber-300">Pro Tip: </strong>
                            <span>{step.proTip}</span>
                        </div>
                    </div>

                    {user?.college && (
                        <div className="flex items-center gap-2 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2">
                            <AcademicCapIcon className="h-4 w-4 shrink-0 text-violet-400" />
                            <span>Linked to your campus: <strong>{user.college}</strong> {user.location ? `(${user.location})` : ''}</span>
                        </div>
                    )}

                    {/* Step Navigation Dots */}
                    <div className="flex items-center justify-center gap-1.5 pt-1">
                        {TOUR_STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentStepIndex(i)}
                                className={`h-2 rounded-full transition-all ${
                                    i === currentStepIndex
                                        ? 'w-7 bg-[#25d366]'
                                        : 'w-2 bg-gray-600 hover:bg-gray-400'
                                }`}
                                title={`Jump to mission step ${i + 1}`}
                            />
                        ))}
                    </div>

                    {/* Interactive Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                        {currentStepIndex > 0 && (
                            <button
                                type="button"
                                onClick={handlePrev}
                                className="w-full sm:w-auto px-4 py-3.5 rounded-xl border border-white/15 bg-white/5 text-gray-300 text-sm font-semibold hover:bg-white/10 transition"
                            >
                                ← Back
                            </button>
                        )}

                        {/* Modern Game Style "Got it!" Green Button */}
                        <button
                            type="button"
                            id="tour-green-action-btn"
                            onClick={handleGotIt}
                            className="flex-1 w-full flex items-center justify-center gap-2 rounded-xl bg-[#25d366] hover:bg-[#20bd5a] text-[#07090c] font-black py-4 px-6 text-sm sm:text-base tracking-wide uppercase shadow-[0_0_25px_rgba(37,211,102,0.4)] ring-4 ring-[#25d366]/25 transition-all hover:scale-[1.02] active:scale-[0.97]"
                        >
                            <HandThumbUpIcon className="h-5 w-5" />
                            <span>{step.buttonText}</span>
                            {step.isFinal ? (
                                <CheckCircleIcon className="h-5 w-5" />
                            ) : (
                                <ArrowRightIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                        <button
                            onClick={handleSkip}
                            className="hover:text-gray-200 underline decoration-gray-600 underline-offset-2"
                        >
                            Skip Tutorial
                        </button>
                        <span>You can replay this tutorial anytime from Settings</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppFeatureTour;
