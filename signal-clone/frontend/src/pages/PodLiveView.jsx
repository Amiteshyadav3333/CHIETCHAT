import React from 'react';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

const PodLiveView = ({ active, onBack }) => {
    if (!active) return null;

    const iframeUrl = 'https://podlive-sigma.vercel.app';

    return (
        <div className="flex flex-col h-full w-full bg-[#0b0f19] text-gray-100 font-sans relative">
            {/* Header Control Panel */}
            <header className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#111625] z-10 gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/80 transition-colors text-gray-300"
                        title="Back to Chats"
                    >
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
                            🎙️ PodLive Portal
                        </h1>
                        <p className="text-xs text-gray-400">Next-Generation Live Podcast Platform</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <a
                        href={iframeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/20"
                    >
                        Open Standalone
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    </a>
                </div>
            </header>

            {/* Main Workspace Area */}
            <main className="flex-1 w-full p-6 bg-[#080c14] relative">
                <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-black/40 relative">
                    <iframe
                        src={iframeUrl}
                        className="w-full h-full border-none"
                        title="PodLive App"
                        allow="microphone; camera; display-capture; autoplay"
                    />
                </div>
            </main>
        </div>
    );
};

export default PodLiveView;
