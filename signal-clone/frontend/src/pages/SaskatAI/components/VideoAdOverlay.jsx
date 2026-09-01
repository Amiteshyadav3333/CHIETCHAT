import React, { useState, useEffect, useRef } from 'react';

// YouTube-style video ad — shows for 8 seconds before skip is allowed.
// If ad has no videoUrl, falls back to image + title card.
const VideoAdOverlay = ({ ad, onSkip, onClose }) => {
    const [secondsLeft, setSecondsLeft] = useState(8);
    const [canSkip, setCanSkip] = useState(false);
    const videoRef = useRef(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    setCanSkip(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    if (!ad) return null;

    return (
        <div className="vad-overlay">
            <div className="vad-container">
                {/* Ad media */}
                {ad.videoUrl ? (
                    <video
                        ref={videoRef}
                        src={ad.videoUrl}
                        autoPlay
                        muted={false}
                        className="vad-video"
                        onEnded={() => setCanSkip(true)}
                    />
                ) : (
                    <div className="vad-image-card">
                        {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title} className="vad-img" />}
                        <div className="vad-title-card">
                            <span className="vad-ad-label">Ad</span>
                            <h3>{ad.title}</h3>
                            <p>{ad.description}</p>
                        </div>
                    </div>
                )}

                {/* Bottom bar */}
                <div className="vad-bottom">
                    <div className="vad-info">
                        <span className="vad-ad-badge">Sponsored</span>
                        <span className="vad-ad-name">{ad.title}</span>
                        {(ad.ctaUrl || ad.productLink) && (
                            <a
                                href={ad.ctaUrl || ad.productLink}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className="vad-cta"
                                onClick={onClose}
                            >
                                {ad.price > 0 ? `₹${ad.price} — View offer` : 'View offer ↗'}
                            </a>
                        )}
                    </div>
                    <button
                        className={`vad-skip-btn ${canSkip ? 'ready' : 'waiting'}`}
                        onClick={canSkip ? onSkip : undefined}
                        disabled={!canSkip}
                    >
                        {canSkip ? 'Skip Ad ⏭' : `Skip in ${secondsLeft}s`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoAdOverlay;
