import React, { useEffect, useRef } from 'react';
import UserAvatar from './UserAvatar';

export const ControlBtn = ({ onClick, active, activeColor = 'bg-gray-700', children, label }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-pressed={Boolean(active)}
        className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${active ? activeColor : 'bg-gray-700/80 hover:bg-gray-600'}`}
    >
        {children}
    </button>
);

export const AvatarPlaceholder = ({ avatar, name, small }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900">
        <div className={`${small ? 'w-12 h-12' : 'w-24 h-24'} rounded-full overflow-hidden border-2 border-gray-600`}>
            <UserAvatar src={avatar} name={name} className="w-full h-full object-cover" />
        </div>
        {!small && <p className="text-white text-sm font-medium">{name}</p>}
    </div>
);

export const RemoteVideo = ({ stream, className }) => {
    const videoRef = useRef();
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (stream) {
            video.srcObject = stream;
            const playVideo = () => video.play().catch(err => {
                // NotAllowedError is expected on some browsers before user interaction
                if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                    console.warn('RemoteVideo play() failed:', err);
                }
            });
            video.onloadedmetadata = playVideo;
            stream.getVideoTracks().forEach(track => { track.onunmute = playVideo; });
            playVideo();
        } else {
            video.srcObject = null;
        }
        return () => {
            video.onloadedmetadata = null;
            stream?.getVideoTracks().forEach(track => { track.onunmute = null; });
            video.srcObject = null;
        };
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline className={className} />;
};

export const LocalVideo = ({ stream, className, muted = true }) => {
    const videoRef = useRef();
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (stream) {
            video.srcObject = stream;
            video.play().catch(err => {
                if (err.name !== 'NotAllowedError') {
                    console.warn('LocalVideo play() failed:', err);
                }
            });
        } else {
            video.srcObject = null;
        }
        return () => { video.srcObject = null; };
    }, [stream]);
    return <video ref={videoRef} muted={muted} autoPlay playsInline className={className} />;
};

export const AudioPlayer = ({ stream }) => {
    const audioRef = useRef();
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (stream) {
            audio.srcObject = stream;
            audio.play().catch(err => {
                if (err.name !== 'NotAllowedError') {
                    console.warn('AudioPlayer play() failed:', err);
                }
            });
        } else {
            audio.srcObject = null;
        }
        return () => { audio.srcObject = null; };
    }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};
