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
    AcademicCapIcon
} from '@heroicons/react/24/outline';

export const TOUR_STEPS = [
    {
        id: 'chats',
        title: '1. Chats & End-to-End Encryption (संदेश और बातचीत)',
        subtitle: 'Secure, private, and instant communication',
        badge: 'Private & Encrypted',
        icon: ChatBubbleLeftRightIcon,
        targetSelector: '[data-tour="chats"], [data-tour-mobile="chats"]',
        description: 'यहाँ आप अपने दोस्तों, कॉलेज मेट्स और ग्रुप्स से सुरक्षित बातचीत कर सकते हैं।',
        details: [
            'End-to-End Encryption: आपके मैसेज केवल आप और सामने वाला व्यक्ति ही पढ़ सकता है।',
            'Media & Documents: फ़ोटो, वीडियो, वॉइस नोट्स और डाक्यूमेंट्स तेज़ी से शेयर करें।',
            'Disappearing Messages & Snap Mode: सीक्रेट चैट के लिए ऑटो-डिलीट मैसेज ऑन करें।'
        ],
        buttonText: 'अगला फीचर देखें → (Next Feature)'
    },
    {
        id: 'reels',
        title: '2. Reels & Short Videos (रील्स और वीडियो)',
        subtitle: 'Watch, create and discover campus trends',
        badge: 'Entertainment & Viral',
        icon: PlayIcon,
        targetSelector: '[data-tour="reels"], [data-tour-mobile="stories"]',
        description: 'ट्रेंडिंग रील्स और शॉर्ट वीडियो का आनंद लें, लाइक करें और अपनी रील्स शेयर करें।',
        details: [
            'For You Feed: आपकी पसंद और कॉलेज से जुड़े ट्रेंडिंग वीडियो।',
            'Creator Tools: अपनी आवाज़, म्यूजिक और फ़िल्टर के साथ रील्स बनाएं।',
            'Interact: दोस्तों के साथ रील्स शेयर करें और कमेंट्स में चर्चा करें।'
        ],
        buttonText: 'अगला फीचर देखें → (Next Feature)'
    },
    {
        id: 'social',
        title: '3. Social Feed & Campus Hub (सोशल व कैंपस हब)',
        subtitle: 'College community posts, polls & thoughts',
        badge: 'Community & Networking',
        icon: PhotoIcon,
        targetSelector: '[data-tour="social"]',
        description: 'आपके कॉलेज और दोस्तों के पोस्ट, पोल्स, विचार और अपडेट्स का मुख्य केंद्र।',
        details: [
            'Campus Friends: अपनी यूनिवर्सिटी या शहर के नए लोगों को फॉलो करें।',
            'Interactive Polls: ओपिनियन पोल्स बनाकर राय जानें।',
            'Connect & Message: किसी भी पोस्ट से सीधे प्रोफाइल देखें और बातचीत शुरू करें।'
        ],
        buttonText: 'अगला फीचर देखें → (Next Feature)'
    },
    {
        id: 'podlive',
        title: '4. PodLive Voice Rooms (पॉडलाइव ऑडियो रूम)',
        subtitle: 'Live audio discussions and campus stages',
        badge: 'Live Audio',
        icon: MicrophoneIcon,
        targetSelector: '[data-tour="podlive"], [data-tour-mobile="calls"]',
        description: 'लाइव वॉइस रूम्स में हिस्सा लें या अपना खुद का लाइव ऑडियो रूम होस्ट करें।',
        details: [
            'Live Hangouts: ग्रुप स्टडी, डिबेट या बातचीत के लिए वॉइस रूम।',
            'Raise Hand: स्टेज पर आकर बोलने के लिए हाथ उठाएं।',
            'Listen & Chill: बैकग्राउंड में सुनते हुए बाकी काम भी कर सकते हैं।'
        ],
        buttonText: 'अगला फीचर देखें → (Next Feature)'
    },
    {
        id: 'ai',
        title: '5. Saskat AI Assistant (स्मार्ट एआई साथी)',
        subtitle: 'Your 24/7 personal study & query buddy',
        badge: 'Artificial Intelligence',
        icon: SparklesIcon,
        targetSelector: '[data-tour="ai"]',
        description: 'आपका स्मार्ट पर्सनल असिस्टेंट — कॉलेज स्टडी, कोडिंग, सवाल-जवाब और इमेज जेनरेशन के लिए।',
        details: [
            'Study & Homework: किसी भी टॉपिक का सरल स्पष्टीकरण और नोट्स पाएं।',
            'Smart Search & Ideas: रोज़मर्रा के सवालों और राइटिंग में मदद लें।',
            'Voice & Wallpaper AI: चैट अनुभव को पर्सनलाइज़ करने वाले एआई टूल्स।'
        ],
        buttonText: 'अगला फीचर देखें → (Next Feature)'
    },
    {
        id: 'notify',
        title: '6. Notifications (सूचनाएं और अलर्ट्स)',
        subtitle: 'Stay updated with requests and activity',
        badge: 'Alerts',
        icon: BellIcon,
        targetSelector: '[data-tour="notify"]',
        description: 'कॉलेज कनेक्शन रिक्वेस्ट, नए फॉलोअर्स, मेंशन्स और लाइक्स के अलर्ट्स यहाँ मिलेंगे।',
        details: [
            'Connection Requests: कॉलेज साथियों की चैट व फॉलो रिक्वेस्ट तुरंत स्वीकार करें।',
            'Unread Badge: बिना मिस किए सभी जरूरी अपडेट्स एक क्लिक में देखें।',
            'Custom Alerts: नोटिफिकेशन साउंड्स और वाइब्रेशन को कस्टमाइज़ करें।'
        ],
        buttonText: 'अगला फीचर देखें → (Next Feature)'
    },
    {
        id: 'new-chat',
        title: '7. New Chat & Add Contacts (नया चैट और संपर्क खोजें)',
        subtitle: 'Find classmates and start conversations',
        badge: 'Connect',
        icon: PlusIcon,
        targetSelector: '[data-tour="new-chat"]',
        description: 'अपने कॉलेज के साथियों को उनके @ID या फोन नंबर से खोजें और तुरंत चैट शुरू करें।',
        details: [
            'Search by @Handle or Phone: 10 अंकों का फोन नंबर या @ID डालें।',
            'Direct Connect: संपर्क जुड़ते ही तुरंत सुरक्षित चैट विंडो खुल जाती है।',
            'Create Groups: कॉलेज प्रोजेक्ट्स या स्टडी के लिए ग्रुप बनाएं।'
        ],
        buttonText: 'अगला फीचर: सेटिंग्स समझें → (Next: Settings)'
    },
    {
        id: 'settings',
        title: '8. Settings & Privacy (सेटिंग्स और गोपनीयता)',
        subtitle: 'Master control center for privacy, themes & profile',
        badge: 'Control Center',
        icon: Cog6ToothIcon,
        targetSelector: '[data-tour="settings"]',
        description: 'ऐप का सबसे महत्वपूर्ण हिस्सा — यहाँ से आप प्राइवेसी, कॉलेज/लोकेशन, थीम्स और सुरक्षा सेट कर सकते हैं।',
        details: [
            '👤 Profile: फ़ोटो, नाम, बायो, University/College और Location अपडेट करें।',
            '🔒 Privacy: Last Seen, Online Status, Profile Photo व Read Receipts छुपाएं।',
            '🎨 Chats & Wallpapers: चैट थीम्स, कस्टम वॉलपेपर और फॉन्ट साइज़ बदलें।',
            '🛡️ 2FA Security: टू-फैक्टर ऑथेंटिकेशन ऑन करके अकाउंट सुरक्षित रखें।',
            '🌐 App Language: हिंदी सहित कई भारतीय भाषाओं में ऐप का उपयोग करें।'
        ],
        buttonText: 'सेटिंग्स खोलकर देखें (Open Settings) ✓',
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

    const step = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0];
    const Icon = step.icon;

    // Calculate spotlight position
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

    const handleNext = () => {
        if (currentStepIndex < TOUR_STEPS.length - 1) {
            setCurrentStepIndex(i => i + 1);
        } else {
            // Completed
            localStorage.setItem('cheetchat_tour_completed', '1');
            onClose();
            if (onOpenSettings) {
                onOpenSettings();
            }
        }
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
        <div className="fixed inset-0 z-[120] overflow-y-auto flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md transition-all">
            {/* Spotlight cut-out ring if target element exists */}
            {spotlightRect && (
                <div
                    style={{
                        position: 'fixed',
                        top: Math.max(0, spotlightRect.top - 8),
                        left: Math.max(0, spotlightRect.left - 8),
                        width: spotlightRect.width + 16,
                        height: spotlightRect.height + 16,
                        pointerEvents: 'none',
                        zIndex: 121,
                        borderRadius: '18px',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75), 0 0 25px 5px #25d366'
                    }}
                    className="animate-pulse"
                />
            )}

            {/* Tour card */}
            <div className="relative z-[130] w-full max-w-lg rounded-3xl border-2 border-[#25d366]/40 bg-[#111b21] shadow-2xl shadow-[#25d366]/20 overflow-hidden text-white animate-in fade-in zoom-in-95 duration-200">
                {/* Header banner */}
                <div className="bg-gradient-to-r from-[#0b141a] via-[#162923] to-[#00a884]/30 px-6 pt-6 pb-5 border-b border-white/10 relative">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25d366] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#25d366]"></span>
                            </span>
                            <span className="text-xs font-black uppercase tracking-widest text-[#25d366]">
                                CHEETCHAT UI TOUR & SETTINGS GUIDE
                            </span>
                        </div>
                        <button
                            onClick={handleSkip}
                            className="rounded-full p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition"
                            title="Skip Tour"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="mt-4 flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#25d366]/20 border border-[#25d366]/40 text-[#25d366] shadow-lg shadow-[#25d366]/10">
                            <Icon className="h-8 w-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-300 uppercase">
                                    {step.badge}
                                </span>
                                <span className="text-xs font-semibold text-emerald-400">
                                    Feature {currentStepIndex + 1} of {TOUR_STEPS.length}
                                </span>
                            </div>
                            <h2 className="mt-1 text-lg sm:text-xl font-black text-white leading-snug">
                                {step.title}
                            </h2>
                        </div>
                    </div>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-4">
                    <p className="text-sm font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3.5 py-2.5">
                        {step.description}
                    </p>

                    <div className="space-y-2 rounded-2xl bg-[#182229] border border-white/5 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            <ShieldCheckIcon className="h-4 w-4 text-[#25d366]" />
                            इस फीचर / सेटिंग से क्या होता है (What this does):
                        </p>
                        <ul className="space-y-2 pt-1">
                            {step.details.map((detail, idx) => (
                                <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-300 leading-relaxed">
                                    <span className="text-[#25d366] font-bold shrink-0 mt-0.5">✓</span>
                                    <span>{detail}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {user?.college && (
                        <div className="flex items-center gap-2 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2">
                            <AcademicCapIcon className="h-4 w-4 shrink-0 text-violet-400" />
                            <span>Linked to your campus: <strong>{user.college}</strong> {user.location ? `(${user.location})` : ''}</span>
                        </div>
                    )}

                    {/* Progress dots */}
                    <div className="flex items-center justify-center gap-1.5 pt-2">
                        {TOUR_STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentStepIndex(i)}
                                className={`h-2 rounded-full transition-all ${
                                    i === currentStepIndex
                                        ? 'w-6 bg-[#25d366]'
                                        : 'w-2 bg-gray-600 hover:bg-gray-400'
                                }`}
                                title={`Go to step ${i + 1}`}
                            />
                        ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">
                        {currentStepIndex > 0 && (
                            <button
                                type="button"
                                onClick={handlePrev}
                                className="w-full sm:w-auto px-4 py-3.5 rounded-xl border border-white/15 bg-white/5 text-gray-300 text-sm font-semibold hover:bg-white/10 transition"
                            >
                                ← पिछला (Back)
                            </button>
                        )}

                        {/* Prominent Green Button as requested by user */}
                        <button
                            type="button"
                            id="tour-green-action-btn"
                            onClick={handleNext}
                            className="flex-1 w-full flex items-center justify-center gap-2 rounded-xl bg-[#25d366] hover:bg-[#20bd5a] text-[#07090c] font-black py-3.5 px-6 text-sm tracking-wide uppercase shadow-lg shadow-[#25d366]/30 ring-4 ring-[#25d366]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
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
                            टूर छोड़ें (Skip Tour)
                        </button>
                        <span>बाद में सेटिंग्स से कभी भी देख सकते हैं</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppFeatureTour;
