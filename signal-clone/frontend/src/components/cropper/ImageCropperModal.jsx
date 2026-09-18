import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from './cropImage';

const ImageCropperModal = ({ imageSrc, onCropDone, onCancel }) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [isCropping, setIsCropping] = useState(false);

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleCrop = async () => {
        if (!croppedAreaPixels || !imageSrc) return;
        setIsCropping(true);
        try {
            const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (croppedBlob) {
                // Convert Blob to File
                const file = new File([croppedBlob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' });
                onCropDone(file);
            }
        } catch (e) {
            console.error('Crop failed', e);
        } finally {
            setIsCropping(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="flex flex-col w-full max-w-xl h-[80vh] md:h-[600px] bg-[#111b21] rounded-2xl overflow-hidden shadow-2xl border border-gray-700/50">
                <div className="flex-1 relative w-full h-full">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onCropComplete={onCropComplete}
                        onZoomChange={setZoom}
                    />
                </div>
                
                <div className="p-6 bg-[#202c33] border-t border-gray-700/50">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <span className="text-gray-400 text-sm">Zoom</span>
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                aria-labelledby="Zoom"
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="w-full accent-[#00a884]"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-2">
                            <button
                                onClick={onCancel}
                                className="px-5 py-2.5 rounded-xl font-semibold text-gray-300 hover:bg-white/5 transition"
                                disabled={isCropping}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCrop}
                                className="px-5 py-2.5 rounded-xl bg-[#00a884] font-semibold text-[#111b21] hover:bg-[#00c298] transition disabled:opacity-50"
                                disabled={isCropping}
                            >
                                {isCropping ? 'Cropping...' : 'Set Picture'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageCropperModal;
