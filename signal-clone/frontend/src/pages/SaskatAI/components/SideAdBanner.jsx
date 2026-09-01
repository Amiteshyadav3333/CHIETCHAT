import React, { useState } from 'react';

// Small side banner ad — positioned at bottom-right, compact, doesn't cover chat.
const SideAdBanner = ({ ad, onClose, onProductClick }) => {
    const [expanded, setExpanded] = useState(false);

    if (!ad) return null;

    return (
        <div className={`sab-wrap ${expanded ? 'expanded' : ''}`}>
            <div className="sab-header">
                <span className="sab-label">Sponsored</span>
                <div className="sab-actions">
                    <button className="sab-toggle" onClick={() => setExpanded(v => !v)}>
                        {expanded ? '▾' : '▴'}
                    </button>
                    <button className="sab-close" onClick={onClose}>✕</button>
                </div>
            </div>
            {expanded && (
                <div className="sab-body">
                    {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title} className="sab-img" />}
                    <div className="sab-text">
                        <p className="sab-title">{ad.title}</p>
                        <p className="sab-desc">{ad.description}</p>
                        {ad.price > 0 && <span className="sab-price">₹{ad.price}</span>}
                    </div>
                    <a
                        href={ad.ctaUrl || ad.productLink}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="sab-cta"
                        onClick={() => onProductClick(ad)}
                    >
                        View offer ↗
                    </a>
                </div>
            )}
            {!expanded && (
                <div className="sab-collapsed-body" onClick={() => setExpanded(true)}>
                    {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title} className="sab-thumb" />}
                    <span className="sab-collapsed-title">{ad.title}</span>
                </div>
            )}
        </div>
    );
};

export default SideAdBanner;
