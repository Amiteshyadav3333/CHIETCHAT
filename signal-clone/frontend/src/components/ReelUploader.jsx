import React, { useState, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import { XMarkIcon, VideoCameraIcon } from '@heroicons/react/24/outline';

const ReelUploader = ({ onClose, onSuccess }) => {
    const { token } = useContext(AuthContext);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (selected) {
            if (!selected.type.startsWith('video/')) {
                alert('Please select a video file');
                return;
            }
            setFile(selected);
            setPreview(URL.createObjectURL(selected));
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('video', file);
        formData.append('caption', caption);

        try {
            await axios.post('/api/reels', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
            });
            onSuccess();
        } catch (err) {
            console.error(err);
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

            <div className="flex-1 p-4 flex flex-col gap-6 overflow-y-auto">
                {preview ? (
                    <div className="relative aspect-[9/16] w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden border border-white/20">
                        <video src={preview} className="h-full w-full object-cover" autoPlay muted loop />
                        <button 
                            onClick={() => { setFile(null); setPreview(null); }}
                            className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div 
                        onClick={() => fileInputRef.current.click()}
                        className="aspect-[9/16] w-full max-w-[280px] mx-auto rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                    >
                        <div className="p-4 bg-white/10 rounded-full">
                            <VideoCameraIcon className="w-10 h-10 text-white" />
                        </div>
                        <p className="text-white font-medium">Select Video</p>
                        <p className="text-gray-500 text-xs">MP4 or WebM (Max 50MB)</p>
                    </div>
                )}

                <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="video/*" 
                    onChange={handleFileChange} 
                    className="hidden" 
                />

                <textarea
                    placeholder="Write a caption..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full bg-transparent text-white outline-none resize-none border-b border-white/10 pb-2 focus:border-white transition-colors"
                    rows={3}
                />
            </div>
        </div>
    );
};

export default ReelUploader;
