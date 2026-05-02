import React, { useState, useRef } from 'react';
import { XMarkIcon, MusicalNoteIcon, PhotoIcon } from '@heroicons/react/24/solid';
import axios from 'axios';

const StatusUploader = ({ token, onClose, onUploaded }) => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [mediaType, setMediaType] = useState('image');
    const [caption, setCaption] = useState('');
    const [musicFile, setMusicFile] = useState(null);
    const [musicName, setMusicName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [videoDuration, setVideoDuration] = useState(null);

    const fileRef = useRef();
    const musicRef = useRef();
    const videoRef = useRef();

    const handleMediaSelect = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        setError('');

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
        setMusicFile(f);
        setMusicName(f.name.replace(/\.[^/.]+$/, ''));
    };

    const handleSubmit = async () => {
        if (!file) { setError('Please select a photo or video'); return; }
        setUploading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('media', file);
            formData.append('caption', caption);
            formData.append('duration', videoDuration || 15);

            if (musicFile) {
                // Upload music first
                const musicForm = new FormData();
                musicForm.append('file', musicFile);
                const musicRes = await axios.post('/api/upload', musicForm, {
                    headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
                });
                formData.append('musicUrl', musicRes.data.url);
                formData.append('musicName', musicName);
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
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                            <PhotoIcon className="w-16 h-16" />
                            <p className="text-sm">Tap to add photo or video</p>
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

                    {/* Music */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => musicRef.current?.click()}
                            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg flex-1 transition-colors"
                        >
                            <MusicalNoteIcon className="w-4 h-4 text-purple-400" />
                            <span className="truncate">{musicName || 'Add Music (optional)'}</span>
                        </button>
                        {musicFile && (
                            <button onClick={() => { setMusicFile(null); setMusicName(''); }} className="text-gray-500 hover:text-red-400">
                                <XMarkIcon className="w-4 h-4" />
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
                        disabled={uploading || !file}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        {uploading ? 'Posting...' : 'Post Status'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StatusUploader;
