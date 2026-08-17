import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';

const bestRecorderType = () => [
    'video/mp4;codecs=h264,aac', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
].find(type => window.MediaRecorder?.isTypeSupported?.(type)) || '';

const TARGET_VIDEO_BITRATE = 70_000_000;

const downloadFile = (file) => {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = file.name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const ProCameraStudio = ({ onClose, onCapture, initialMode = 'photo', autoSave = true, maxDuration = null }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const [mode, setMode] = useState(initialMode);
    const [facing, setFacing] = useState('environment');
    const [orientation, setOrientation] = useState('portrait');
    const [zoom, setZoom] = useState(1);
    const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
    const [resolution, setResolution] = useState('Starting…');
    const [recorderBitrate, setRecorderBitrate] = useState(0);
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const stopStream = useCallback(() => {
        window.clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const startCamera = useCallback(async () => {
        stopStream(); setError(''); setResult(null);
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setError('Pro Camera needs HTTPS and camera permission.'); return;
        }
        const landscape = orientation === 'landscape';
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: facing },
                    width: { ideal: landscape ? 3840 : 2160 },
                    height: { ideal: landscape ? 2160 : 3840 },
                    frameRate: { ideal: 30, max: 60 }
                },
                audio: mode === 'video' ? {
                    channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 24 },
                    echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true }
                } : false
            });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings?.() || {};
            setResolution(`${settings.width || '?'}×${settings.height || '?'}${(settings.width || 0) >= 3840 || (settings.height || 0) >= 3840 ? ' · 4K' : ' · device max'}`);
            const caps = track.getCapabilities?.() || {};
            if (caps.zoom) {
                setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
                setZoom(caps.zoom.min);
            } else { setZoomRange({ min: 1, max: 1, step: 0.1 }); setZoom(1); }
            const advanced = {};
            if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
            if (caps.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous';
            if (caps.whiteBalanceMode?.includes('continuous')) advanced.whiteBalanceMode = 'continuous';
            if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] }).catch(() => {});
        } catch (err) { setError(err.name === 'NotAllowedError' ? 'Please allow camera and microphone access.' : `Camera unavailable: ${err.message}`); }
    }, [facing, mode, orientation, stopStream]);

    useEffect(() => { startCamera(); return stopStream; }, [startCamera, stopStream]);
    useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

    const changeZoom = async value => {
        const next = Number(value); setZoom(next);
        const track = streamRef.current?.getVideoTracks()[0];
        if (zoomRange.max > 1) await track?.applyConstraints({ advanced: [{ zoom: next }] }).catch(() => {});
    };

    const setCapturedFile = file => {
        const next = { file, url: URL.createObjectURL(file), type: file.type.startsWith('video/') ? 'video' : 'image' };
        setResult(next);
        if (autoSave) downloadFile(file);
    };

    const takePhoto = () => {
        const video = videoRef.current; if (!video?.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', { alpha: false });
        if (facing === 'user') { context.translate(canvas.width, 0); context.scale(-1, 1); }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob && setCapturedFile(new File([blob], `cheetchat-ultra-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.99);
    };

    const toggleRecording = () => {
        if (recording) { recorderRef.current?.stop(); return; }
        const stream = streamRef.current; if (!stream) return;
        const mimeType = bestRecorderType(); chunksRef.current = [];
        let recorder;
        const bitrateOptions = [TARGET_VIDEO_BITRATE, 60_000_000, 35_000_000, null];
        for (const bitrate of bitrateOptions) {
            try {
                recorder = new MediaRecorder(stream, {
                    ...(mimeType ? { mimeType } : {}),
                    ...(bitrate ? { videoBitsPerSecond: bitrate, audioBitsPerSecond: 320_000 } : {})
                });
                break;
            } catch {
                // Try the next best encoder profile instead of blocking capture.
            }
        }
        if (!recorder) {
            setError('This browser could not start video recording.');
            return;
        }
        const acceptedBitrate = recorder.videoBitsPerSecond || 0;
        setRecorderBitrate(acceptedBitrate);
        recorderRef.current = recorder;
        recorder.ondataavailable = event => event.data.size && chunksRef.current.push(event.data);
        recorder.onstop = () => {
            const type = recorder.mimeType || mimeType || 'video/webm';
            const extension = type.includes('mp4') ? 'mp4' : 'webm';
            setCapturedFile(new File(chunksRef.current, `cheetchat-ultra-${Date.now()}.${extension}`, { type }));
            setRecording(false); window.clearInterval(timerRef.current);
        };
        recorder.start(1000); setRecording(true); setSeconds(0);
        timerRef.current = window.setInterval(() => setSeconds(value => {
            const next = value + 1;
            if (maxDuration && next >= maxDuration && recorder.state === 'recording') recorder.stop();
            return next;
        }), 1000);
    };

    const close = () => { if (recording) recorderRef.current?.stop(); stopStream(); onClose?.(); };
    const useResult = () => { onCapture?.(result.file); close(); };

    return <div className="fixed inset-0 z-[200] flex bg-black text-white">
        <div className={`relative m-auto h-full w-full overflow-hidden bg-black ${orientation === 'landscape' ? 'sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl' : 'sm:max-h-[92vh] sm:max-w-md sm:rounded-3xl'}`}>
            {result ? (result.type === 'video' ? <video src={result.url} controls playsInline className="h-full w-full object-contain" /> : <img src={result.url} alt="Captured" className="h-full w-full object-contain" />)
                : <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <button onClick={close} className="rounded-full bg-black/50 p-2"><XMarkIcon className="h-6 w-6" /></button>
                <div className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold">PRO · {resolution}</div>
                {!result && <button disabled={recording} onClick={() => setFacing(value => value === 'user' ? 'environment' : 'user')} className="rounded-full bg-black/50 p-2 disabled:opacity-40"><ArrowPathIcon className="h-6 w-6" /></button>}
            </div>
            {error && <div className="absolute inset-0 grid place-items-center p-8 text-center"><p className="rounded-2xl bg-red-950/90 p-5">{error}</p></div>}
            {!result && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16">
                {zoomRange.max > 1 ? <div className="mb-5 flex items-center gap-3"><span className="text-xs">1×</span><input disabled={recording} aria-label="Camera zoom" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={event => changeZoom(event.target.value)} className="w-full accent-yellow-400 disabled:opacity-40" /><span className="min-w-10 text-xs">{zoom.toFixed(1)}×</span></div> : <p className="mb-4 text-center text-[11px] text-gray-400">Hardware zoom is not exposed by this device/browser</p>}
                <div className="mb-5 flex justify-center gap-2 text-xs font-bold">
                    <button disabled={recording} onClick={() => setMode('photo')} className={`rounded-full px-4 py-2 disabled:opacity-40 ${mode === 'photo' ? 'bg-yellow-400 text-black' : 'bg-white/15'}`}>PHOTO</button>
                    <button disabled={recording} onClick={() => setMode('video')} className={`rounded-full px-4 py-2 disabled:opacity-40 ${mode === 'video' ? 'bg-yellow-400 text-black' : 'bg-white/15'}`}>VIDEO</button>
                    <button disabled={recording} onClick={() => setOrientation(value => value === 'portrait' ? 'landscape' : 'portrait')} className="rounded-full bg-white/15 px-4 py-2 disabled:opacity-40">{orientation === 'portrait' ? '↔ Landscape' : '↕ Portrait'}</button>
                </div>
                <div className="flex items-center justify-center">
                    <button aria-label={mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'} onClick={mode === 'photo' ? takePhoto : toggleRecording} className={`grid h-20 w-20 place-items-center rounded-full border-4 border-white ${recording ? 'bg-red-600' : 'bg-white/20'}`}><span className={`block ${mode === 'video' ? 'h-10 w-10 rounded-lg bg-red-500' : 'h-14 w-14 rounded-full bg-white'}`} /></button>
                    {recording && <span className="absolute ml-32 rounded-full bg-red-600 px-3 py-1 text-xs font-bold">● {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>}
                </div>
                {mode === 'video' && <p className="mt-4 text-center text-[11px] text-gray-300">Ultra Pro: {recording ? `${recorderBitrate ? `${(recorderBitrate / 1_000_000).toFixed(0)} Mbps` : 'device-managed bitrate'} active` : 'up to 70 Mbps target'} · Voice Focus · {maxDuration ? `${maxDuration}s limit` : 'no app time limit'}</p>}
            </div>}
            {result && <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black p-6 pt-20">
                <button onClick={() => { URL.revokeObjectURL(result.url); setResult(null); startCamera(); }} className="rounded-full bg-white/15 px-5 py-3 text-sm font-bold">Retake</button>
                <button onClick={() => downloadFile(result.file)} className="rounded-full bg-white/15 p-3" title="Save to gallery"><ArrowDownTrayIcon className="h-5 w-5" /></button>
                <button onClick={useResult} className="rounded-full bg-[#00a884] px-7 py-3 text-sm font-bold">Use media</button>
            </div>}
        </div>
    </div>;
};

export default ProCameraStudio;
