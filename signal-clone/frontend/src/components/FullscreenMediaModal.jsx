import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { formatDuration } from '../utils/mediaCompressor';

/* ═══════════════════════════════════════════════════════════════
   ROOT PORTAL — renders directly on <body> so fixed/z-index works
   ═══════════════════════════════════════════════════════════════ */
const Portal = ({ children }) => ReactDOM.createPortal(children, document.body);

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT — dispatch to right viewer
   ═══════════════════════════════════════════════════════════════ */
const FullscreenMediaModal = ({ src, type, onClose }) => {
    useEffect(() => {
        if (!src) return;
        // Prevent body scroll while open
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [src]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    if (!src) return null;

    const isVideo = type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(src);
    const isAudio = type === 'audio' || /\.(mp3|wav|m4a|aac|oga)$/i.test(src) ||
        (type === 'audio' && /\.webm$/i.test(src));

    const handleDownload = async (e) => {
        e?.stopPropagation();
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = decodeURIComponent(src.split('/').pop()) || 'media';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            window.open(src, '_blank');
        }
    };

    return (
        <Portal>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
                {isVideo
                    ? <VideoViewer src={src} onClose={onClose} onDownload={handleDownload} />
                    : isAudio
                        ? <AudioViewer src={src} onClose={onClose} onDownload={handleDownload} />
                        : <ImageViewer src={src} onClose={onClose} onDownload={handleDownload} />
                }
            </div>
        </Portal>
    );
};

/* ═══════════════════════════════════════════════════════════════
   IMAGE VIEWER — WhatsApp style with pinch/double-tap zoom
   ═══════════════════════════════════════════════════════════════ */
const ImageViewer = ({ src, onClose, onDownload }) => {
    const [scale, setScale] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [entering, setEntering] = useState(true);
    const dragStart = useRef(null);
    const lastTap = useRef(0);
    const lastPinchDist = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const t = setTimeout(() => setEntering(false), 30);
        return () => clearTimeout(t);
    }, []);

    const resetZoom = () => { setScale(1); setPos({ x: 0, y: 0 }); };

    /* Mouse drag */
    const onMouseDown = (e) => {
        if (scale <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        dragStart.current = { mx: e.clientX - pos.x, my: e.clientY - pos.y };
    };
    const onMouseMove = (e) => {
        if (!isDragging || !dragStart.current) return;
        setPos({ x: e.clientX - dragStart.current.mx, y: e.clientY - dragStart.current.my });
    };
    const onMouseUp = () => { setIsDragging(false); dragStart.current = null; };

    /* Wheel zoom */
    const onWheel = (e) => {
        e.preventDefault();
        setScale(s => Math.min(Math.max(s * (e.deltaY > 0 ? 0.88 : 1.14), 0.5), 6));
    };

    /* Double click zoom */
    const onDoubleClick = (e) => {
        e.stopPropagation();
        if (scale > 1) { resetZoom(); return; }
        const rect = containerRef.current.getBoundingClientRect();
        const ox = e.clientX - rect.left - rect.width / 2;
        const oy = e.clientY - rect.top - rect.height / 2;
        setScale(2.8);
        setPos({ x: -ox * 1.8, y: -oy * 1.8 });
    };

    /* Touch pinch */
    const onTouchStart = (e) => {
        if (e.touches.length === 2) {
            lastPinchDist.current = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1) {
            // Double-tap detection
            const now = Date.now();
            if (now - lastTap.current < 300) {
                if (scale > 1) resetZoom();
                else { setScale(2.5); }
            }
            lastTap.current = now;
            if (scale > 1) {
                dragStart.current = { mx: e.touches[0].clientX - pos.x, my: e.touches[0].clientY - pos.y };
            }
        }
    };
    const onTouchMove = (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (lastPinchDist.current) setScale(s => Math.min(Math.max(s * (d / lastPinchDist.current), 0.5), 6));
            lastPinchDist.current = d;
        } else if (e.touches.length === 1 && scale > 1 && dragStart.current) {
            setPos({ x: e.touches[0].clientX - dragStart.current.mx, y: e.touches[0].clientY - dragStart.current.my });
        }
    };
    const onTouchEnd = () => { lastPinchDist.current = null; dragStart.current = null; };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: entering ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.97)',
                transition: 'background 0.2s ease',
                display: 'flex', flexDirection: 'column',
                userSelect: 'none',
            }}
        >
            {/* Top bar */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '48px 16px 16px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)',
            }}>
                <button onClick={onClose} style={btnStyle}>
                    <XMarkIcon style={{ width: 24, height: 24, color: 'white' }} />
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                    {scale > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); resetZoom(); }} style={{ ...btnStyle, padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 20 }}>
                            Reset
                        </button>
                    )}
                    <button onClick={onDownload} style={btnStyle} title="Download">
                        <ArrowDownTrayIcon style={{ width: 22, height: 22, color: 'white' }} />
                    </button>
                </div>
            </div>

            {/* Image area */}
            <div
                ref={containerRef}
                style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onClick={() => scale <= 1 && onClose()}
            >
                {!loaded && (
                    <div style={{ position: 'absolute', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</div>
                )}
                <img
                    src={src}
                    alt="media"
                    draggable={false}
                    onLoad={() => setLoaded(true)}
                    onDoubleClick={onDoubleClick}
                    style={{
                        maxWidth: '100vw', maxHeight: '90vh',
                        objectFit: 'contain',
                        opacity: loaded ? 1 : 0,
                        transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`,
                        transition: isDragging ? 'none' : 'transform 0.18s ease, opacity 0.3s ease',
                        display: 'block',
                        borderRadius: scale > 1 ? 0 : 8,
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            </div>

            {/* Hint */}
            {scale <= 1 && loaded && (
                <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 11, pointerEvents: 'none' }}>
                    Double-tap to zoom · Pinch to zoom · Tap outside to close
                </div>
            )}
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════
   VIDEO VIEWER — WhatsApp / Instagram reels style player
   ═══════════════════════════════════════════════════════════════ */
const VideoViewer = ({ src, onClose, onDownload }) => {
    const videoRef = useRef(null);
    const progressRef = useRef(null);
    const hideTimer = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [showUI, setShowUI] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [buffered, setBuffered] = useState(0);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const handlers = {
            loadedmetadata: () => setDuration(v.duration || 0),
            timeupdate: () => {
                setCurrentTime(v.currentTime);
                if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
            },
            play: () => setPlaying(true),
            pause: () => setPlaying(false),
            canplay: () => setLoaded(true),
            ended: () => { setPlaying(false); resetUI(); },
        };
        Object.entries(handlers).forEach(([e, h]) => v.addEventListener(e, h));
        return () => Object.entries(handlers).forEach(([e, h]) => v.removeEventListener(e, h));
    }, []);

    const resetUI = () => {
        setShowUI(true);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) setShowUI(false);
        }, 3500);
    };

    const togglePlay = (e) => {
        e?.stopPropagation();
        resetUI();
        videoRef.current?.paused ? videoRef.current.play() : videoRef.current.pause();
    };

    const seek = (e) => {
        e.stopPropagation();
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (videoRef.current) videoRef.current.currentTime = ratio * duration;
    };

    const toggleMute = (e) => {
        e.stopPropagation();
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setMuted(v.muted);
    };

    const changeVolume = (e) => {
        e.stopPropagation();
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (videoRef.current) videoRef.current.volume = val;
        if (val > 0) setMuted(false);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}
            onMouseMove={resetUI}
            onClick={resetUI}
        >
            {/* TOP BAR */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '48px 16px 24px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)',
                opacity: showUI ? 1 : 0,
                pointerEvents: showUI ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
            }}>
                <button onClick={onClose} style={btnStyle}>
                    <XMarkIcon style={{ width: 24, height: 24, color: 'white' }} />
                </button>
                <button onClick={onDownload} style={btnStyle}>
                    <ArrowDownTrayIcon style={{ width: 22, height: 22, color: 'white' }} />
                </button>
            </div>

            {/* VIDEO */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                onClick={togglePlay}>
                <video
                    ref={videoRef}
                    src={src}
                    playsInline
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                />
                {/* Loading spinner */}
                {!loaded && (
                    <div style={{ position: 'absolute', color: 'rgba(255,255,255,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: 13 }}>Loading video…</span>
                    </div>
                )}
            </div>

            {/* CENTER PLAY/PAUSE RIPPLE */}
            <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
                opacity: showUI ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}>
                <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(12px)',
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                    {playing
                        ? <svg viewBox="0 0 24 24" fill="white" style={{ width: 30, height: 30 }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        : <svg viewBox="0 0 24 24" fill="white" style={{ width: 30, height: 30, marginLeft: 3 }}><path d="M8 5v14l11-7z" /></svg>
                    }
                </div>
            </div>

            {/* BOTTOM CONTROLS */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
                padding: '32px 20px 36px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)',
                opacity: showUI ? 1 : 0,
                pointerEvents: showUI ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
            }}>
                {/* Progress bar with buffered */}
                <div
                    ref={progressRef}
                    onClick={seek}
                    style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 4, cursor: 'pointer', marginBottom: 14, position: 'relative' }}
                >
                    {/* Buffered */}
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${bufferedPct}%`, background: 'rgba(255,255,255,0.28)', borderRadius: 4 }} />
                    {/* Played */}
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress}%`, background: '#25d366', borderRadius: 4, transition: 'width 0.1s linear' }}>
                        <div style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, borderRadius: '50%', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Play/pause */}
                    <button onClick={togglePlay} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'white' }}>
                        {playing
                            ? <svg viewBox="0 0 24 24" fill="white" style={{ width: 28, height: 28 }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                            : <svg viewBox="0 0 24 24" fill="white" style={{ width: 28, height: 28 }}><path d="M8 5v14l11-7z" /></svg>
                        }
                    </button>

                    {/* Time */}
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {formatDuration(currentTime)} / {formatDuration(duration)}
                    </span>

                    <div style={{ flex: 1 }} />

                    {/* Volume icon */}
                    <button onClick={toggleMute} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.75)' }}>
                        {muted
                            ? <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 22, height: 22 }}><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
                            : <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 22, height: 22 }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                        }
                    </button>

                    {/* Volume slider */}
                    <input
                        type="range" min="0" max="1" step="0.05"
                        value={muted ? 0 : volume}
                        onChange={changeVolume}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 80, accentColor: '#25d366', cursor: 'pointer' }}
                    />
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════
   AUDIO VIEWER — Premium music player style
   ═══════════════════════════════════════════════════════════════ */
const AudioViewer = ({ src, onClose, onDownload }) => {
    const audioRef = useRef(null);
    const progressRef = useRef(null);
    const animRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [barHeights, setBarHeights] = useState(() => Array.from({ length: 50 }, (_, i) => Math.abs(Math.sin(i * 0.4)) * 0.75 + 0.15));

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const hs = {
            loadedmetadata: () => setDuration(a.duration || 0),
            timeupdate: () => setCurrentTime(a.currentTime),
            play: () => setPlaying(true),
            pause: () => setPlaying(false),
            ended: () => { setPlaying(false); setCurrentTime(0); },
        };
        Object.entries(hs).forEach(([e, h]) => a.addEventListener(e, h));
        return () => Object.entries(hs).forEach(([e, h]) => a.removeEventListener(e, h));
    }, []);

    // Animate waveform bars when playing
    useEffect(() => {
        if (playing) {
            const animate = () => {
                setBarHeights(prev => prev.map((h, i) => {
                    const base = Math.abs(Math.sin(i * 0.4)) * 0.75 + 0.15;
                    return base * 0.4 + Math.random() * 0.6;
                }));
                animRef.current = requestAnimationFrame(animate);
            };
            animRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animRef.current);
            setBarHeights(Array.from({ length: 50 }, (_, i) => Math.abs(Math.sin(i * 0.4)) * 0.75 + 0.15));
        }
        return () => cancelAnimationFrame(animRef.current);
    }, [playing]);

    const togglePlay = () => audioRef.current?.paused ? audioRef.current.play() : audioRef.current.pause();

    const seek = (e) => {
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (audioRef.current) audioRef.current.currentTime = ratio * duration;
    };

    const cycleSpeed = () => {
        const speeds = [1, 1.25, 1.5, 2];
        const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
        setSpeed(next);
        if (audioRef.current) audioRef.current.playbackRate = next;
    };

    const skipBy = (secs) => {
        if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + secs));
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const fileName = decodeURIComponent(src.split('/').pop() || 'Voice Message').replace(/\.[^.]+$/, '');

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'linear-gradient(160deg, #0d1b2a 0%, #112233 40%, #0a1520 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
            <audio ref={audioRef} src={src} preload="metadata" />

            {/* TOP BAR */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '48px 16px 16px',
            }}>
                <button onClick={onClose} style={btnStyle}>
                    <XMarkIcon style={{ width: 24, height: 24, color: 'white' }} />
                </button>
                <button onClick={onDownload} style={btnStyle}>
                    <ArrowDownTrayIcon style={{ width: 22, height: 22, color: 'white' }} />
                </button>
            </div>

            {/* ALBUM ART placeholder */}
            <div style={{
                width: 180, height: 180, borderRadius: 24,
                background: 'linear-gradient(135deg, #1a3a2a 0%, #25d366 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 32,
                boxShadow: playing
                    ? '0 0 0 12px rgba(37,211,102,0.08), 0 0 0 24px rgba(37,211,102,0.04), 0 24px 60px rgba(0,0,0,0.6)'
                    : '0 24px 60px rgba(0,0,0,0.5)',
                transition: 'box-shadow 0.6s ease',
                animation: playing ? 'pulse-ring 2s ease-in-out infinite' : 'none',
            }}>
                <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" style={{ width: 72, height: 72 }}>
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
            </div>

            {/* TITLE */}
            <div style={{ textAlign: 'center', marginBottom: 40, padding: '0 32px' }}>
                <div style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 4, maxWidth: 280, wordBreak: 'break-word' }}>
                    {fileName.startsWith('voice-') ? 'Voice Message' : fileName}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Audio</div>
            </div>

            {/* WAVEFORM BARS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 60, marginBottom: 32, padding: '0 24px' }}>
                {barHeights.map((h, i) => {
                    const isPlayed = (i / barHeights.length) * 100 < progress;
                    return (
                        <div
                            key={i}
                            style={{
                                flex: 1,
                                height: `${Math.max(h * 52, 4)}px`,
                                borderRadius: 3,
                                background: isPlayed
                                    ? 'linear-gradient(to top, #25d366, #00e67a)'
                                    : 'rgba(255,255,255,0.18)',
                                transition: playing ? 'height 0.08s ease' : 'height 0.3s ease, background 0.2s',
                                minWidth: 3,
                            }}
                        />
                    );
                })}
            </div>

            {/* PROGRESS BAR */}
            <div style={{ width: '100%', maxWidth: 340, padding: '0 24px', marginBottom: 8 }}>
                <div
                    ref={progressRef}
                    onClick={seek}
                    style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer', position: 'relative' }}
                >
                    <div style={{ height: '100%', width: `${progress}%`, background: '#25d366', borderRadius: 4, position: 'relative', transition: 'width 0.1s linear' }}>
                        <div style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, borderRadius: '50%', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace' }}>
                    <span>{formatDuration(currentTime)}</span>
                    <span>{formatDuration(duration)}</span>
                </div>
            </div>

            {/* CONTROLS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 16 }}>
                {/* Skip -10 */}
                <button onClick={() => skipBy(-10)} style={ghostBtn}>
                    <svg viewBox="0 0 24 24" fill="white" style={{ width: 26, height: 26 }}>
                        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                    </svg>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', position: 'absolute', bottom: 2 }}>10</span>
                </button>

                {/* Play/Pause */}
                <button onClick={togglePlay} style={{
                    width: 68, height: 68, borderRadius: '50%',
                    background: '#25d366',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(37,211,102,0.4)',
                    transition: 'transform 0.1s ease, box-shadow 0.2s ease',
                }}>
                    {playing
                        ? <svg viewBox="0 0 24 24" fill="white" style={{ width: 28, height: 28 }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        : <svg viewBox="0 0 24 24" fill="white" style={{ width: 28, height: 28, marginLeft: 3 }}><path d="M8 5v14l11-7z" /></svg>
                    }
                </button>

                {/* Skip +10 */}
                <button onClick={() => skipBy(10)} style={ghostBtn}>
                    <svg viewBox="0 0 24 24" fill="white" style={{ width: 26, height: 26, transform: 'scaleX(-1)' }}>
                        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                    </svg>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', position: 'absolute', bottom: 2 }}>10</span>
                </button>
            </div>

            {/* Speed button */}
            <button onClick={cycleSpeed} style={{
                marginTop: 28,
                background: 'rgba(255,255,255,0.08)',
                border: '1.5px solid rgba(255,255,255,0.15)',
                borderRadius: 20, padding: '6px 18px',
                color: '#25d366', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', letterSpacing: 0.5,
            }}>
                {speed}x Speed
            </button>

            <style>{`
                @keyframes pulse-ring {
                    0%, 100% { box-shadow: 0 0 0 12px rgba(37,211,102,0.08), 0 0 0 24px rgba(37,211,102,0.04), 0 24px 60px rgba(0,0,0,0.6); }
                    50% { box-shadow: 0 0 0 18px rgba(37,211,102,0.12), 0 0 0 36px rgba(37,211,102,0.06), 0 24px 60px rgba(0,0,0,0.6); }
                }
            `}</style>
        </div>
    );
};

/* ─── Shared button style ─── */
const btnStyle = {
    background: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '50%',
    width: 42, height: 42,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
};

const ghostBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', padding: 8,
    opacity: 0.75,
};

export default FullscreenMediaModal;
