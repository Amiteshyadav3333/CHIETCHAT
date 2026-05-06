import React, { useState, useRef, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { PlayIcon as PlaySolid, PauseIcon as PauseSolid } from '@heroicons/react/24/solid';

const ReelReactor = ({ originalReel, onClose, onSuccess }) => {
    const { token } = useContext(AuthContext);
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [recordTime, setRecordTime] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [reactionChain, setReactionChain] = useState([]);
    const [loadingChain, setLoadingChain] = useState(true);

    const originalVideoRef = useRef(null);
    const userVideoRef = useRef(null);
    const canvasRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const chunksRef = useRef([]);
    const reactionVideoRefs = useRef([]);
    const originalAudioRef = useRef(null);
    const drawingRef = useRef(false);

    // Fetch the reaction chain for this reel
    useEffect(() => {
        fetchReactionChain();
        startCamera();
        return () => {
            stopAll();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const fetchReactionChain = async () => {
        try {
            const res = await axios.get(`/api/reels?filter=foryou`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Find all reactions to this reel
            const reactions = res.data.filter(r => r.parentReelId === originalReel.id);
            setReactionChain(reactions);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChain(false);
        }
    };

    const stopAll = () => {
        drawingRef.current = false;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
        }
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 720 },
                    height: { ideal: 1280 }
                },
                audio: true
            });
            streamRef.current = stream;
            if (userVideoRef.current) {
                userVideoRef.current.srcObject = stream;
            }
            setCameraReady(true);
        } catch (err) {
            alert("Camera access denied: " + err.message);
            onClose();
        }
    };

    // Assign srcObject after render
    useEffect(() => {
        if (userVideoRef.current && streamRef.current) {
            userVideoRef.current.srcObject = streamRef.current;
        }
    }, [cameraReady]);

    const toggleOriginalVideo = () => {
        if (!recording) return;
        if (originalVideoRef.current.paused) {
            originalVideoRef.current.play();
            if (originalAudioRef.current) originalAudioRef.current.play();
            setPaused(false);
        } else {
            originalVideoRef.current.pause();
            if (originalAudioRef.current) originalAudioRef.current.pause();
            setPaused(true);
        }
    };

    // Total video count = original + reactions + camera
    const totalVideos = 1 + reactionChain.length + 1;

    // Calculate grid layout based on total number of videos
    const getGridLayout = (count) => {
        if (count === 1) return { cols: 1, rows: 1 };
        if (count === 2) return { cols: 1, rows: 2 };
        if (count === 3) return { cols: 1, rows: 3 };
        if (count === 4) return { cols: 2, rows: 2 };
        if (count === 5) return { cols: 2, rows: 3 };
        if (count === 6) return { cols: 2, rows: 3 };
        return { cols: 3, rows: Math.ceil(count / 3) };
    };

    // Returns CSS grid positions; last item (camera) gets prominence
    const getGridStyle = (count) => {
        if (count === 1) {
            return 'grid-cols-1 grid-rows-1';
        }
        if (count === 2) {
            return 'grid-cols-1 grid-rows-2';
        }
        if (count === 3) {
            // top 2 side by side, bottom one full width
            return 'grid-cols-2 grid-rows-2';
        }
        if (count === 4) {
            return 'grid-cols-2 grid-rows-2';
        }
        if (count <= 6) {
            return 'grid-cols-2 grid-rows-3';
        }
        return 'grid-cols-3 grid-rows-3';
    };

    // Get specific grid item style (for spanning)
    const getItemStyle = (index, count) => {
        // Make the last item (camera) span if odd count in certain layouts
        if (count === 3 && index === count - 1) {
            return 'col-span-2'; // Camera takes full bottom row
        }
        if (count === 5 && index === count - 1) {
            return 'col-span-2'; // Camera takes full bottom row
        }
        return '';
    };

    const startRecording = async () => {
        if (!cameraReady) return;

        // Setup Audio Mixing
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;

        const destination = audioCtx.createMediaStreamDestination();

        // Original video audio (low volume)
        try {
            const originalSource = audioCtx.createMediaElementSource(originalVideoRef.current);
            const originalGain = audioCtx.createGain();
            originalGain.gain.value = 0.25;
            originalSource.connect(originalGain);
            originalGain.connect(destination);
            originalGain.connect(audioCtx.destination);
        } catch (e) { console.warn("Original audio source error:", e); }

        // Background Music (low volume)
        if (originalAudioRef.current) {
            try {
                const musicSource = audioCtx.createMediaElementSource(originalAudioRef.current);
                const musicGain = audioCtx.createGain();
                musicGain.gain.value = 0.25;
                musicSource.connect(musicGain);
                musicGain.connect(destination);
                musicGain.connect(audioCtx.destination);
            } catch (e) { console.warn("Music audio source error:", e); }
        }

        // Reaction chain audios (medium volume)
        reactionVideoRefs.current.forEach((ref, i) => {
            if (ref) {
                try {
                    const src = audioCtx.createMediaElementSource(ref);
                    const gain = audioCtx.createGain();
                    gain.gain.value = 0.15;
                    src.connect(gain);
                    gain.connect(destination);
                    gain.connect(audioCtx.destination);
                } catch (e) { console.warn("Reaction audio source error:", e); }
            }
        });

        // Mic (loudest)
        const micSource = audioCtx.createMediaStreamSource(streamRef.current);
        const micGain = audioCtx.createGain();
        micGain.gain.value = 1.0;
        micSource.connect(micGain);
        micGain.connect(destination);

        // Canvas for combined video
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = 720;
        canvas.height = 1280;

        const allVideos = [
            originalVideoRef.current,
            ...reactionVideoRefs.current.filter(Boolean),
            userVideoRef.current
        ].filter(Boolean);

        drawingRef.current = true;

        const draw = () => {
            if (!drawingRef.current) return;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const count = allVideos.length;

            if (count === 1) {
                drawVideoFit(ctx, allVideos[0], 0, 0, canvas.width, canvas.height);
            } else if (count === 2) {
                // Vertical split: top and bottom
                drawVideoFit(ctx, allVideos[0], 0, 0, canvas.width, canvas.height / 2);
                drawVideoFit(ctx, allVideos[1], 0, canvas.height / 2, canvas.width, canvas.height / 2);
            } else if (count === 3) {
                // Split vertically: top 50% for 2 videos, bottom 50% for camera
                // Top row (2 videos)
                drawVideoFit(ctx, allVideos[0], 0, 0, canvas.width / 2, canvas.height / 2);
                drawVideoFit(ctx, allVideos[1], canvas.width / 2, 0, canvas.width / 2, canvas.height / 2);
                // Bottom row (Camera)
                drawVideoFit(ctx, allVideos[2], 0, canvas.height / 2, canvas.width, canvas.height / 2);
            } else if (count === 4) {
                // 2x2 grid
                const hw = canvas.width / 2;
                const hh = canvas.height / 2;
                drawVideoFit(ctx, allVideos[0], 0, 0, hw, hh);
                drawVideoFit(ctx, allVideos[1], hw, 0, hw, hh);
                drawVideoFit(ctx, allVideos[2], 0, hh, hw, hh);
                drawVideoFit(ctx, allVideos[3], hw, hh, hw, hh);
            } else {
                // 5+: Top portion: old videos in a grid, bottom half: camera (latest)
                const oldVideos = allVideos.slice(0, count - 1);
                const cameraVid = allVideos[count - 1];
                const topH = canvas.height * 0.5;
                const botH = canvas.height * 0.5;
                const cols = Math.ceil(Math.sqrt(oldVideos.length));
                const rows = Math.ceil(oldVideos.length / cols);
                const cellW = canvas.width / cols;
                const cellH = topH / rows;
                oldVideos.forEach((v, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    drawVideoFit(ctx, v, col * cellW, row * cellH, cellW, cellH);
                });
                // Camera at bottom, full width, bigger
                drawVideoFit(ctx, cameraVid, 0, topH, canvas.width, botH);
            }

            // Draw grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 2;
            if (count === 2) {
                ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
            } else if (count === 3) {
                ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height / 2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
            } else if (count === 4) {
                ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
            }

            requestAnimationFrame(draw);
        };

        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/mp4';
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            drawingRef.current = false;
            const blob = new Blob(chunksRef.current, { type: mimeType });
            uploadReaction(blob);
        };

        recorder.start();
        originalVideoRef.current.currentTime = 0;
        originalVideoRef.current.play().catch(() => {});
        if (originalAudioRef.current) {
            originalAudioRef.current.currentTime = 0;
            originalAudioRef.current.play().catch(() => {});
        }
        reactionVideoRefs.current.forEach(ref => {
            if (ref) {
                ref.currentTime = 0;
                ref.play().catch(() => {});
            }
        });

        recorder.start();
        setRecording(true);
        setPaused(false);
        setRecordTime(0);
        draw();

        timerRef.current = setInterval(() => {
            setRecordTime(prev => {
                if (prev >= 60) {
                    stopRecording();
                    return prev;
                }
                return prev + 1;
            });
        }, 1000);
    };

    const drawVideoFit = (ctx, video, x, y, w, h) => {
        if (!video || !video.videoWidth) return;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.max(w / vw, h / vh);
        const sw = vw * scale;
        const sh = vh * scale;
        const sx = x + (w - sw) / 2;
        const sy = y + (h - sh) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(video, sx, sy, sw, sh);
        ctx.restore();
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && recording) {
            mediaRecorderRef.current.stop();
            originalVideoRef.current.pause();
            if (originalAudioRef.current) originalAudioRef.current.pause();
            reactionVideoRefs.current.forEach(ref => {
                if (ref) ref.pause();
            });
            setRecording(false);
            drawingRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const uploadReaction = async (blob) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('video', blob, 'reaction.webm');
        formData.append('caption', `Reacting to @${originalReel.user.username}`);
        formData.append('parentReelId', originalReel.id);

        try {
            await axios.post('/api/reels', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });
            onSuccess();
        } catch (err) {
            alert("Upload failed: " + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
        }
    };

    // Build the list of all video sources for the visual grid
    const allVideoSources = [
        { type: 'original', url: originalReel.videoUrl, label: `@${originalReel.user.username}` },
        ...reactionChain.map((r, i) => ({
            type: 'reaction',
            url: r.videoUrl,
            label: `@${r.user?.username || 'user'}`
        })),
        { type: 'camera', label: 'You' }
    ];

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            {/* Header */}
            <div className="p-3 flex items-center justify-between border-b border-white/10 bg-black/80 backdrop-blur-sm z-10">
                <button onClick={onClose} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                <div className="text-center">
                    <h2 className="text-white font-bold text-sm">React to Reel</h2>
                    {reactionChain.length > 0 && (
                        <p className="text-gray-400 text-[10px]">{reactionChain.length} reaction{reactionChain.length > 1 ? 's' : ''} before you</p>
                    )}
                </div>
                <div className="w-10"></div>
            </div>

            {/* Video Grid Area */}
            <div className="flex-1 relative bg-black overflow-hidden">
                <div className={`w-full h-full grid ${getGridStyle(allVideoSources.length)} gap-[2px]`}>
                    {allVideoSources.map((source, index) => (
                        <div
                            key={index}
                            className={`relative bg-gray-900 overflow-hidden ${getItemStyle(index, allVideoSources.length)} ${source.type === 'camera' ? 'ring-2 ring-red-500/50' : ''}`}
                            onClick={source.type === 'original' ? toggleOriginalVideo : undefined}
                        >
                            {source.type === 'camera' ? (
                                <video
                                    ref={userVideoRef}
                                    className="w-full h-full object-cover"
                                    autoPlay
                                    muted
                                    playsInline
                                />
                            ) : source.type === 'original' ? (
                                <video
                                    ref={originalVideoRef}
                                    src={source.url}
                                    className="w-full h-full object-cover"
                                    muted
                                    crossOrigin="anonymous"
                                    playsInline
                                    loop
                                />
                            ) : (
                                <video
                                    ref={el => { reactionVideoRefs.current[index - 1] = el; }}
                                    src={source.url}
                                    className="w-full h-full object-cover"
                                    muted
                                    crossOrigin="anonymous"
                                    playsInline
                                    loop
                                />
                            )}

                            {source.type === 'original' && originalReel.musicUrl && (
                                <audio 
                                    ref={originalAudioRef}
                                    src={originalReel.musicUrl}
                                    crossOrigin="anonymous"
                                    loop
                                    className="hidden"
                                />
                            )}

                            {/* Label */}
                            <div className={`absolute top-1 left-1 px-2 py-0.5 rounded text-[9px] font-bold ${
                                source.type === 'camera' ? 'bg-red-600 text-white' :
                                source.type === 'original' ? 'bg-blue-600/80 text-white' :
                                'bg-purple-600/80 text-white'
                            }`}>
                                {source.type === 'camera' ? '🔴 You' : source.label}
                            </div>

                            {/* Pause indicator for original */}
                            {source.type === 'original' && recording && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className={`transition-opacity ${paused ? 'opacity-70' : 'opacity-0'}`}>
                                        <PlaySolid className="w-10 h-10 text-white drop-shadow-lg" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Hidden Canvas for video mixing */}
                <canvas ref={canvasRef} width="720" height="1280" className="hidden" />

                {/* Recording Controls - overlaid at bottom */}
                <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-3 z-50">
                    {recording && (
                        <div className="bg-black/70 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex flex-col items-center">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                <p className="text-white font-mono text-lg">{recordTime}s / 60s</p>
                            </div>
                            <p className="text-blue-400 text-[10px] font-bold uppercase mt-1">
                                Tap original video to {paused ? 'play' : 'pause'}
                            </p>
                        </div>
                    )}
                    <button
                        onClick={recording ? stopRecording : startRecording}
                        disabled={uploading || !cameraReady}
                        className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1.5 transition-all ${uploading || !cameraReady ? 'opacity-50' : 'shadow-lg shadow-red-500/30'}`}
                    >
                        <div className={`w-full h-full rounded-full transition-all ${recording ? 'bg-red-600 scale-[0.6] rounded-lg' : 'bg-red-500'}`} />
                    </button>
                    <p className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full">
                        {!cameraReady ? 'Starting camera...' : recording ? (paused ? 'Recording (Video Paused)' : 'Recording...') : 'Tap to Start Reaction'}
                    </p>
                </div>

                {/* Loading indicator */}
                {loadingChain && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[60]">
                        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                )}

                {uploading && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-[60]">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-white font-bold">Uploading Reaction...</p>
                        <p className="text-gray-400 text-xs mt-1">This may take a moment</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReelReactor;
