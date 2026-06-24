import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { formatDuration } from '../utils/mediaCompressor';

/* ─── Premium Fullscreen Media Viewer ─── */
const FullscreenMediaModal = ({ src, type, onClose }) => {
    if (!src) return null;

    const isVideo = type === 'video' || src.match(/\.(mp4|webm|ogg)$/i);
    const isAudio = type === 'audio' || src.match(/\.(mp3|wav|m4a|aac|oga|webm)$/i);

    const handleDownload = async (e) => {
        e.stopPropagation();
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = src.split('/').pop() || 'media';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch {
            window.open(src, '_blank');
        }
    };

    if (isVideo) return <VideoViewer src={src} onClose={onClose} onDownload={handleDownload} />;
    if (isAudio) return <AudioViewer src={src} onClose={onClose} onDownload={handleDownload} />;
    return <ImageViewer src={src} onClose={onClose} onDownload={handleDownload} />;
};

/* ─── Image Viewer with Pinch Zoom ─── */
const ImageViewer = ({ src, onClose, onDownload }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const lastDistance = useRef(null);
    const imgRef = useRef(null);
    const containerRef = useRef(null);

    const resetZoom = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        if (scale > 1) { resetZoom(); }
        else {
            const rect = containerRef.current.getBoundingClientRect();
            const cx = e.clientX - rect.left - rect.width / 2;
            const cy = e.clientY - rect.top - rect.height / 2;
            setScale(2.5);
            setPosition({ x: -cx * 1.5, y: -cy * 1.5 });
        }
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.18;
        setScale(s => Math.min(Math.max(s * delta, 0.5), 5));
    };

    const handleMouseDown = (e) => {
        if (scale <= 1) return;
        setIsDragging(true);
        lastPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };
    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - lastPos.current.x, y: e.clientY - lastPos.current.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    // Touch zoom
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            lastDistance.current = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1 && scale > 1) {
            lastPos.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
        }
    };
    const handleTouchMove = (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (lastDistance.current) {
                const ratio = dist / lastDistance.current;
                setScale(s => Math.min(Math.max(s * ratio, 0.5), 5));
            }
            lastDistance.current = dist;
        } else if (e.touches.length === 1 && scale > 1) {
            setPosition({ x: e.touches[0].clientX - lastPos.current.x, y: e.touches[0].clientY - lastPos.current.y });
        }
    };
    const handleTouchEnd = () => { lastDistance.current = null; };

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.97)' }}
            onClick={scale <= 1 ? onClose : undefined}
        >
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-10 pb-4"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
                <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                <div className="flex gap-3">
                    {scale > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); resetZoom(); }}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-white text-xs font-bold transition-colors">
                            Reset Zoom
                        </button>
                    )}
                    <button onClick={onDownload} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" title="Download">
                        <ArrowDownTrayIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Image container */}
            <div
                ref={containerRef}
                className="flex-1 flex items-center justify-center overflow-hidden"
                style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <img
                    ref={imgRef}
                    src={src}
                    alt="Full view"
                    draggable={false}
                    onDoubleClick={handleDoubleClick}
                    className="select-none"
                    style={{
                        maxWidth: '100vw',
                        maxHeight: '90vh',
                        objectFit: 'contain',
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease',
                        userSelect: 'none',
                    }}
                />
            </div>

            {/* Hint */}
            {scale <= 1 && (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <span className="text-white/30 text-xs">Double-tap to zoom • Pinch to zoom • Click outside to close</span>
                </div>
            )}
        </div>
    );
};

/* ─── Video Viewer with Full Controls ─── */
const VideoViewer = ({ src, onClose, onDownload }) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimer = useRef(null);
    const progressRef = useRef(null);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const onMeta = () => setDuration(v.duration || 0);
        const onTime = () => setCurrentTime(v.currentTime);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);
        return () => {
            v.removeEventListener('loadedmetadata', onMeta);
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('play', onPlay);
            v.removeEventListener('pause', onPause);
        };
    }, []);

    const resetControlsTimer = () => {
        setShowControls(true);
        clearTimeout(controlsTimer.current);
        controlsTimer.current = setTimeout(() => isPlaying && setShowControls(false), 3000);
    };

    const togglePlay = (e) => {
        e.stopPropagation();
        resetControlsTimer();
        videoRef.current?.paused ? videoRef.current.play() : videoRef.current.pause();
    };

    const handleProgressClick = (e) => {
        e.stopPropagation();
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        videoRef.current.currentTime = ratio * duration;
    };

    const toggleMute = (e) => {
        e.stopPropagation();
        const v = videoRef.current;
        v.muted = !v.muted;
        setIsMuted(v.muted);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col" onMouseMove={resetControlsTimer} onClick={resetControlsTimer}>
            {/* Top bar */}
            <div className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-10 pb-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
                <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                <button onClick={onDownload} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                    <ArrowDownTrayIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Video */}
            <div className="flex-1 flex items-center justify-center" onClick={togglePlay}>
                <video ref={videoRef} src={src} className="max-w-full max-h-full object-contain" playsInline />
            </div>

            {/* Center play/pause indicator */}
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20">
                    {isPlaying ? (
                        <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-1">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </div>
            </div>

            {/* Bottom controls */}
            <div className={`absolute bottom-0 left-0 right-0 z-20 px-4 pb-8 pt-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}>
                {/* Progress bar */}
                <div ref={progressRef} className="w-full h-1 bg-white/20 rounded-full cursor-pointer mb-3 relative group/progress"
                    onClick={handleProgressClick}>
                    <div className="h-full bg-white rounded-full transition-all relative" style={{ width: `${progress}%` }}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Play/Pause */}
                    <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
                        {isPlaying ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>

                    {/* Time */}
                    <span className="text-white/70 text-sm font-mono tabular-nums">
                        {formatDuration(currentTime)} / {formatDuration(duration)}
                    </span>

                    <div className="flex-1" />

                    {/* Volume */}
                    <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
                        {isMuted ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                            </svg>
                        )}
                    </button>

                    {/* Volume slider */}
                    <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setVolume(v);
                            if (videoRef.current) videoRef.current.volume = v;
                            if (v > 0) setIsMuted(false);
                        }}
                        className="w-20 accent-white cursor-pointer" />
                </div>
            </div>
        </div>
    );
};

/* ─── Audio Fullscreen Viewer ─── */
const AudioViewer = ({ src, onClose, onDownload }) => {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const progressRef = useRef(null);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const onMeta = () => setDuration(a.duration || 0);
        const onTime = () => setCurrentTime(a.currentTime);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        a.addEventListener('loadedmetadata', onMeta);
        a.addEventListener('timeupdate', onTime);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        return () => {
            a.removeEventListener('loadedmetadata', onMeta);
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('play', onPlay);
            a.removeEventListener('pause', onPause);
        };
    }, []);

    const togglePlay = () => audioRef.current?.paused ? audioRef.current.play() : audioRef.current.pause();

    const handleProgressClick = (e) => {
        const rect = progressRef.current.getBoundingClientRect();
        audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bars = Array.from({ length: 40 }, (_, i) => {
        const base = Math.sin(i * 0.7) * 0.5 + 0.5;
        const animated = isPlaying ? Math.random() * 0.6 + 0.2 : base * 0.4 + 0.1;
        return { height: base * 0.6 + 0.1, animated };
    });

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #0f1923 50%, #0d1117 100%)' }}>
            <audio ref={audioRef} src={src} />

            {/* Top */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-10 pb-4">
                <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                <button onClick={onDownload} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                    <ArrowDownTrayIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Waveform visualization */}
            <div className="flex items-end gap-1 h-24 mb-8">
                {bars.map((bar, i) => (
                    <div key={i}
                        className="rounded-full transition-all duration-100"
                        style={{
                            width: '4px',
                            height: `${(isPlaying ? Math.random() * 60 + 20 : bar.height * 60 + 10)}px`,
                            background: i / bars.length < progress / 100
                                ? 'linear-gradient(to top, #25d366, #00c896)'
                                : 'rgba(255,255,255,0.2)',
                            animation: isPlaying ? `wave ${0.4 + (i % 5) * 0.1}s ease-in-out infinite alternate` : 'none'
                        }}
                    />
                ))}
            </div>

            {/* Voice message label */}
            <div className="text-white/50 text-sm mb-8">Voice Message</div>

            {/* Progress */}
            <div className="w-72 mb-4">
                <div ref={progressRef} className="w-full h-1.5 bg-white/15 rounded-full cursor-pointer"
                    onClick={handleProgressClick}>
                    <div className="h-full bg-[#25d366] rounded-full relative" style={{ width: `${progress}%` }}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg" />
                    </div>
                </div>
                <div className="flex justify-between text-xs text-white/40 mt-1 font-mono tabular-nums">
                    <span>{formatDuration(currentTime)}</span>
                    <span>{formatDuration(duration)}</span>
                </div>
            </div>

            {/* Play button */}
            <button onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-[#25d366] hover:bg-[#20c05a] flex items-center justify-center shadow-xl shadow-green-500/30 transition-all active:scale-95">
                {isPlaying ? (
                    <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-1">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            <style>{`
                @keyframes wave {
                    from { transform: scaleY(0.6); }
                    to { transform: scaleY(1); }
                }
            `}</style>
        </div>
    );
};

export default FullscreenMediaModal;
