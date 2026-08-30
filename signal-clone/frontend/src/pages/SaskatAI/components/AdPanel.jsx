import React, { useState, useRef, useEffect } from 'react';

const AdPanel = ({ ad, onClose, onProductClick }) => {
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [timeLeft, setTimeLeft] = useState(10);
    const panelRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    onClose();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [onClose]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, dragOffset]);

    return (
        <div
            ref={panelRef}
            className="ad-panel"
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
        >
            <div className="ad-header" onMouseDown={handleMouseDown}>
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
                <button 
                    className="skip-btn"
                    onClick={onClose}
                >
                    Skip ({timeLeft}s)
                </button>
                <a 
                    href={ad.productLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="buy-btn"
                    onClick={() => onProductClick(ad.productId)}
                >
                    View Product
                </a>
            </div>

            <div className="ad-progress">
                <div className="progress-bar" style={{ width: `${(timeLeft / 10) * 100}%` }}></div>
            </div>
        </div>
    );
};

export default AdPanel;
