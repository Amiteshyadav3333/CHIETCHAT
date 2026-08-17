export const selectVideoNoteMimeType = () => (
    ['video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported?.(type))
);

export const videoNoteConstraints = facingMode => ({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: { facingMode, width: { ideal: 480 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
});

export const oppositeCameraFacing = facingMode => facingMode === 'user' ? 'environment' : 'user';
