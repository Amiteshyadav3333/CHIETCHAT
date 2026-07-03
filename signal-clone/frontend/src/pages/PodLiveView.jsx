import React from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const PodLiveView = ({ active, onBack }) => {
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

            {/* Immersive Fullscreen Iframe */}
            <div className="w-full h-full flex-1 relative bg-black">
                <iframe
                    src={iframeUrl}
                    className="w-full h-full border-none absolute inset-0"
                    title="PodLive App"
                    allow="microphone; camera; display-capture; autoplay; fullscreen"
                />
            </div>
        </div>
    );
};

export default PodLiveView;
