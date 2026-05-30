import React, { useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import {
    BackwardIcon,
    FilmIcon,
    ForwardIcon,
    MagnifyingGlassIcon,
    MicrophoneIcon,
    MusicalNoteIcon,
    PauseIcon,
    PlayIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon,
    StopIcon,
    TrashIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';

const MAX_SECONDS = 60;
const GENERATED_MEME_TEMPLATES = [
    { id: 'bruh', title: 'Bruh Pause', text: 'BRUH', bg: '#111827', fg: '#f9fafb', accent: '#ef4444', duration: 1.4 },
    { id: 'wait', title: 'Wait What', text: 'WAIT... WHAT?', bg: '#0f172a', fg: '#e0f2fe', accent: '#38bdf8', duration: 1.6 },
    { id: 'plot', title: 'Plot Twist', text: 'PLOT TWIST', bg: '#1f2937', fg: '#fde68a', accent: '#f59e0b', duration: 1.8 },
    { id: 'nope', title: 'Nope Cut', text: 'NOPE', bg: '#18181b', fg: '#fecaca', accent: '#dc2626', duration: 1.2 },
    { id: 'caught', title: 'Caught Moment', text: 'CAUGHT', bg: '#020617', fg: '#bbf7d0', accent: '#22c55e', duration: 1.5 },
    { id: 'sus', title: 'Suspicious Zoom', text: 'SUS?', bg: '#2e1065', fg: '#f5d0fe', accent: '#c084fc', duration: 1.7 }
];

const formatTime = (seconds) => {
    const safeSeconds = Math.max(seconds || 0, 0);
    const mins = Math.floor(safeSeconds / 60);
    const secs = Math.floor(safeSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const ReelReactor = ({ originalReel, onClose, onSuccess }) => {
    const { token } = useContext(AuthContext);
    const originalVideoRef = useRef(null);
    const userVideoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const chunksRef = useRef([]);
    const frameRef = useRef(null);
    const timerRef = useRef(null);
    const recordedVideoRef = useRef(null);
    const memeInputRef = useRef(null);

    const [cameraReady, setCameraReady] = useState(false);
    const [recording, setRecording] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [recordTime, setRecordTime] = useState(0);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [recordedUrl, setRecordedUrl] = useState('');
    const [recordedDuration, setRecordedDuration] = useState(0);
    const [editTime, setEditTime] = useState(0);
    const [uploading, setUploading] = useState(false);

    const [sourcePaused, setSourcePaused] = useState(true);
    const [sourceTime, setSourceTime] = useState(0);
    const [sourceDuration, setSourceDuration] = useState(0);
    const [sourceAudioOn, setSourceAudioOn] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const [sourceVolume, setSourceVolume] = useState(0.35);
    const [micVolume, setMicVolume] = useState(1);
    const [musicVolume, setMusicVolume] = useState(0.65);

    const [memeClips, setMemeClips] = useState([]);
    const [selectedMemeId, setSelectedMemeId] = useState(null);
    const [libraryClips, setLibraryClips] = useState([]);
    const [generatingMemeId, setGeneratingMemeId] = useState(null);
    const [songQuery, setSongQuery] = useState('');
    const [songResults, setSongResults] = useState([]);
    const [searchingSongs, setSearchingSongs] = useState(false);
    const [songSearchOpen, setSongSearchOpen] = useState(false);
    const [selectedSong, setSelectedSong] = useState(null);
    const [playingSongId, setPlayingSongId] = useState(null);
    const previewAudioRef = useRef(null);

    useEffect(() => {
        startCamera();
        fetchMemeLibrary();
        return () => stopEverything();
    }, []);

    useEffect(() => {
        return () => {
            if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        };
    }, [recordedUrl]);

    useEffect(() => {
        return () => {
            memeClips.forEach(clip => {
                if (!clip.external) URL.revokeObjectURL(clip.url);
            });
        };
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 540 },
                    height: { ideal: 960 },
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            streamRef.current = stream;
            if (userVideoRef.current) userVideoRef.current.srcObject = stream;
            setCameraReady(true);
        } catch (err) {
            alert(`Camera or microphone access failed: ${err.message}`);
            onClose();
        }
    };

    useEffect(() => {
        if (userVideoRef.current && streamRef.current) {
            userVideoRef.current.srcObject = streamRef.current;
        }
    }, [cameraReady]);

    const stopEverything = () => {
        cancelAnimationFrame(frameRef.current);
        clearInterval(timerRef.current);
        stopSongPreview();
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
        }
    };

    const stopSongPreview = () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPlayingSongId(null);
    };

    const fetchMemeLibrary = async () => {
        try {
            const res = await fetch('/meme-clips/manifest.json', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            setLibraryClips(Array.isArray(data.clips) ? data.clips : []);
        } catch {
            setLibraryClips([]);
        }
    };

    const drawVideoCover = (ctx, video, x, y, w, h, mirror = false) => {
        if (!video || !video.videoWidth || !video.videoHeight) return;
        const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
        const sw = video.videoWidth * scale;
        const sh = video.videoHeight * scale;
        const sx = x + (w - sw) / 2;
        const sy = y + (h - sh) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        if (mirror) {
            ctx.translate(x + w, y);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, sy - y, sw, sh);
        } else {
            ctx.drawImage(video, sx, sy, sw, sh);
        }
        ctx.restore();
    };

    const drawReactionFrame = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        const w = canvas.width;
        const h = canvas.height;
        const half = h / 2;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, w, h);
        drawVideoCover(ctx, originalVideoRef.current, 0, 0, w, half);
        drawVideoCover(ctx, userVideoRef.current, 0, half, w, half, true);

        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, half);
        ctx.lineTo(w, half);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0,0,0,0.52)';
        ctx.fillRect(0, 0, w, 42);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillText(`@${originalReel.user.username}`, 22, 29);
        ctx.fillText('You', 22, half + 31);

        frameRef.current = requestAnimationFrame(drawReactionFrame);
    };

    const connectElementAudio = (audioCtx, destination, element, volume) => {
        if (!element) return;
        try {
            const source = audioCtx.createMediaElementSource(element);
            const gain = audioCtx.createGain();
            gain.gain.value = volume;
            source.connect(gain);
            gain.connect(destination);
        } catch (err) {
            console.warn('Audio source skipped:', err);
        }
    };

    const startRecording = async () => {
        if (!cameraReady || recording || initializing) return;
        setInitializing(true);
        setRecordedBlob(null);
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl('');
        setEditTime(0);

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            audioContextRef.current = audioCtx;
            const destination = audioCtx.createMediaStreamDestination();

            connectElementAudio(audioCtx, destination, originalVideoRef.current, sourceAudioOn ? sourceVolume : 0);

            if (selectedSong?.previewUrl) {
                const music = new Audio(selectedSong.previewUrl);
                music.crossOrigin = 'anonymous';
                music.loop = true;
                previewAudioRef.current = music;
                connectElementAudio(audioCtx, destination, music, musicVolume);
                music.currentTime = 0;
                music.play().catch(() => {});
            }

            if (streamRef.current) {
                const micSource = audioCtx.createMediaStreamSource(streamRef.current);
                const micGain = audioCtx.createGain();
                micGain.gain.value = micOn ? micVolume : 0;
                micSource.connect(micGain);
                micGain.connect(destination);
            }

            const canvas = canvasRef.current;
            canvas.width = 720;
            canvas.height = 1280;
            const canvasStream = canvas.captureStream(30);
            const stream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...destination.stream.getAudioTracks()
            ]);

            let mimeType = 'video/webm;codecs=vp9,opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8,opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                cancelAnimationFrame(frameRef.current);
                clearInterval(timerRef.current);
                stopSongPreview();
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setRecordedBlob(blob);
                setRecordedUrl(url);
            };

            originalVideoRef.current.currentTime = sourceTime || 0;
            if (!sourcePaused) originalVideoRef.current.play().catch(() => {});

            drawReactionFrame();
            recorder.start(1000);
            setRecording(true);
            setRecordTime(0);
            timerRef.current = setInterval(() => {
                setRecordTime(prev => {
                    if (prev + 1 >= MAX_SECONDS) {
                        stopRecording();
                        return MAX_SECONDS;
                    }
                    return prev + 1;
                });
            }, 1000);
        } catch (err) {
            console.error(err);
            alert(`Could not start reaction recording: ${err.message}`);
        } finally {
            setInitializing(false);
        }
    };

    const stopRecording = () => {
        if (!recording || !mediaRecorderRef.current) return;
        mediaRecorderRef.current.stop();
        originalVideoRef.current.pause();
        setRecording(false);
    };

    const toggleSourcePlayback = () => {
        const video = originalVideoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play().catch(() => {});
            setSourcePaused(false);
        } else {
            video.pause();
            setSourcePaused(true);
        }
    };

    const seekSource = (value) => {
        const nextTime = Number(value);
        setSourceTime(nextTime);
        if (originalVideoRef.current) originalVideoRef.current.currentTime = nextTime;
    };

    const nudgeSource = (seconds) => {
        const video = originalVideoRef.current;
        if (!video) return;
        const nextTime = Math.min(Math.max((video.currentTime || 0) + seconds, 0), sourceDuration || video.duration || 0);
        seekSource(nextTime);
    };

    const searchSongs = async (e) => {
        e?.preventDefault();
        if (songQuery.trim().length < 2) return;
        setSearchingSongs(true);
        try {
            const res = await axios.get('/api/music/search', {
                params: { q: songQuery.trim() },
                headers: { Authorization: `Bearer ${token}` }
            });
            setSongResults(res.data.tracks || []);
        } catch {
            setSongResults([]);
        } finally {
            setSearchingSongs(false);
        }
    };

    const toggleSongPreview = (song) => {
        if (playingSongId === song.id) {
            stopSongPreview();
            return;
        }
        stopSongPreview();
        const audio = new Audio(song.previewUrl);
        audio.volume = musicVolume;
        previewAudioRef.current = audio;
        audio.play().then(() => setPlayingSongId(song.id)).catch(() => {});
    };

    const selectSong = (song) => {
        stopSongPreview();
        setSelectedSong(song);
        setSongSearchOpen(false);
    };

    const uploadReaction = async () => {
        if (!recordedBlob) return;
        setUploading(true);

        const finalBlob = memeClips.length ? await renderMemeClips(recordedBlob, memeClips) : recordedBlob;
        const formData = new FormData();
        formData.append('video', finalBlob, 'reaction.webm');
        formData.append('caption', `Reacting to @${originalReel.user.username}`);
        formData.append('parentReelId', originalReel.id);
        if (selectedSong?.previewUrl) {
            formData.append('musicUrl', selectedSong.previewUrl);
            formData.append('musicName', `${selectedSong.title} - ${selectedSong.artist}`);
            formData.append('musicVolume', musicVolume);
        }

        try {
            await axios.post('/api/reels', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });
            onSuccess();
        } catch (err) {
            alert(`Upload failed: ${err.response?.data?.error || err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleMemeFiles = (files) => {
        const fileList = Array.from(files || []).filter(file => file.type.startsWith('video/'));
        if (!fileList.length) return;

        setMemeClips(prev => [
            ...prev,
            ...fileList.map(file => {
                const id = `${Date.now()}-${Math.random()}`;
                return {
                    id,
                    name: file.name.replace(/\.[^.]+$/, ''),
                    file,
                    url: URL.createObjectURL(file),
                    startAt: Number(editTime.toFixed(2)),
                    duration: 2,
                    x: 0.5,
                    y: 0.72,
                    width: 0.72
                };
            })
        ]);
    };

    const addMemeClipFromUrl = (clip) => {
        const id = `${Date.now()}-${Math.random()}`;
        setMemeClips(prev => [
            ...prev,
            {
                id,
                name: clip.title || 'Meme clip',
                url: clip.url,
                startAt: Number(editTime.toFixed(2)),
                duration: clip.duration || 2,
                x: 0.5,
                y: 0.72,
                width: 0.72,
                external: true
            }
        ]);
        setSelectedMemeId(id);
    };

    const createGeneratedMemeClip = async (template) => {
        setGeneratingMemeId(template.id);
        try {
            const blob = await renderGeneratedMemeClip(template);
            const id = `${Date.now()}-${Math.random()}`;
            setMemeClips(prev => [
                ...prev,
                {
                    id,
                    name: template.title,
                    url: URL.createObjectURL(blob),
                    startAt: Number(editTime.toFixed(2)),
                    duration: template.duration,
                    x: 0.5,
                    y: 0.72,
                    width: 0.72
                }
            ]);
            setSelectedMemeId(id);
        } finally {
            setGeneratingMemeId(null);
        }
    };

    const renderGeneratedMemeClip = (template) => new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 405;
        const ctx = canvas.getContext('2d', { alpha: false });
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];
        const start = performance.now();
        const durationMs = template.duration * 1000;

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        recorder.onerror = () => reject(new Error('Could not generate meme clip'));

        const draw = (now) => {
            const progress = Math.min((now - start) / durationMs, 1);
            const pulse = 1 + Math.sin(progress * Math.PI * 8) * 0.035;
            const slide = Math.sin(progress * Math.PI) * 26;

            ctx.fillStyle = template.bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = template.accent;
            ctx.globalAlpha = 0.22;
            ctx.beginPath();
            ctx.arc(120 + progress * 520, 90, 150 + progress * 80, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(600 - progress * 460, 330, 120, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2 + slide);
            ctx.scale(pulse, pulse);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 22;
            ctx.fillStyle = template.fg;
            ctx.font = '900 78px system-ui, sans-serif';
            ctx.fillText(template.text, 0, 0);
            ctx.restore();

            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '700 20px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('CHEETCHAT MEME CLIP', canvas.width / 2, canvas.height - 32);

            if (progress < 1) {
                requestAnimationFrame(draw);
            } else {
                recorder.stop();
            }
        };

        recorder.start();
        requestAnimationFrame(draw);
    });

    const updateMemeClip = (id, updates) => {
        setMemeClips(prev => prev.map(clip => clip.id === id ? { ...clip, ...updates } : clip));
    };

    const placeSelectedMemeAtTime = () => {
        if (!selectedMemeId) return;
        updateMemeClip(selectedMemeId, { startAt: Number(editTime.toFixed(2)) });
    };

    const removeMemeClip = (id) => {
        setMemeClips(prev => {
            const clip = prev.find(item => item.id === id);
            if (clip && !clip.external) URL.revokeObjectURL(clip.url);
            return prev.filter(item => item.id !== id);
        });
        if (selectedMemeId === id) setSelectedMemeId(null);
    };

    const activePreviewClips = memeClips.filter(clip => editTime >= clip.startAt && editTime <= clip.startAt + clip.duration);
    const selectedMeme = memeClips.find(clip => clip.id === selectedMemeId) || null;

    const renderMemeClips = (blob, clips) => new Promise((resolve) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(blob);
        video.src = url;
        video.muted = false;
        video.playsInline = true;
        video.preload = 'auto';

        video.onloadedmetadata = async () => {
            const clipVideos = await Promise.all(clips.map(clip => new Promise(resolveClip => {
                const clipVideo = document.createElement('video');
                clipVideo.src = clip.url;
                clipVideo.playsInline = true;
                clipVideo.preload = 'auto';
                clipVideo.crossOrigin = 'anonymous';
                clipVideo.onloadedmetadata = () => resolveClip({ ...clip, video: clipVideo, active: false });
                clipVideo.onerror = () => resolveClip(null);
            })));
            const readyClips = clipVideos.filter(Boolean);
            const canvas = document.createElement('canvas');
            canvas.width = 720;
            canvas.height = 1280;
            const ctx = canvas.getContext('2d', { alpha: false });
            const canvasStream = canvas.captureStream(30);
            let audioTracks = [];
            let audioCtx = null;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') await audioCtx.resume();
                const destination = audioCtx.createMediaStreamDestination();
                const source = audioCtx.createMediaElementSource(video);
                source.connect(destination);
                readyClips.forEach(clip => {
                    try {
                        const clipSource = audioCtx.createMediaElementSource(clip.video);
                        const gain = audioCtx.createGain();
                        gain.gain.value = 0.9;
                        clipSource.connect(gain);
                        gain.connect(destination);
                    } catch (err) {
                        console.warn('Meme clip audio skipped:', err);
                    }
                });
                audioTracks = destination.stream.getAudioTracks();
            } catch (err) {
                console.warn('Meme audio mix skipped:', err);
            }
            const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            const chunks = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };
            recorder.onstop = () => {
                URL.revokeObjectURL(url);
                readyClips.forEach(clip => clip.video.pause());
                if (audioCtx) audioCtx.close().catch(() => {});
                resolve(new Blob(chunks, { type: 'video/webm' }));
            };
            const drawClip = (clip) => {
                const overlayW = canvas.width * clip.width;
                const overlayH = overlayW * (9 / 16);
                const x = (clip.x * canvas.width) - overlayW / 2;
                const y = (clip.y * canvas.height) - overlayH / 2;

                ctx.save();
                ctx.fillStyle = '#000';
                ctx.fillRect(x - 4, y - 4, overlayW + 8, overlayH + 8);
                drawVideoCover(ctx, clip.video, x, y, overlayW, overlayH);
                ctx.strokeStyle = 'rgba(255,255,255,0.65)';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, overlayW, overlayH);
                ctx.restore();
            };
            const draw = () => {
                if (video.ended || video.paused) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const current = video.currentTime || 0;
                readyClips.forEach(clip => {
                    const isActive = current >= clip.startAt && current <= clip.startAt + clip.duration;
                    if (isActive && !clip.active) {
                        clip.active = true;
                        clip.video.currentTime = 0;
                        clip.video.play().catch(() => {});
                    }
                    if (!isActive && clip.active) {
                        clip.active = false;
                        clip.video.pause();
                    }
                    if (isActive) drawClip(clip);
                });
                requestAnimationFrame(draw);
            };
            recorder.start();
            video.play().then(() => {
                draw();
            }).catch(() => resolve(blob));
            video.onended = () => recorder.stop();
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(blob);
        };
    });

    return (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
            <div className="flex items-center justify-between border-b border-white/10 bg-black/90 p-3">
                <button onClick={onClose} className="rounded-full p-2 text-white hover:bg-white/10">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <div className="text-center">
                    <h2 className="text-sm font-bold">Reaction Studio</h2>
                    <p className="text-[10px] text-gray-400">Smooth duet recording</p>
                </div>
                <button
                    onClick={recordedBlob ? uploadReaction : undefined}
                    disabled={!recordedBlob || uploading}
                    className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
                >
                    {uploading ? 'Posting...' : 'Post'}
                </button>
            </div>

            <div className="grid min-h-0 flex-1 bg-[#070707] lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="relative min-h-0 overflow-hidden">
                    {!recordedUrl ? (
                        <div className="grid h-full grid-rows-2 gap-[2px]">
                            <div className="relative bg-zinc-950">
                                <video
                                    ref={originalVideoRef}
                                    src={originalReel.videoUrl}
                                    className="h-full w-full object-cover"
                                    muted
                                    crossOrigin="anonymous"
                                    playsInline
                                    loop
                                    preload="auto"
                                    onLoadedMetadata={(e) => setSourceDuration(e.currentTarget.duration || 0)}
                                    onTimeUpdate={(e) => setSourceTime(e.currentTarget.currentTime || 0)}
                                />
                                <span className="absolute left-3 top-3 rounded bg-blue-600/90 px-2 py-1 text-xs font-bold">
                                    @{originalReel.user.username}
                                </span>
                                {sourcePaused && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <PlayIcon className="h-16 w-16 drop-shadow-lg" />
                                    </div>
                                )}
                            </div>
                            <div className="relative bg-zinc-950">
                                <video
                                    ref={userVideoRef}
                                    className="h-full w-full scale-x-[-1] object-cover"
                                    autoPlay
                                    muted
                                    playsInline
                                />
                                <span className="absolute left-3 top-3 rounded bg-red-600/90 px-2 py-1 text-xs font-bold">
                                    You
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="relative flex h-full items-center justify-center bg-black">
                            <video
                                ref={recordedVideoRef}
                                src={recordedUrl}
                                className="h-full w-full object-contain"
                                controls
                                playsInline
                                onLoadedMetadata={(e) => setRecordedDuration(e.currentTarget.duration || 0)}
                                onTimeUpdate={(e) => setEditTime(e.currentTarget.currentTime || 0)}
                                onSeeked={(e) => setEditTime(e.currentTarget.currentTime || 0)}
                            />
                            {activePreviewClips.map(clip => (
                                <div
                                    key={clip.id}
                                    className="pointer-events-none absolute overflow-hidden rounded-lg border-2 border-white/70 bg-black shadow-2xl"
                                    style={{
                                        left: `${clip.x * 100}%`,
                                        top: `${clip.y * 100}%`,
                                        width: `${clip.width * 100}%`,
                                        aspectRatio: '16 / 9',
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                >
                                    <video src={clip.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
                                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold">
                                        {clip.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <canvas ref={canvasRef} width="720" height="1280" className="hidden" />

                    {!recordedUrl && (
                        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
                            {recording && (
                                <div className="rounded-full bg-black/70 px-4 py-2 font-mono text-sm">
                                    <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                                    {recordTime}s / {MAX_SECONDS}s
                                </div>
                            )}
                            <button
                                onClick={recording ? stopRecording : startRecording}
                                disabled={!cameraReady || initializing}
                                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-black/30 p-2 disabled:opacity-50"
                            >
                                <div className={`h-full w-full bg-red-500 ${recording ? 'scale-[0.6] rounded-lg' : 'rounded-full'} ${initializing ? 'animate-pulse' : ''}`} />
                            </button>
                            <p className="rounded-full bg-black/60 px-3 py-1 text-xs">
                                {!cameraReady ? 'Starting camera...' : recording ? 'Recording reaction...' : 'Tap to record'}
                            </p>
                        </div>
                    )}

                    {uploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75">
                            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                            <p className="font-bold">Uploading reaction...</p>
                        </div>
                    )}
                </div>

                <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#101114]">
                    <div className="space-y-5 overflow-y-auto p-4">
                        <section>
                            <h3 className="mb-3 text-xs font-bold uppercase text-gray-400">Source Video</h3>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => nudgeSource(-2)} className="rounded-lg bg-white/10 p-3 hover:bg-white/15">
                                    <BackwardIcon className="mx-auto h-5 w-5" />
                                </button>
                                <button onClick={toggleSourcePlayback} className="rounded-lg bg-white p-3 text-black">
                                    {sourcePaused ? <PlayIcon className="mx-auto h-5 w-5" /> : <PauseIcon className="mx-auto h-5 w-5" />}
                                </button>
                                <button onClick={() => nudgeSource(2)} className="rounded-lg bg-white/10 p-3 hover:bg-white/15">
                                    <ForwardIcon className="mx-auto h-5 w-5" />
                                </button>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max={sourceDuration || 0}
                                step="0.1"
                                value={sourceTime}
                                onChange={(e) => seekSource(e.target.value)}
                                disabled={recording}
                                className="mt-3 w-full"
                            />
                        </section>

                        <section>
                            <h3 className="mb-3 text-xs font-bold uppercase text-gray-400">Audio Mix</h3>
                            <div className="space-y-3">
                                <button
                                    onClick={() => setSourceAudioOn(prev => !prev)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${sourceAudioOn ? 'bg-white/10' : 'bg-red-500/20 text-red-200'}`}
                                >
                                    Source song/audio
                                    {sourceAudioOn ? <SpeakerWaveIcon className="h-5 w-5" /> : <SpeakerXMarkIcon className="h-5 w-5" />}
                                </button>
                                <label className="block text-xs text-gray-400">
                                    Source volume
                                    <input type="range" min="0" max="1" step="0.05" value={sourceVolume} onChange={(e) => setSourceVolume(Number(e.target.value))} className="mt-2 w-full" />
                                </label>
                                <button
                                    onClick={() => setMicOn(prev => !prev)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${micOn ? 'bg-white/10' : 'bg-red-500/20 text-red-200'}`}
                                >
                                    Your voice
                                    <MicrophoneIcon className="h-5 w-5" />
                                </button>
                                <label className="block text-xs text-gray-400">
                                    Voice volume
                                    <input type="range" min="0" max="1.5" step="0.05" value={micVolume} onChange={(e) => setMicVolume(Number(e.target.value))} className="mt-2 w-full" />
                                </label>
                            </div>
                        </section>

                        <section>
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase text-gray-400">Reaction Music</h3>
                                {selectedSong && (
                                    <button onClick={() => setSelectedSong(null)} className="text-xs text-red-300">Remove</button>
                                )}
                            </div>
                            <button
                                onClick={() => setSongSearchOpen(true)}
                                className="flex w-full items-center gap-2 rounded-lg bg-purple-600 px-3 py-3 text-sm font-bold"
                            >
                                <MusicalNoteIcon className="h-5 w-5" />
                                <span className="truncate">{selectedSong ? `${selectedSong.title} - ${selectedSong.artist}` : 'Add song'}</span>
                            </button>
                            <label className="mt-3 block text-xs text-gray-400">
                                Song base volume
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={musicVolume}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setMusicVolume(value);
                                        if (previewAudioRef.current) previewAudioRef.current.volume = value;
                                    }}
                                    className="mt-2 w-full"
                                />
                            </label>
                            {recordedBlob && (
                                <p className="mt-2 text-[11px] leading-5 text-gray-500">
                                    Song selected after recording will be attached to the reel playback.
                                </p>
                            )}
                        </section>

                        <section>
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase text-gray-400">Meme Clips</h3>
                                <button
                                    onClick={() => memeInputRef.current?.click()}
                                    className="text-xs font-bold text-purple-300"
                                >
                                    Add clip
                                </button>
                            </div>
                            <input
                                ref={memeInputRef}
                                type="file"
                                accept="video/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    handleMemeFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />

                            <div className="space-y-3">
                                {!recordedBlob ? (
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-5 text-gray-400">
                                        Add meme clips now or after recording. Before recording they will be placed at 0:00; after recording you can paste them at any timestamp.
                                    </div>
                                ) : (
                                    <div className="rounded-lg bg-white/5 p-3">
                                        <div className="mb-2 flex items-center justify-between text-xs">
                                            <span className="font-bold text-white">Preview timestamp</span>
                                            <span className="font-mono text-purple-200">{formatTime(editTime)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max={recordedDuration || 0}
                                            step="0.05"
                                            value={editTime}
                                            onChange={(e) => {
                                                const next = Number(e.target.value);
                                                setEditTime(next);
                                                if (recordedVideoRef.current) recordedVideoRef.current.currentTime = next;
                                            }}
                                            className="w-full"
                                        />
                                    </div>
                                )}

                                <button
                                    onClick={() => memeInputRef.current?.click()}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-purple-400/50 bg-purple-500/10 px-3 py-3 text-sm font-bold text-purple-100"
                                >
                                    <FilmIcon className="h-5 w-5" />
                                    Upload comedy/meme video clip
                                </button>

                                <div>
                                    <p className="mb-2 text-xs font-bold uppercase text-gray-400">Quick Meme Pack</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {GENERATED_MEME_TEMPLATES.map(template => (
                                            <button
                                                key={template.id}
                                                onClick={() => createGeneratedMemeClip(template)}
                                                disabled={generatingMemeId === template.id}
                                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"
                                            >
                                                <span className="block truncate">{generatingMemeId === template.id ? 'Adding...' : template.title}</span>
                                                <span className="mt-1 block text-[10px] font-medium text-gray-400">{template.duration.toFixed(1)}s generated</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {libraryClips.length > 0 && (
                                    <div>
                                        <p className="mb-2 text-xs font-bold uppercase text-gray-400">Local Clip Library</p>
                                        <div className="space-y-2">
                                            {libraryClips.map(clip => (
                                                <button
                                                    key={clip.url}
                                                    onClick={() => addMemeClipFromUrl(clip)}
                                                    className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10"
                                                >
                                                    {clip.thumb ? (
                                                        <img src={clip.thumb} className="h-10 w-16 rounded object-cover" alt="" />
                                                    ) : (
                                                        <div className="flex h-10 w-16 items-center justify-center rounded bg-purple-500/20">
                                                            <FilmIcon className="h-5 w-5 text-purple-200" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-bold text-white">{clip.title}</p>
                                                        <p className="text-[11px] text-gray-400">{(clip.duration || 2).toFixed(1)}s clip</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {memeClips.length > 0 && (
                                    <div className="space-y-2">
                                        {memeClips.map(clip => (
                                            <div
                                                key={clip.id}
                                                onClick={() => setSelectedMemeId(clip.id)}
                                                role="button"
                                                tabIndex={0}
                                                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-2 text-left ${selectedMemeId === clip.id ? 'border-purple-400 bg-purple-500/15' : 'border-white/10 bg-white/5'}`}
                                            >
                                                <video src={clip.url} className="h-12 w-20 rounded object-cover" muted playsInline />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-xs font-bold text-white">{clip.name}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        at {formatTime(clip.startAt)} for {clip.duration.toFixed(1)}s
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeMemeClip(clip.id);
                                                    }}
                                                    className="rounded p-1 text-red-300 hover:bg-red-500/10"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {selectedMeme && (
                                    <div className="space-y-3 rounded-lg border border-purple-400/30 bg-purple-500/10 p-3">
                                        {recordedBlob && (
                                            <button
                                                onClick={placeSelectedMemeAtTime}
                                                className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-bold"
                                            >
                                                Paste selected clip at {formatTime(editTime)}
                                            </button>
                                        )}
                                        <label className="block text-xs text-gray-300">
                                            Clip duration
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="3"
                                                step="0.1"
                                                value={selectedMeme.duration}
                                                onChange={(e) => updateMemeClip(selectedMeme.id, { duration: Number(e.target.value) })}
                                                className="mt-2 w-full"
                                            />
                                        </label>
                                        <label className="block text-xs text-gray-300">
                                            Clip size
                                            <input
                                                type="range"
                                                min="0.35"
                                                max="1"
                                                step="0.05"
                                                value={selectedMeme.width}
                                                onChange={(e) => updateMemeClip(selectedMeme.id, { width: Number(e.target.value) })}
                                                className="mt-2 w-full"
                                            />
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => updateMemeClip(selectedMeme.id, { x: 0.5, y: 0.28 })} className="rounded bg-white/10 px-2 py-2 text-xs font-bold">Top</button>
                                            <button onClick={() => updateMemeClip(selectedMeme.id, { x: 0.5, y: 0.72 })} className="rounded bg-white/10 px-2 py-2 text-xs font-bold">Bottom</button>
                                            <button onClick={() => updateMemeClip(selectedMeme.id, { x: 0.28, y: 0.5 })} className="rounded bg-white/10 px-2 py-2 text-xs font-bold">Left</button>
                                            <button onClick={() => updateMemeClip(selectedMeme.id, { x: 0.72, y: 0.5 })} className="rounded bg-white/10 px-2 py-2 text-xs font-bold">Right</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {recordedBlob && (
                        <div className="border-t border-white/10 p-4">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => {
                                        setRecordedBlob(null);
                                        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
                                        setRecordedUrl('');
                                        memeClips.forEach(clip => {
                                            if (!clip.external) URL.revokeObjectURL(clip.url);
                                        });
                                        setMemeClips([]);
                                        setSelectedMemeId(null);
                                        setEditTime(0);
                                    }}
                                    className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold"
                                >
                                    Retake
                                </button>
                                <button
                                    onClick={uploadReaction}
                                    disabled={uploading}
                                    className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
                                >
                                    Post
                                </button>
                            </div>
                        </div>
                    )}
                </aside>
            </div>

            {songSearchOpen && (
                <div className="absolute inset-0 z-[230] flex flex-col bg-black/95 p-4">
                    <div className="mb-5 flex items-center justify-between">
                        <h3 className="font-bold">Add Music</h3>
                        <button onClick={() => { stopSongPreview(); setSongSearchOpen(false); }} className="rounded-full p-2 hover:bg-white/10">
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                    <form onSubmit={searchSongs} className="mb-4 flex gap-2">
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                value={songQuery}
                                onChange={(e) => setSongQuery(e.target.value)}
                                placeholder="Search song..."
                                className="w-full rounded-lg bg-white/10 py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                        <button className="rounded-lg bg-purple-600 px-5 font-bold">Search</button>
                    </form>
                    <div className="min-h-0 flex-1 overflow-y-auto space-y-3">
                        {searchingSongs && <p className="py-6 text-center text-gray-400">Searching...</p>}
                        {songResults.map(song => (
                            <div key={song.id} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
                                <img src={song.artwork} className="h-12 w-12 rounded object-cover" alt="" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{song.title}</p>
                                    <p className="truncate text-xs text-gray-400">{song.artist}</p>
                                </div>
                                <button onClick={() => toggleSongPreview(song)} className="rounded-full p-2 hover:bg-white/10">
                                    {playingSongId === song.id ? <StopIcon className="h-5 w-5 text-purple-300" /> : <PlayIcon className="h-5 w-5" />}
                                </button>
                                <button onClick={() => selectSong(song)} className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black">
                                    Select
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReelReactor;
