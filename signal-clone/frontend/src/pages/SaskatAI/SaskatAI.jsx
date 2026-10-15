import React, { useEffect, useRef, useState } from 'react';
import { MicrophoneIcon, XMarkIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';

const SaskatAI = ({ onClose, onCommand }) => {
    const [listening, setListening] = useState(false);
    const [working, setWorking] = useState(false);
    const [supported, setSupported] = useState(true);
    const [transcript, setTranscript] = useState('');
    const [reply, setReply] = useState('Main Saskat hoon. App ko voice se control karne ke liye mic dabayein.');
    const recognitionRef = useRef(null);
    const requestRef = useRef(0);

    useEffect(() => () => {
        recognitionRef.current?.abort();
        window.speechSynthesis?.cancel();
    }, []);

    const speak = (text) => {
        if (!window.speechSynthesis || !text) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-IN';
        window.speechSynthesis.speak(utterance);
    };

    const executeVoiceCommand = async (spokenText) => {
        const text = spokenText.trim();
        if (!text) return;
        setTranscript(text);
        setWorking(true);
        try {
            const result = await onCommand?.(text);
            const response = typeof result === 'string'
                ? result
                : result?.message || 'Samajh gaya. App mein command chala di.';
            setReply(response);
            speak(response);
        } catch (error) {
            const response = error?.message || 'Command poori nahi ho saki. Dobara bolkar koshish karein.';
            setReply(response);
            speak(response);
        } finally {
            setWorking(false);
        }
    };

    const toggleListening = () => {
        if (listening) {
            recognitionRef.current?.stop();
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSupported(false);
            const response = 'Is browser mein voice commands supported nahi hain. Chrome ya Edge use karein.';
            setReply(response);
            speak(response);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'hi-IN';
        recognition.continuous = false;
        recognition.interimResults = true;
        requestRef.current += 1;
        const requestId = requestRef.current;
        recognition.onstart = () => setListening(true);
        recognition.onresult = (event) => {
            let interim = '';
            let finalText = '';
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const segment = event.results[index][0]?.transcript || '';
                if (event.results[index].isFinal) finalText += segment;
                else interim += segment;
            }
            if (interim) setTranscript(interim);
            if (finalText) void executeVoiceCommand(finalText);
        };
        recognition.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                const response = 'Mic access nahi mil raha. Browser settings mein microphone permission allow karein.';
                setReply(response);
                speak(response);
            }
        };
        recognition.onend = () => {
            setListening(false);
            if (requestId === requestRef.current) recognitionRef.current = null;
        };
        recognitionRef.current = recognition;
        try { recognition.start(); } catch {
            setListening(false);
            recognitionRef.current = null;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05090d]/90 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="saskat-agent-title">
            <section className="relative flex min-h-[min(620px,88dvh)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#14252a] to-[#091216] text-white shadow-2xl">
                <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-300/25 to-cyan-400/10 text-emerald-200"><MicrophoneIcon className="h-6 w-6" /></div>
                        <div><h1 id="saskat-agent-title" className="font-bold">Saskat App Agent</h1><p className="text-xs text-emerald-200/70">Voice control · signed in as you</p></div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-300 hover:bg-white/10" aria-label="Close agent"><XMarkIcon className="h-5 w-5" /></button>
                </header>

                <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
                    <div className={`mb-7 grid h-36 w-36 place-items-center rounded-full border ${listening ? 'border-emerald-300/80 bg-emerald-400/15 shadow-[0_0_70px_rgba(52,211,153,.25)]' : 'border-white/10 bg-white/[.04]'}`}>
                        <div className={`grid h-24 w-24 place-items-center rounded-full ${listening ? 'animate-pulse bg-emerald-400 text-[#06251d]' : 'bg-white/10 text-emerald-200'}`}>
                            <MicrophoneIcon className="h-11 w-11" />
                        </div>
                    </div>
                    <p className="text-sm font-semibold text-emerald-100">{working ? 'Command chala raha hoon…' : listening ? 'Sun raha hoon…' : 'Mic dabakar boliye'}</p>
                    <div className="mt-6 min-h-16 w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Aapki command</p>
                        <p className="mt-1 text-sm text-gray-200">{transcript || 'Abhi koi command nahi'}</p>
                    </div>
                    <div className="mt-3 min-h-16 w-full rounded-2xl border border-emerald-300/10 bg-emerald-300/[.04] p-4 text-left">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-200/60"><SpeakerWaveIcon className="h-3.5 w-3.5" /> Saskat</p>
                        <p className="mt-1 text-sm text-gray-200">{reply}</p>
                    </div>
                    {!supported && <p className="mt-3 text-xs text-amber-200">Chrome ya Edge mein voice commands chalayen.</p>}
                </div>

                <footer className="border-t border-white/10 px-5 py-5 sm:px-7">
                    <button type="button" onClick={toggleListening} disabled={working} className={`flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 font-bold transition disabled:cursor-wait disabled:opacity-60 ${listening ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-emerald-300 text-[#06251d] hover:bg-emerald-200'}`}>
                        <MicrophoneIcon className="h-6 w-6" />{listening ? 'Sunna band karein' : 'Voice command boliye'}
                    </button>
                    <p className="mt-3 text-center text-[11px] leading-5 text-gray-500">Try: “Chats kholo”, “Open chat with Rahul”, “Reels kholo”, “Publish kholo”, “Drafts dikhao”, “Profile dikhao”, “Settings kholo”</p>
                </footer>
            </section>
        </div>
    );
};

export default SaskatAI;
