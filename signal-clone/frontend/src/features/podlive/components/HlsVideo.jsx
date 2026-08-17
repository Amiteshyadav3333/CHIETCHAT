import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export default function HlsVideo({ src, poster, autoPlay = false, className = '' }) {
    const ref = useRef(null);
    useEffect(() => {
        const video = ref.current;
        if (!video || !src) return undefined;
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = src;
        else if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(src); hls.attachMedia(video);
            return () => hls.destroy();
        } else video.src = src;
        return undefined;
    }, [src]);
    return <video ref={ref} poster={poster} controls playsInline autoPlay={autoPlay} className={className} />;
}
