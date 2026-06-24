import React, { useState, useEffect } from 'react';
import { ArrowLeftIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

const PodLiveView = ({ active, onBack }) => {
    const [statuses, setStatuses] = useState({
        frontend: 'checking',
        backend: 'checking',
        livekit: 'checking'
    });
    const [checking, setChecking] = useState(false);
    const [copiedText, setCopiedText] = useState('');

    const checkServices = async () => {
        setChecking(true);
        const results = { frontend: 'offline', backend: 'offline', livekit: 'offline' };

        // 1. Frontend Check (http://localhost:3000)
        try {
            await fetch('http://localhost:3000', { mode: 'no-cors', cache: 'no-cache' });
            results.frontend = 'online';
        } catch (e) {
            results.frontend = 'offline';
        }

        // 2. Backend Check (http://localhost:5005)
        try {
            await fetch('http://localhost:5005', { mode: 'no-cors', cache: 'no-cache' });
            results.backend = 'online';
        } catch (e) {
            results.backend = 'offline';
        }

        // 3. LiveKit Check (http://localhost:7880 - Livekit HTTP Port)
        try {
            await fetch('http://localhost:7880', { mode: 'no-cors', cache: 'no-cache' });
            results.livekit = 'online';
        } catch (e) {
            results.livekit = 'offline';
        }

        setStatuses(results);
        setChecking(false);
    };

    useEffect(() => {
        if (active) {
            checkServices();
        }
    }, [active]);

    const handleCopy = (text, label) => {
        navigator.clipboard.writeText(text);
        setCopiedText(label);
        setTimeout(() => setCopiedText(''), 2000);
    };

    if (!active) return null;

    const allOnline = statuses.frontend === 'online' && statuses.backend === 'online';

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
                            🎙️ PodLive Control Center
                        </h1>
                        <p className="text-xs text-gray-400">Next-Generation Live Podcast Platform</p>
                    </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-3 bg-gray-900/60 border border-gray-800 px-3 py-1.5 rounded-lg text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${statuses.frontend === 'online' ? 'bg-emerald-500 animate-pulse' : statuses.frontend === 'checking' ? 'bg-yellow-500' : 'bg-rose-500'}`} />
                            <span className="text-gray-300">Frontend (Port 3000)</span>
                        </div>
                        <span className="text-gray-600">|</span>
                        <div className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${statuses.backend === 'online' ? 'bg-emerald-500 animate-pulse' : statuses.backend === 'checking' ? 'bg-yellow-500' : 'bg-rose-500'}`} />
                            <span className="text-gray-300">Backend (Port 5005)</span>
                        </div>
                        <span className="text-gray-600">|</span>
                        <div className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${statuses.livekit === 'online' ? 'bg-emerald-500 animate-pulse' : statuses.livekit === 'checking' ? 'bg-yellow-500' : 'bg-rose-500'}`} />
                            <span className="text-gray-300">LiveKit (Port 7880)</span>
                        </div>
                    </div>

                    <button
                        onClick={checkServices}
                        disabled={checking}
                        className={`p-2 rounded-lg bg-gray-850 hover:bg-gray-800 border border-gray-700/80 transition-all text-gray-300 flex items-center justify-center ${checking ? 'opacity-50' : ''}`}
                        title="Reload Status"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                    </button>

                    <a
                        href="http://localhost:3000"
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
            <main className="flex-1 w-full overflow-y-auto relative p-6 flex flex-col justify-center items-center">
                {allOnline ? (
                    <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-black/40 relative">
                        <iframe
                            src="http://localhost:3000"
                            className="w-full h-full border-none"
                            title="PodLive App"
                            allow="microphone; camera; display-capture; autoplay"
                        />
                    </div>
                ) : (
                    <div className="max-w-xl w-full bg-[#131929]/85 backdrop-blur-md border border-gray-800/80 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
                        {/* Decorative Background Glows */}
                        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />
                        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />

                        {/* Pulsing Mic Icon */}
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-indigo-500/25 rounded-full blur-xl animate-pulse" />
                            <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30">
                                <span className="text-3xl animate-bounce">🎙️</span>
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-2">PodLive Application Offline</h2>
                        <p className="text-sm text-gray-400 mb-6 max-w-sm">
                            PodLive services are not running locally. Please start the services to enable the live stream dashboard.
                        </p>

                        {/* Terminal Setup Instructions */}
                        <div className="w-full bg-[#080c14] border border-gray-855 rounded-xl p-4 text-left mb-6 font-mono text-xs">
                            <div className="flex items-center justify-between text-gray-500 mb-2 border-b border-gray-850 pb-2">
                                <span>Terminal Command</span>
                                <button
                                    onClick={() => handleCopy('cd podlive && chmod +x start.sh && ./start.sh', 'start')}
                                    className="hover:text-gray-300 flex items-center gap-1 transition-colors"
                                >
                                    {copiedText === 'start' ? (
                                        <>
                                            <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                                            <span className="text-emerald-500">Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                            <span>Copy</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <span className="text-indigo-400"># Start all PodLive components (LiveKit, Backend, & Web App)</span>
                            <div className="text-gray-300 mt-1 select-all">
                                cd podlive && chmod +x start.sh && ./start.sh
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={checkServices}
                                disabled={checking}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/15 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                                Check Connection Again
                            </button>
                        </div>

                        {/* Help Footer */}
                        <div className="mt-6 pt-5 border-t border-gray-855 w-full flex items-center justify-between text-xs text-gray-500">
                            <span>Frontend: localhost:3000</span>
                            <span>•</span>
                            <span>Backend: localhost:5005</span>
                            <span>•</span>
                            <span>LiveKit: localhost:7880</span>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default PodLiveView;
