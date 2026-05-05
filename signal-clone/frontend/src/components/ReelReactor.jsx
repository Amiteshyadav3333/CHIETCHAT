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

    const originalVideoRef = useRef(null);
    const userVideoRef = useRef(null);
    const canvasRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const chunksRef = useRef([]);

    useEffect(() => {
        startCamera();
        return () => {
            stopAll();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const stopAll = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            if (userVideoRef.current) userVideoRef.current.srcObject = stream;
            setCameraReady(true);
        } catch (err) {
            alert("Camera access denied: " + err.message);
            onClose();
        }
    };

    const toggleOriginalVideo = () => {
        if (!recording) return;
        if (originalVideoRef.current.paused) {
            originalVideoRef.current.play();
            setPaused(false);
        } else {
            originalVideoRef.current.pause();
            setPaused(true);
        }
    };

    const startRecording = async () => {
        if (!cameraReady) return;

        // Setup Audio Mixing
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;

        const originalSource = audioCtx.createMediaElementSource(originalVideoRef.current);
        const micSource = audioCtx.createMediaStreamSource(streamRef.current);
        
        const originalGain = audioCtx.createGain();
        originalGain.gain.value = 0.4; // Original video voice lower
        
        const micGain = audioCtx.createGain();
        micGain.gain.value = 1.0; // User voice louder
        
        const destination = audioCtx.createMediaStreamDestination();
        
        originalSource.connect(originalGain);
        originalGain.connect(destination);
        originalGain.connect(audioCtx.destination); 

        micSource.connect(micGain);
        micGain.connect(destination);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const draw = () => {
            if (!recording && !mediaRecorderRef.current) return;
            
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw original video (if paused, draw current frame)
            ctx.drawImage(originalVideoRef.current, 0, 0, canvas.width / 2, canvas.height);
            
            // User Camera
            ctx.drawImage(userVideoRef.current, canvas.width / 2, 0, canvas.width / 2, canvas.height);
            
            requestAnimationFrame(draw);
        };

        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9' });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            uploadReaction(blob);
        };

        recorder.start();
        originalVideoRef.current.currentTime = 0;
        originalVideoRef.current.play();
        setRecording(true);
        setPaused(false);
        draw();

        timerRef.current = setInterval(() => {
            setRecordTime(prev => {
                if (prev >= 60) { // Increased to 60s for reactions
                    stopRecording();
                    return prev;
                }
                return prev + 1;
            });
        }, 1000);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && recording) {
            mediaRecorderRef.current.stop();
            originalVideoRef.current.pause();
            setRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const uploadReaction = async (blob) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('video', blob, 'reaction.webm');
        formData.append('caption', `Reacting to @${originalReel.user.username}`);

        try {
            await axios.post('/api/reels', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });
            onSuccess();
        } catch (err) {
            alert("Upload failed: " + err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            <div className="p-4 flex items-center justify-between border-b border-white/10">
                <button onClick={onClose} className="p-2 text-white"><XMarkIcon className="w-6 h-6" /></button>
                <h2 className="text-white font-bold">React to Reel</h2>
                <div className="w-10"></div>
            </div>

            <div className="flex-1 relative bg-gray-900 flex">
                {/* Visual Layout (Mirroring the Canvas) */}
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 bg-black relative group" onClick={toggleOriginalVideo}>
                        <video 
                            ref={originalVideoRef} 
                            src={originalReel.videoUrl} 
                            className="w-full h-full object-cover" 
                            muted 
                            crossOrigin="anonymous"
                            playsInline
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {paused ? <PlaySolid className="w-16 h-16 text-white/50" /> : <PauseSolid className="w-16 h-16 text-white/50" />}
                        </div>
                        <div className="absolute top-2 left-2 bg-black/40 px-2 py-1 rounded text-[10px] text-white">
                            Original {paused ? '(Paused)' : '(Playing)'}
                        </div>
                    </div>
                    <div className="flex-1 bg-black relative border-l border-white/20">
                        <video 
                            ref={userVideoRef} 
                            className="w-full h-full object-cover" 
                            autoPlay 
                            muted 
                            playsInline 
                        />
                        <div className="absolute top-2 left-2 bg-black/40 px-2 py-1 rounded text-[10px] text-white">You</div>
                    </div>
                </div>

                {/* Hidden Canvas for Mixing */}
                <canvas ref={canvasRef} width="1280" height="720" className="hidden" />

                {/* Recording Controls */}
                <div className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-4 z-50">
                    {recording && (
                        <div className="bg-black/60 px-4 py-2 rounded-full border border-white/10 flex flex-col items-center">
                            <p className="text-white font-mono text-xl">{recordTime}s / 60s</p>
                            <p className="text-blue-400 text-[10px] font-bold uppercase mt-1">Tap left side to Pause/Play Video</p>
                        </div>
                    )}
                    <button 
                        onClick={recording ? stopRecording : startRecording}
                        disabled={uploading}
                        className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 ${uploading ? 'opacity-50' : ''}`}
                    >
                        <div className={`w-full h-full rounded-full ${recording ? 'bg-red-600 scale-75' : 'bg-red-500'} transition-all shadow-lg`} />
                    </button>
                    <p className="text-white text-sm font-medium">{recording ? (paused ? 'Recording (Video Paused)' : 'Recording (Video Playing)') : 'Tap to Start Reaction'}</p>
                </div>

                {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-[60]">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-white font-bold">Uploading Reaction...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReelReactor;
