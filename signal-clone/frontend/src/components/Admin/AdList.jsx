import React from 'react';
import './AdList.css';

const AdList = ({ ads, onEdit, onDelete, adminToken }) => {
    if (ads.length === 0) {
        return (
            <div className="empty-state">
                <p>📭 No advertisements yet</p>
                <p>Click "Add New Ad" to create your first advertisement</p>
            </div>
        );
    }

    return (
        <div className="ad-list">
            <div className="list-header">
                <h3>Total Ads: {ads.length}</h3>
            </div>

            <div className="ads-grid">
                {ads.map(ad => (
                    <div key={ad.id} className="ad-card">
                        <div className="ad-media">
                            {ad.imageUrl ? (
                                <img src={ad.imageUrl} alt={ad.title} />
                            ) : (
                                <div className="no-image">No Image</div>
                            )}
                            {ad.videoUrl && <span className="video-badge">🎥 Video</span>}
                        </div>

                        <div className="ad-content">
                            <h4>{ad.title}</h4>
                            <p className="description">{ad.description}</p>

                            <div className="ad-meta">
                                {ad.price > 0 && (
                                    <span className="price">₹{ad.price.toLocaleString()}</span>
                                )}
                                <span className="product-id">{ad.productId}</span>
                            </div>

                            <div className="keywords">
                                {ad.keywords && ad.keywords.map((keyword, idx) => (
                                    <span key={idx} className="keyword-tag">{keyword}</span>
                                ))}
                            </div>

                            <div className="ad-stats">
                                <span>👁️ {ad.impressions || 0} impressions</span>
                                <span>🔗 {ad.clicks || 0} clicks</span>
                            </div>
                        </div>

                        <div className="ad-actions">
                            <button 
                                className="edit-btn"
                                onClick={() => onEdit(ad)}
                                title="Edit ad"
                            >
                                ✏️ Edit
                            </button>
                            <button 
                                className="delete-btn"
                                onClick={() => onDelete(ad.id)}
                                title="Delete ad"
                            >
                                🗑️ Delete
                            </button>
                        </div>

                        <div className="ad-footer">
                            <small>Created: {new Date(ad.createdAt).toLocaleDateString()}</small>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdList;
