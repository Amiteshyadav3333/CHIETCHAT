import React from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const PODLIVE_URL = 'https://podlive-sigma.vercel.app/';

const PodLiveView = ({ active, onBack }) => {
    if (!active) return null;
    return <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-gray-100">
        <button onClick={onBack} className="absolute left-4 top-4 z-50 rounded-full border border-white/10 bg-black/60 p-3 text-white shadow-xl backdrop-blur-md hover:bg-black/80" title="Back to CHEETCHAT"><ArrowLeftIcon className="h-5 w-5" /></button>
        <iframe src={PODLIVE_URL} className="absolute inset-0 h-full w-full border-0" title="PodLive App" allow="microphone; camera; display-capture; autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerPolicy="no-referrer" />
    </div>;
};

export default PodLiveView;
