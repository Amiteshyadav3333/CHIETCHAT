import React, { useEffect, useState, useRef } from 'react';
import { XMarkIcon, MusicalNoteIcon, PhotoIcon, MagnifyingGlassIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/solid';
import axios from 'axios';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const StatusUploader = ({ token, onClose, onUploaded }) => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [mediaType, setMediaType] = useState('image');
    const [caption, setCaption] = useState('');
    const [textStatus, setTextStatus] = useState('');
    const [musicFile, setMusicFile] = useState(null);
    const [musicName, setMusicName] = useState('');
    const [selectedSong, setSelectedSong] = useState(null);
    const [songQuery, setSongQuery] = useState('');
    const [songResults, setSongResults] = useState([]);
    const [searchingSongs, setSearchingSongs] = useState(false);
    const [songSearchOpen, setSongSearchOpen] = useState(false);
    const [songWarning, setSongWarning] = useState('');
    const [playingSongId, setPlayingSongId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [videoDuration, setVideoDuration] = useState(null);

    const fileRef = useRef();
    const musicRef = useRef();
    const videoRef = useRef();
    const previewAudioRef = useRef(null);

    useEffect(() => {
        return () => stopSongPreview();
    }, []);

    const handleMediaSelect = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        setError('');

        if (f.size > MAX_UPLOAD_BYTES) {
            setError('File is too large (Max 100MB)');
            return;
        }

        const isVideo = f.type.startsWith('video/');
        const isImage = f.type.startsWith('image/');

        if (!isVideo && !isImage) {
            setError('Only images and videos allowed');
            return;
        }

        if (isVideo) {
            const url = URL.createObjectURL(f);
            const vid = document.createElement('video');
            vid.src = url;
            vid.onloadedmetadata = () => {
                if (vid.duration > 15) {
                    setError('Video must be max 15 seconds');
                    return;
                }
                setVideoDuration(Math.ceil(vid.duration));
                setFile(f);
                setPreview(url);
                setMediaType('video');
            };
        } else {
            setFile(f);
            setPreview(URL.createObjectURL(f));
            setMediaType('image');
            setVideoDuration(null);
        }
    };

    const handleMusicSelect = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > MAX_UPLOAD_BYTES) {
            setError('Music file is too large (Max 100MB)');
            return;
        }
        setSelectedSong(null);
        stopSongPreview();
        setMusicFile(f);
        setMusicName(f.name.replace(/\.[^/.]+$/, ''));
    };

    const stopSongPreview = () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current.src = '';
            previewAudioRef.current = null;
        }
        setPlayingSongId(null);
    };

    const searchSongs = async (e) => {
        e?.preventDefault();
        const query = songQuery.trim();
        if (query.length < 2) {
            setSongWarning('Type at least 2 characters');
            return;
        }

        setSearchingSongs(true);
        setSongWarning('');
        try {
            const res = await axios.get('/api/music/search', {
                params: { q: query },
                headers: { Authorization: `Bearer ${token}` }
            });
            setSongResults(res.data.tracks || []);
            setSongWarning(res.data.warning || ((res.data.tracks || []).length ? '' : 'No songs found'));
        } catch {
            setSongResults([]);
            setSongWarning('Song search is unavailable. You can still post status without a song.');
        } finally {
            setSearchingSongs(false);
        }
    };

    const toggleSongPreview = (song) => {
        if (!song?.previewUrl) return;
        if (playingSongId === song.id) {
            stopSongPreview();
            return;
        }

        stopSongPreview();
        const audio = new Audio(song.previewUrl);
        previewAudioRef.current = audio;
        audio.onended = () => setPlayingSongId(null);
        audio.onerror = () => {
            setSongWarning('Preview could not play. You can still select this song.');
            setPlayingSongId(null);
        };
        audio.play()
            .then(() => setPlayingSongId(song.id))
            .catch(() => setSongWarning('Tap again or select the song. Browser blocked preview playback.'));
    };

    const selectSong = (song) => {
        stopSongPreview();
        setSelectedSong(song);
        setMusicFile(null);
        setMusicName(`${song.title} - ${song.artist}`);
        setSongSearchOpen(false);
        setSongWarning('');
    };

    const clearMusic = () => {
        stopSongPreview();
        setMusicFile(null);
        setSelectedSong(null);
        setMusicName('');
    };

    const handleSubmit = async () => {
        let statusFile = file;
        if (!statusFile && textStatus.trim()) {
            statusFile = await createTextStatusImage(textStatus.trim());
            setMediaType('image');
        }
        if (!statusFile) { setError('Please select a photo/video or write a text status'); return; }
        setUploading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('media', statusFile);
            formData.append('caption', caption || textStatus);
            formData.append('duration', videoDuration || 15);

            if (selectedSong?.previewUrl) {
                formData.append('musicUrl', selectedSong.previewUrl);
                formData.append('musicName', `${selectedSong.title} - ${selectedSong.artist}`);
            } else if (musicFile) {
                try {
                    const musicForm = new FormData();
                    musicForm.append('file', musicFile);
                    const musicRes = await axios.post('/api/upload', musicForm, {
                        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
                    });
                    formData.append('musicUrl', musicRes.data.url);
                    formData.append('musicName', musicName);
                } catch {
                    console.warn('Music upload failed; posting status without music.');
                }
            }

            await axios.post('/api/status', formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });

            onUploaded();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[150] flex items-center justify-center p-4">
            <div className="bg-gray-900 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-gray-800">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <h2 className="text-white font-bold text-lg">Add Status</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Preview */}
                <div
                    className="relative bg-black flex items-center justify-center cursor-pointer"
                    style={{ height: '320px' }}
                    onClick={() => !preview && fileRef.current?.click()}
                >
                    {preview ? (
                        mediaType === 'video' ? (
                            <video ref={videoRef} src={preview} className="w-full h-full object-contain" controls muted />
                        ) : (
                            <img src={preview} alt="" className="w-full h-full object-contain" />
                        )
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-gray-500 px-6 text-center">
                            <PhotoIcon className="w-16 h-16" />
                            <p className="text-sm">Tap to add photo or video</p>
                            <p className="text-xs text-gray-600">Or write a text status below</p>
                            <p className="text-xs text-gray-600">Max 15 seconds for video</p>
                        </div>
                    )}

                    {preview && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setPreview(null); setFile(null); }}
                            className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                        >
                            <XMarkIcon className="w-4 h-4 text-white" />
                        </button>
                    )}
                </div>

                <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaSelect} />

                {/* Controls */}
                <div className="p-4 space-y-3">
                    {error && <p className="text-red-400 text-xs text-center">{error}</p>}

                    <input
                        type="text"
                        placeholder="Add a caption..."
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                        maxLength={300}
                        className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
                    />
                    <textarea
                        placeholder="Text status..."
                        value={textStatus}
                        onChange={e => setTextStatus(e.target.value)}
                        maxLength={180}
                        className="h-20 w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none placeholder-gray-500 focus:ring-1 focus:ring-blue-500"
                    />

                    {/* Music */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setSongSearchOpen(v => !v)}
                            className="w-full flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg transition-colors"
                        >
                            <MusicalNoteIcon className="w-4 h-4 text-purple-400" />
                            <span className="truncate flex-1 text-left">{musicName || 'Search song (optional)'}</span>
                            <MagnifyingGlassIcon className="w-4 h-4 text-gray-500" />
                        </button>

                        {musicName && (
                            <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2">
                                {selectedSong?.artwork ? (
                                    <img src={selectedSong.artwork} alt="" className="w-9 h-9 rounded object-cover" />
                                ) : (
                                    <div className="w-9 h-9 rounded bg-gray-800 flex items-center justify-center">
                                        <MusicalNoteIcon className="w-4 h-4 text-purple-300" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-white">{musicName}</p>
                                    <p className="text-[11px] text-gray-400">{selectedSong ? '30 sec preview' : 'Uploaded audio'}</p>
                                </div>
                                <button onClick={clearMusic} className="text-gray-500 hover:text-red-400">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {songSearchOpen && (
                            <div className="rounded-xl border border-gray-800 bg-gray-950 p-3 space-y-3">
                                <form onSubmit={searchSongs} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={songQuery}
                                        onChange={e => setSongQuery(e.target.value)}
                                        placeholder="Search any song..."
                                        className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-purple-500 placeholder-gray-500"
                                    />
                                    <button
                                        type="submit"
                                        disabled={searchingSongs}
                                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-3 rounded-lg"
                                    >
                                        <MagnifyingGlassIcon className="w-4 h-4" />
                                    </button>
                                </form>

                                {songWarning && <p className="text-xs text-yellow-300">{songWarning}</p>}

                                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                                    {songResults.map(song => (
                                        <div key={song.id} className="flex items-center gap-2 rounded-lg bg-gray-900 p-2">
                                            {song.artwork ? (
                                                <img src={song.artwork} alt="" className="w-10 h-10 rounded object-cover" />
                                            ) : (
                                                <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center">
                                                    <MusicalNoteIcon className="w-4 h-4 text-purple-300" />
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => toggleSongPreview(song)}
                                                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-white flex-shrink-0"
                                            >
                                                {playingSongId === song.id ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                                            </button>
                                            <button type="button" onClick={() => selectSong(song)} className="min-w-0 flex-1 text-left">
                                                <p className="truncate text-sm text-white font-medium">{song.title}</p>
                                                <p className="truncate text-xs text-gray-400">{song.artist}</p>
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => musicRef.current?.click()}
                                    className="w-full text-xs text-gray-400 hover:text-white border border-gray-800 rounded-lg py-2"
                                >
                                    Upload audio instead
                                </button>
                            </div>
                        )}
                        {!songSearchOpen && (
                            <button
                                type="button"
                                onClick={() => musicRef.current?.click()}
                                className="w-full text-xs text-gray-500 hover:text-gray-300"
                            >
                                Upload audio file instead
                            </button>
                        )}
                    </div>
                    <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicSelect} />

                    {/* Media select button */}
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition-colors"
                    >
                        {preview ? 'Change Media' : 'Select Photo / Video'}
                    </button>

                    <button
                        onClick={handleSubmit}
                        disabled={uploading || (!file && !textStatus.trim())}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        {uploading ? 'Posting...' : 'Post Status'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const createTextStatusImage = (text) => new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(0.55, '#111827');
    gradient.addColorStop(1, '#2563eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 78px Inter, Arial, sans-serif';
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const next = `${line} ${word}`.trim();
        if (ctx.measureText(next).width > 820 && line) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    });
    if (line) lines.push(line);
    const startY = canvas.height / 2 - ((lines.length - 1) * 92) / 2;
    lines.slice(0, 8).forEach((item, idx) => ctx.fillText(item, canvas.width / 2, startY + idx * 92));
    canvas.toBlob(blob => resolve(new File([blob], `text-status-${Date.now()}.png`, { type: 'image/png' })), 'image/png');
});

export default StatusUploader;
