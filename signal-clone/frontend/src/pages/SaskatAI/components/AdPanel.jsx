import React, { useState, useEffect } from 'react';

const AdPanel = ({ ad, onClose, onProductClick }) => {
    const [timeLeft, setTimeLeft] = useState(8);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                return Math.max(0, prev - 1);
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [onClose]);

    return (
        <div className="ad-panel">
            <div className="ad-header">
                <span className="ad-label">Sponsored</span>
                <button className="close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="ad-content">
                {ad.videoUrl && (
                    <video 
                        src={ad.videoUrl} 
                        autoPlay 
                        muted 
                        loop
                        className="ad-video"
                    />
                )}
                {ad.imageUrl && !ad.videoUrl && (
                    <img src={ad.imageUrl} alt={ad.title} className="ad-image" />
                )}

                <div className="ad-info">
                    <h3>{ad.title}</h3>
                    <p>{ad.description}</p>
                    {ad.price && <span className="ad-price">₹{ad.price}</span>}
                </div>
            </div>

            <div className="ad-actions">
                <button className="skip-btn" disabled={timeLeft > 0} onClick={onClose}>{timeLeft > 0 ? `Skip in ${timeLeft}s` : 'Skip ad'}</button>
                <button className="buy-btn" onClick={() => onProductClick(ad)}>Buy in app</button>
            </div>

            <div className="ad-progress">
                <div className="progress-bar" style={{ width: `${(timeLeft / 10) * 100}%` }}></div>
            </div>
        </div>
    );
};

export default AdPanel;
