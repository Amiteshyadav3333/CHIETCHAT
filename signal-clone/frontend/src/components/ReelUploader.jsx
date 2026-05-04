import React, { useState, useRef, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import { XMarkIcon, VideoCameraIcon, MusicalNoteIcon, MagnifyingGlassIcon, PlayIcon, PauseIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const MAX_DURATION = 20; // 20 seconds

const ReelUploader = ({ onClose, onSuccess }) => {
    const { token } = useContext(AuthContext);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordTime, setRecordTime] = useState(0);
    const [mediaStream, setMediaStream] = useState(null);
    const [facingMode, setFacingMode] = useState('user');
    
    // Music States
    const [musicName, setMusicName] = useState('');
    const [selectedSong, setSelectedSong] = useState(null);
    const [songQuery, setSongQuery] = useState('');
    const [songResults, setSongResults] = useState([]);
    const [searchingSongs, setSearchingSongs] = useState(false);
    const [songSearchOpen, setSongSearchOpen] = useState(false);
    const [playingSongId, setPlayingSongId] = useState(null);
    const previewAudioRef = useRef(null);

    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const videoPreviewRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            stopStream();
            stopSongPreview();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const stopStream = () => {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            setMediaStream(null);
        }
    };

    const startCamera = async () => {
        try {
            stopStream();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true
            });
            setMediaStream(stream);
            if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        } catch (err) {
            alert('Could not access camera: ' + err.message);
        }
    };

    const startRecording = () => {
        if (!mediaStream) return;
        chunksRef.current = [];
        const recorder = new MediaRecorder(mediaStream);
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            setFile(blob);
            setPreview(url);
            stopStream();
        };

        recorder.start();
        setRecording(true);
        setRecordTime(0);

        timerRef.current = setInterval(() => {
            setRecordTime(prev => {
                if (prev >= MAX_DURATION) {
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
            setRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (selected) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(selected);
            video.onloadedmetadata = () => {
                if (video.duration > MAX_DURATION + 1) {
                    alert(`Video too long! Max ${MAX_DURATION} seconds allowed.`);
                    return;
                }
                setFile(selected);
                setPreview(video.src);
            };
        }
    };

    const stopSongPreview = () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setPlayingSongId(null);
    };

    const searchSongs = async (e) => {
        e?.preventDefault();
        if (songQuery.length < 2) return;
        setSearchingSongs(true);
        try {
            const res = await axios.get('/api/music/search', {
                params: { q: songQuery },
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
        previewAudioRef.current = audio;
        audio.play().then(() => setPlayingSongId(song.id)).catch(() => {});
    };

    const selectSong = (song) => {
        stopSongPreview();
        setSelectedSong(song);
        setMusicName(`${song.title} - ${song.artist}`);
        setSongSearchOpen(false);
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('video', file);
        formData.append('caption', caption);
        if (selectedSong) {
            formData.append('musicUrl', selectedSong.previewUrl);
            formData.append('musicName', musicName);
        }

        try {
            await axios.post('/api/reels', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });
            onSuccess();
        } catch (err) {
            alert('Upload failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            <div className="p-4 flex items-center justify-between border-b border-white/10">
                <button onClick={onClose} className="p-2 text-white"><XMarkIcon className="w-6 h-6" /></button>
                <h2 className="text-white font-bold">New Reel</h2>
                <button 
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className={`font-bold px-4 py-1 rounded-full ${(!file || uploading) ? 'bg-gray-700 text-gray-500' : 'bg-white text-black'}`}
                >
                    {uploading ? 'Posting...' : 'Post'}
                </button>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto pb-20">
                {/* Preview/Recording Area */}
                <div className="relative aspect-[9/16] w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden border border-white/10 bg-gray-900">
                    {preview ? (
                        <>
                            <video src={preview} className="h-full w-full object-cover" autoPlay muted loop />
                            <button 
                                onClick={() => { setFile(null); setPreview(null); }}
                                className="absolute top-4 right-4 bg-black/60 p-2 rounded-full text-white"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </>
                    ) : mediaStream ? (
                        <>
                            <video ref={videoPreviewRef} className="h-full w-full object-cover" autoPlay muted playsInline />
                            <div className="absolute top-4 left-4 bg-red-600 px-2 py-1 rounded text-[10px] font-bold text-white uppercase animate-pulse">
                                Live
                            </div>
                            <div className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-4">
                                <p className="text-white font-mono text-xl drop-shadow-md">{recordTime}s / {MAX_DURATION}s</p>
                                <div className="flex items-center gap-6">
                                    <button 
                                        onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                                        className="p-3 bg-white/20 rounded-full text-white"
                                    >
                                        <ArrowPathIcon className="w-6 h-6" />
                                    </button>
                                    <button 
                                        onClick={recording ? stopRecording : startRecording}
                                        className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center p-1`}
                                    >
                                        <div className={`w-full h-full rounded-full ${recording ? 'bg-red-600 scale-75' : 'bg-white'} transition-all`} />
                                    </button>
                                    <button 
                                        onClick={stopStream}
                                        className="p-3 bg-white/20 rounded-full text-white"
                                    >
                                        <XMarkIcon className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-6">
                            <div className="flex flex-col items-center gap-4">
                                <button 
                                    onClick={startCamera}
                                    className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30"
                                >
                                    <VideoCameraIcon className="w-8 h-8" />
                                </button>
                                <p className="text-white font-medium">Record Video</p>
                            </div>
                            <div className="flex flex-col items-center gap-4">
                                <button 
                                    onClick={() => fileInputRef.current.click()}
                                    className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white"
                                >
                                    <PlusIcon className="w-6 h-6" /> // PlusIcon not imported, wait
                                    <VideoCameraIcon className="w-6 h-6" />
                                </button>
                                <p className="text-gray-400 text-sm">Upload from Gallery</p>
                            </div>
                        </div>
                    )}
                </div>

                <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />

                {/* Caption */}
                <textarea
                    placeholder="Write a caption..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full bg-transparent text-white outline-none resize-none border-b border-white/10 pb-2 focus:border-white transition-colors"
                    rows={2}
                />

                {/* Music Section */}
                <div className="space-y-3">
                    <button
                        onClick={() => setSongSearchOpen(!songSearchOpen)}
                        className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 p-3 rounded-xl text-white transition-colors"
                    >
                        <MusicalNoteIcon className="w-5 h-5 text-purple-400" />
                        <span className="flex-1 text-left text-sm truncate">{musicName || 'Add Background Music'}</span>
                        <MagnifyingGlassIcon className="w-5 h-5 text-gray-500" />
                    </button>

                    {songSearchOpen && (
                        <div className="bg-gray-950 rounded-2xl p-4 border border-white/5 space-y-4 max-h-[300px] overflow-y-auto">
                            <form onSubmit={searchSongs} className="flex gap-2">
                                <input
                                    type="text"
                                    value={songQuery}
                                    onChange={e => setSongQuery(e.target.value)}
                                    placeholder="Search songs..."
                                    className="flex-1 bg-white/10 text-white text-sm px-4 py-2 rounded-lg outline-none"
                                />
                                <button type="submit" className="bg-purple-600 p-2 rounded-lg text-white">
                                    <MagnifyingGlassIcon className="w-5 h-5" />
                                </button>
                            </form>
                            <div className="space-y-2">
                                {songResults.map(song => (
                                    <div key={song.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                                        <img src={song.artwork} className="w-10 h-10 rounded" alt="" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{song.title}</p>
                                            <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                                        </div>
                                        <button onClick={() => toggleSongPreview(song)} className="text-white p-1">
                                            {playingSongId === song.id ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                        </button>
                                        <button onClick={() => selectSong(song)} className="text-xs bg-white text-black px-3 py-1 rounded-full font-bold">Select</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <style>{`
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
                .animate-pulse { animation: pulse 1s infinite; }
            `}</style>
        </div>
    );
};

export default ReelUploader;
