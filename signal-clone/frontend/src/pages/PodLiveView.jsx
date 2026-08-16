import React from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const PODLIVE_URL = 'https://podlive-sigma.vercel.app/';

const PodLiveView = ({ active, onBack }) => {
    if (!active) return null;
    const allowCamera = localStorage.getItem('podlive_allow_camera') !== '0';
    const allowMicrophone = localStorage.getItem('podlive_allow_microphone') !== '0';
    const allowAutoplay = localStorage.getItem('podlive_autoplay') !== '0';
    const permissions = [allowMicrophone && 'microphone', allowCamera && 'camera', 'display-capture', allowAutoplay && 'autoplay', 'fullscreen'].filter(Boolean).join('; ');
    return <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-gray-100">
        <button onClick={onBack} className="absolute left-4 top-4 z-50 rounded-full border border-white/10 bg-black/60 p-3 text-white shadow-xl backdrop-blur-md hover:bg-black/80" title="Back to CHEETCHAT"><ArrowLeftIcon className="h-5 w-5" /></button>
        <iframe src={PODLIVE_URL} className="absolute inset-0 h-full w-full border-0" title="PodLive App" allow={permissions} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerPolicy="no-referrer" />
    </div>;
};

export default PodLiveView;
