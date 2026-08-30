import React from 'react';
import './AdStats.css';

const AdStats = ({ stats }) => {
    if (!stats) {
        return <div className="stats-loading">Loading statistics...</div>;
    }

    const ctr = stats.totalImpressions > 0 
        ? ((stats.totalClicks / stats.totalImpressions) * 100).toFixed(2)
        : 0;

    return (
        <div className="ad-stats-container">
            <h2>Advertisement Statistics</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-content">
                        <h3>Total Ads</h3>
                        <p className="stat-value">{stats.totalAds}</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">👁️</div>
                    <div className="stat-content">
                        <h3>Total Impressions</h3>
                        <p className="stat-value">{stats.totalImpressions.toLocaleString()}</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">🔗</div>
                    <div className="stat-content">
                        <h3>Total Clicks</h3>
                        <p className="stat-value">{stats.totalClicks.toLocaleString()}</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">📈</div>
                    <div className="stat-content">
                        <h3>Click-Through Rate</h3>
                        <p className="stat-value">{ctr}%</p>
                    </div>
                </div>
            </div>

            <div className="stats-details">
                <div className="detail-section">
                    <h3>Top Performing Ads</h3>
                    <div className="detail-list">
                        {stats.topAds && stats.topAds.length > 0 ? (
                            stats.topAds.map((ad, idx) => (
                                <div key={idx} className="detail-item">
                                    <span className="rank">#{idx + 1}</span>
                                    <span className="name">{ad.title}</span>
                                    <span className="value">{ad.clicks} clicks</span>
                                </div>
                            ))
                        ) : (
                            <p>No data available</p>
                        )}
                    </div>
                </div>

                <div className="detail-section">
                    <h3>Recent Activity</h3>
                    <div className="detail-list">
                        {stats.recentActivity && stats.recentActivity.length > 0 ? (
                            stats.recentActivity.map((activity, idx) => (
                                <div key={idx} className="detail-item">
                                    <span className="time">{new Date(activity.timestamp).toLocaleTimeString()}</span>
                                    <span className="action">{activity.action}</span>
                                    <span className="ad">{activity.adTitle}</span>
                                </div>
                            ))
                        ) : (
                            <p>No recent activity</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdStats;
