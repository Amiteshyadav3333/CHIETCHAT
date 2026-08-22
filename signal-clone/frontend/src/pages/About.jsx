import React, { useEffect } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import AboutCheetChat from '../components/AboutCheetChat';

const About = () => {
    useEffect(() => { const old = document.title; document.title = 'About CHEETCHAT — Features, Founder and Indian Super App'; return () => { document.title = old; }; }, []);
    return <main className="h-dvh overflow-y-auto overscroll-contain bg-[#071016] px-4 py-6 text-white sm:px-6"><div className="mx-auto max-w-4xl"><button onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')} className="mb-5 flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-gray-300 hover:bg-white/10"><ArrowLeftIcon className="h-4 w-4" /> Back</button><AboutCheetChat /></div></main>;
};

export default About;
