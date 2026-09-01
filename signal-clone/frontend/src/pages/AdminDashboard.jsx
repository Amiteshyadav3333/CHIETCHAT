import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from '../utils/clientRouter';
import AdForm from '../components/Admin/AdForm';
import AdList from '../components/Admin/AdList';
import AdStats from '../components/Admin/AdStats';
import './AdminDashboard.css';

const AdminDashboard = () => {
    const [ads, setAds] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingAd, setEditingAd] = useState(null);
    const [activeTab, setActiveTab] = useState('ads');
    const [premiumPayments, setPremiumPayments] = useState([]);
    const [premiumLoading, setPremiumLoading] = useState(false);
    const navigate = useNavigate();

    const adminToken = localStorage.getItem('adminToken');
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');

    useEffect(() => {
        if (!adminToken) {
            navigate('/admin/login');
            return;
        }
        fetchAds();
        fetchStats();
    }, [adminToken, navigate]);

    const fetchAds = async () => {
        try {
            const response = await axios.get('/api/admin/ads', {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setAds(response.data.ads || []);
        } catch (error) {
            console.error('Failed to fetch ads:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await axios.get('/api/admin/ads/stats', {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setStats(response.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const fetchPremiumPayments = async () => {
        setPremiumLoading(true);
        try {
            const response = await axios.get('/api/admin/premium-payments', { headers: { Authorization: `Bearer ${adminToken}` } });
            setPremiumPayments(response.data.payments || []);
        } catch (error) {
            console.error('Failed to fetch premium payments:', error);
        } finally { setPremiumLoading(false); }
    };

    const reviewPremiumPayment = async (payment, action) => {
        const label = action === 'approve' ? 'approve and activate Premium' : 'reject';
        if (!window.confirm(`Do you want to ${label} for ${payment.user?.username || 'this user'}?`)) return;
        try {
            await axios.post(`/api/admin/premium-payments/${payment.id}/review`, { action }, { headers: { Authorization: `Bearer ${adminToken}` } });
            fetchPremiumPayments();
        } catch (error) { alert(error.response?.data?.error || 'Could not review payment.'); }
    };

    const handleAddAd = async (formData) => {
        try {
            const response = await axios.post('/api/admin/ads', formData, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setAds([...ads, response.data.ad]);
            setShowForm(false);
            fetchStats();
        } catch (error) {
            console.error('Failed to add ad:', error);
        }
    };

    const handleUpdateAd = async (adId, formData) => {
        try {
            const response = await axios.put(`/api/admin/ads/${adId}`, formData, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setAds(ads.map(ad => ad.id === adId ? response.data.ad : ad));
            setEditingAd(null);
            fetchStats();
        } catch (error) {
            console.error('Failed to update ad:', error);
        }
    };

    const handleDeleteAd = async (adId) => {
        if (!window.confirm('Are you sure you want to delete this ad?')) return;

        try {
            await axios.delete(`/api/admin/ads/${adId}`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setAds(ads.filter(ad => ad.id !== adId));
            fetchStats();
        } catch (error) {
            console.error('Failed to delete ad:', error);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        navigate('/admin/login');
    };

    if (loading) {
        return (
            <div className="admin-loading">
                <div className="spinner"></div>
                <p>Loading admin panel...</p>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            <header className="admin-header">
                <div className="admin-header-left">
                    <h1>⚙️ Admin Panel</h1>
                    <p>Saskat AI - Advertisement Management</p>
                </div>
                <div className="admin-header-right">
                    <span className="admin-user">👤 {adminUser.name || adminUser.email}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </header>

            <div className="admin-container">
                <nav className="admin-nav">
                    <button 
                        className={`nav-item ${activeTab === 'ads' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ads')}
                    >
                        📢 Advertisements
                    </button>
                    <button 
                        className={`nav-item ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        📊 Statistics
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'premium' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('premium'); fetchPremiumPayments(); }}
                    >
                        💎 Premium approvals
                    </button>
                    <button 
                        className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        ⚙️ Settings
                    </button>
                </nav>

                <main className="admin-content">
                    {activeTab === 'ads' && (
                        <div className="ads-section">
                            <div className="section-header">
                                <h2>Manage Advertisements</h2>
                                <button 
                                    className="add-ad-btn"
                                    onClick={() => {
                                        setEditingAd(null);
                                        setShowForm(!showForm);
                                    }}
                                >
                                    {showForm ? '✕ Cancel' : '+ Add New Ad'}
                                </button>
                            </div>

                            {showForm && (
                                <AdForm 
                                    onSubmit={editingAd ? 
                                        (data) => handleUpdateAd(editingAd.id, data) : 
                                        handleAddAd
                                    }
                                    initialData={editingAd}
                                    adminToken={adminToken}
                                />
                            )}

                            <AdList 
                                ads={ads}
                                onEdit={(ad) => {
                                    setEditingAd(ad);
                                    setShowForm(true);
                                }}
                                onDelete={handleDeleteAd}
                                adminToken={adminToken}
                            />
                        </div>
                    )}

                    {activeTab === 'stats' && (
                        <AdStats stats={stats} />
                    )}

                    {activeTab === 'premium' && (
                        <div className="premium-payments-section">
                            <div className="section-header"><div><h2>Premium payment approvals</h2><p>Only provider-verified payments can activate Premium after your approval.</p></div><button className="add-ad-btn" onClick={fetchPremiumPayments}>Refresh</button></div>
                            {premiumLoading ? <p>Loading payments…</p> : premiumPayments.length === 0 ? <div className="settings-card"><p>No Premium payments yet.</p></div> : <div className="premium-payment-list">
                                {premiumPayments.map(payment => <article className="premium-payment-card" key={payment.id}>
                                    <div><strong>{payment.user?.username || 'Deleted user'}</strong><span>{payment.user?.email || payment.user?.platformId || `User #${payment.user?.id || ''}`}</span><small>Order #{payment.id} · ₹{payment.amount} · {payment.providerPaymentId || 'Payment ID pending'}</small></div>
                                    <div className="premium-payment-actions"><span className={`payment-status ${payment.status}`}>{payment.status.replace(/_/g, ' ')}</span>{payment.status === 'approval_pending' && <><button className="approve-premium-btn" onClick={() => reviewPremiumPayment(payment, 'approve')}>Approve & activate</button><button className="reject-premium-btn" onClick={() => reviewPremiumPayment(payment, 'reject')}>Reject</button></>}</div>
                                </article>)}
                            </div>}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="settings-section">
                            <h2>Settings</h2>
                            <div className="settings-card">
                                <h3>Ad Display Settings</h3>
                                <div className="setting-item">
                                    <label>Ad Display Frequency (minutes)</label>
                                    <input type="number" defaultValue="5" min="1" max="60" />
                                </div>
                                <div className="setting-item">
                                    <label>Ad Display Duration (seconds)</label>
                                    <input type="number" defaultValue="10" min="5" max="30" />
                                </div>
                                <button className="save-settings-btn">Save Settings</button>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;
