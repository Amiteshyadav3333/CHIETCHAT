import React from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

const FullscreenMediaModal = ({ src, type, onClose }) => {
    if (!src) return null;

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

    return (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            {/* Top Bar */}
            <div className="absolute top-4 right-4 flex gap-4 z-[110]">
                <button 
                    onClick={handleDownload}
                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                    title="Download"
                >
                    <ArrowDownTrayIcon className="w-6 h-6" />
                </button>
                <button 
                    onClick={onClose}
                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                    title="Close"
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Media Content */}
            <div 
                className="w-full max-w-5xl max-h-[85vh] flex items-center justify-center relative"
                onClick={e => e.stopPropagation()} // prevent close on clicking media
            >
                {type === 'video' || src.match(/\.(mp4|webm|ogg)$/i) ? (
                    <video 
                        src={src} 
                        controls 
                        autoPlay
                        className="max-w-full max-h-[85vh] rounded-lg object-contain shadow-2xl" 
                    />
                ) : (
                    <img 
                        src={src} 
                        alt="Zoomed" 
                        className="max-w-full max-h-[85vh] rounded-lg object-contain shadow-2xl" 
                    />
                )}
            </div>
        </div>
    );
};

export default FullscreenMediaModal;
