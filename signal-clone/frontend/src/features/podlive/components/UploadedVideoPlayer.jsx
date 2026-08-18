import React, { useEffect, useRef } from 'react';

export default function UploadedVideoPlayer({ src, poster }) {
    const videoRef = useRef(null);
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return undefined;
        let player;
        let cancelled = false;
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = src;
        else import('hls.js').then(({ default: Hls }) => {
            if (cancelled || !Hls.isSupported()) return;
            player = new Hls({ enableWorker: true, lowLatencyMode: false });
            player.loadSource(src);
            player.attachMedia(video);
        });
        return () => { cancelled = true; player?.destroy(); video.removeAttribute('src'); video.load(); };
    }, [src]);
    return <video ref={videoRef} controls playsInline preload="metadata" poster={poster} className="aspect-video w-full bg-black"/>;
}
