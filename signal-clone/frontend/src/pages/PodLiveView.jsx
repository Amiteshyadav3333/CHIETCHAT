import React, { useState } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const PodLiveView = ({ active, onBack }) => {
    const [hasConsented, setHasConsented] = useState(false);
    if (!active) return null;

    const iframeUrl = 'https://podlive-sigma.vercel.app';

    return (
        <div className="flex flex-col h-full w-full bg-black text-gray-100 font-sans relative overflow-hidden">
            
            {/* Floating Back Button (Top Left) */}
            <button
                onClick={onBack}
                className="absolute top-4 left-4 z-50 p-3 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/10 text-white shadow-xl transition-all hover:scale-105 active:scale-95 group"
                title="Back to Chats"
            >
                <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>

            <div className="w-full h-full flex-1 relative bg-black">
                {hasConsented ? (
                    <iframe
                        src={iframeUrl}
                        className="w-full h-full border-none absolute inset-0"
                        title="PodLive App"
                        allow="microphone; camera; display-capture; autoplay; fullscreen"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center p-6">
                        <div className="max-w-md rounded-3xl border border-white/10 bg-[#111b21] p-7 text-center shadow-2xl">
                            <div className="mb-4 text-5xl">🎙️</div>
                            <h2 className="text-xl font-bold text-white">Open PodLive?</h2>
                            <p className="mt-3 text-sm leading-6 text-gray-400">PodLive is a separate trusted service. It can request microphone, camera or screen access only after you continue and approve the browser permission.</p>
                            <button type="button" onClick={() => setHasConsented(true)} className="mt-6 w-full rounded-xl bg-[#00a884] py-3 font-bold text-white hover:bg-[#06bd96]">Continue to PodLive</button>
                            <button type="button" onClick={onBack} className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-gray-400 hover:text-white">Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PodLiveView;
