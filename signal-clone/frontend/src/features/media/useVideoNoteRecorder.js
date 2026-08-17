import { useCallback, useEffect, useRef, useState } from 'react';
import { oppositeCameraFacing, selectVideoNoteMimeType, videoNoteConstraints } from './videoNote';

const MAX_SECONDS = 60;

export const useVideoNoteRecorder = ({ onUpload, onError = window.alert }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [facing, setFacing] = useState('user');
    const previewRef = useRef(null);
    const canvasRef = useRef(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const frameRef = useRef(null);

    const releaseMedia = useCallback(() => {
        window.clearInterval(timerRef.current);
        window.cancelAnimationFrame(frameRef.current);
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const close = useCallback(() => {
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
        }
        releaseMedia();
        setIsRecording(false);
        setSeconds(0);
        setIsOpen(false);
    }, [releaseMedia]);

    const open = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(videoNoteConstraints(facing));
            streamRef.current = stream;
            setIsOpen(true);
            requestAnimationFrame(() => {
                if (!previewRef.current) return;
                previewRef.current.srcObject = stream;
                previewRef.current.play().catch(() => {});
            });
        } catch {
            onError('Allow camera and microphone access to record a video note.');
        }
    }, [facing, onError]);

    const flipCamera = useCallback(async () => {
        const nextFacing = oppositeCameraFacing(facing);
        try {
            const replacement = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: nextFacing }, width: { ideal: 480 }, height: { ideal: 480 } }, audio: false,
            });
            const current = streamRef.current;
            current?.getVideoTracks().forEach(track => { current.removeTrack(track); track.stop(); });
            replacement.getVideoTracks().forEach(track => current?.addTrack(track));
            setFacing(nextFacing);
            if (previewRef.current) {
                previewRef.current.srcObject = current;
                await previewRef.current.play();
            }
        } catch {
            onError('Another camera is not available on this device.');
        }
    }, [facing, onError]);

    const start = useCallback(() => {
        const sourceStream = streamRef.current;
        const canvas = canvasRef.current;
        const preview = previewRef.current;
        if (!sourceStream || !canvas || !preview) return;
        const context = canvas.getContext('2d');
        const draw = () => {
            if (preview.readyState >= 2) {
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(preview, 0, 0, canvas.width, canvas.height);
            }
            frameRef.current = requestAnimationFrame(draw);
        };
        draw();
        const outputStream = canvas.captureStream(24);
        sourceStream.getAudioTracks().forEach(track => outputStream.addTrack(track));
        const mimeType = selectVideoNoteMimeType();
        const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorderRef.current = recorder;
        recorder.ondataavailable = event => event.data.size && chunksRef.current.push(event.data);
        recorder.onstop = () => {
            releaseMedia();
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
            setIsOpen(false);
            setIsRecording(false);
            setSeconds(0);
            if (blob.size) onUpload(new File([blob], `video-note-${Date.now()}.webm`, { type: blob.type }));
        };
        recorder.start(250);
        setIsRecording(true);
        setSeconds(0);
        timerRef.current = window.setInterval(() => setSeconds(value => {
            if (value >= MAX_SECONDS - 1) {
                setTimeout(() => recorder.state === 'recording' && recorder.stop(), 0);
                return MAX_SECONDS;
            }
            return value + 1;
        }), 1000);
    }, [onUpload, releaseMedia]);

    const stop = useCallback(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, []);

    useEffect(() => releaseMedia, [releaseMedia]);
    return { isOpen, isRecording, seconds, facing, previewRef, canvasRef, open, close, start, stop, flipCamera };
};
