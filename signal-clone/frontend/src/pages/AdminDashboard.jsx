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
    const [usersList, setUsersList] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [userCollegeFilter, setUserCollegeFilter] = useState('');
    const [userLocationFilter, setUserLocationFilter] = useState('');
    const [messageModalUser, setMessageModalUser] = useState(null);
    const [adminMessageText, setAdminMessageText] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [userAId, setUserAId] = useState('');
    const [userBId, setUserBId] = useState('');
    const [introNote, setIntroNote] = useState('');
    const [introducing, setIntroducing] = useState(false);
    const navigate = useNavigate();

    const adminToken = localStorage.getItem('adminToken');
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');

    const fetchAdminUsers = async (college = userCollegeFilter, loc = userLocationFilter) => {
        setUsersLoading(true);
        try {
            const params = {};
            if (college) params.college = college;
            if (loc) params.location = loc;
            const res = await axios.get('/api/admin/users', {
                params,
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            setUsersList(res.data.users || []);
        } catch (error) {
            console.error('Failed to fetch users', error);
        } finally {
            setUsersLoading(false);
        }
    };

    const handleSendAdminMessage = async () => {
        if (!messageModalUser || !adminMessageText.trim()) return;
        setSendingMessage(true);
        try {
            await axios.post(`/api/admin/users/${messageModalUser.id}/message`, {
                content: adminMessageText.trim()
            }, { headers: { Authorization: `Bearer ${adminToken}` } });
            alert(`Message sent to ${messageModalUser.username}!`);
            setMessageModalUser(null);
            setAdminMessageText('');
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to send message.');
        } finally {
            setSendingMessage(false);
        }
    };

    const handleIntroduceUsers = async () => {
        if (!userAId || !userBId) {
            alert('Select two users to introduce');
            return;
        }
        setIntroducing(true);
        try {
            const res = await axios.post('/api/admin/users/introduce', {
                userAId: parseInt(userAId, 10),
                userBId: parseInt(userBId, 10),
                note: introNote.trim()
            }, { headers: { Authorization: `Bearer ${adminToken}` } });
            alert(res.data.message || 'Users introduced!');
            setUserAId('');
            setUserBId('');
            setIntroNote('');
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to introduce users.');
        } finally {
            setIntroducing(false);
        }
    };

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
                        className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('users'); fetchAdminUsers(); }}
                    >
                        👥 Users & Campus Match
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

                    {activeTab === 'users' && (
                        <div className="premium-payments-section" style={{ maxWidth: '1100px' }}>
                            <div className="section-header">
                                <div>
                                    <h2>👥 User Directory & Campus Growth</h2>
                                    <p>Filter students by college or city, send direct messages as Campus Guide, and introduce classmates.</p>
                                </div>
                                <button className="add-ad-btn" onClick={() => fetchAdminUsers()}>Refresh</button>
                            </div>

                            {/* Introduce 2 Batchmates Card */}
                            <div className="settings-card" style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🤝 Introduce 2 Batchmates (Automated Match)
                                </h3>
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem 0' }}>
                                    Select two students from the same college. The system will create an introduction message connecting them directly!
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                                    <select
                                        value={userAId}
                                        onChange={(e) => setUserAId(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)' }}
                                    >
                                        <option value="">Select Student A...</option>
                                        {usersList.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.username} ({u.college || 'No college'} - {u.location || 'No city'})
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={userBId}
                                        onChange={(e) => setUserBId(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)' }}
                                    >
                                        <option value="">Select Student B...</option>
                                        {usersList.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.username} ({u.college || 'No college'} - {u.location || 'No city'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        placeholder="Optional personalized note (e.g. Both are in 1st year CS!)..."
                                        value={introNote}
                                        onChange={(e) => setIntroNote(e.target.value)}
                                        style={{ flex: 1, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)' }}
                                    />
                                    <button
                                        onClick={handleIntroduceUsers}
                                        disabled={introducing || !userAId || !userBId}
                                        style={{
                                            background: '#10b981',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '8px 16px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            opacity: (!userAId || !userBId) ? 0.5 : 1
                                        }}
                                    >
                                        {introducing ? 'Connecting...' : '🤝 Introduce Now'}
                                    </button>
                                </div>
                            </div>

                            {/* Filters Bar */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="Filter by College (e.g. Delhi University)..."
                                    value={userCollegeFilter}
                                    onChange={(e) => setUserCollegeFilter(e.target.value)}
                                    style={{ flex: 1, minWidth: '200px', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '8px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)' }}
                                />
                                <input
                                    type="text"
                                    placeholder="Filter by City / Location..."
                                    value={userLocationFilter}
                                    onChange={(e) => setUserLocationFilter(e.target.value)}
                                    style={{ flex: 1, minWidth: '160px', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '8px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)' }}
                                />
                                <button
                                    className="add-ad-btn"
                                    style={{ padding: '8px 16px' }}
                                    onClick={() => fetchAdminUsers(userCollegeFilter, userLocationFilter)}
                                >
                                    🔍 Filter
                                </button>
                                {(userCollegeFilter || userLocationFilter) && (
                                    <button
                                        onClick={() => { setUserCollegeFilter(''); setUserLocationFilter(''); fetchAdminUsers('', ''); }}
                                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer' }}
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {/* Users List */}
                            {usersLoading ? (
                                <p>Loading campus users…</p>
                            ) : usersList.length === 0 ? (
                                <div className="settings-card"><p>No users found matching current filters.</p></div>
                            ) : (
                                <div className="premium-payment-list">
                                    {usersList.map(user => (
                                        <article className="premium-payment-card" key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', border: '2px solid #10b981', overflow: 'hidden' }}>
                                                    {user.avatar ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🎓'}
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <strong>{user.username}</strong>
                                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>@{user.platformId || user.id}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                        {user.college && (
                                                            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                                                🎓 {user.college}
                                                            </span>
                                                        )}
                                                        {user.location && (
                                                            <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                                                📍 {user.location}
                                                            </span>
                                                        )}
                                                        {user.phone && (
                                                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                                                                📞 {user.phone}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="premium-payment-actions">
                                                <button
                                                    style={{ background: 'rgba(0, 153, 255, 0.2)', border: '1px solid #0099ff', color: '#38bdf8', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                                                    onClick={() => { setMessageModalUser(user); setAdminMessageText(''); }}
                                                >
                                                    💬 Message
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}

                            {/* Message Modal */}
                            {messageModalUser && (
                                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                                    <div style={{ background: '#1e1e2f', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                                        <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>
                                            💬 Message {messageModalUser.username}
                                        </h3>
                                        <p style={{ margin: '0 0 1rem 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                                            This message will be delivered from <strong>CHEETCHAT Campus Guide</strong> bot directly to their inbox.
                                        </p>
                                        <textarea
                                            rows={4}
                                            value={adminMessageText}
                                            onChange={(e) => setAdminMessageText(e.target.value)}
                                            placeholder="Write your welcome or introduction note here..."
                                            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', padding: '10px', fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
                                            <button
                                                onClick={() => setMessageModalUser(null)}
                                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer' }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSendAdminMessage}
                                                disabled={sendingMessage || !adminMessageText.trim()}
                                                style={{ background: '#0099ff', border: 'none', color: '#fff', borderRadius: '6px', padding: '8px 16px', fontWeight: 600, cursor: 'pointer', opacity: (!adminMessageText.trim() || sendingMessage) ? 0.6 : 1 }}
                                            >
                                                {sendingMessage ? 'Sending...' : 'Send Message'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
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
