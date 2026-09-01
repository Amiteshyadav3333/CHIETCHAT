import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from '../utils/clientRouter';
import './AdminLogin.css';

const AdminLogin = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post('/api/admin/login', {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone,
                password,
                accessCode,
            });

            if (response.data.token) {
                localStorage.setItem('adminToken', response.data.token);
                localStorage.setItem('adminUser', JSON.stringify(response.data.admin));
                navigate('/admin/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-login-container">
            <div className="admin-login-card">
                <div className="admin-login-header">
                    <div className="admin-logo">⚙️</div>
                    <h1>Admin Panel</h1>
                    <p>Saskat AI - Advertisement Management</p>
                </div>

                {error && (
                    <div className="error-message">
                        <span>❌</span>
                        <p>{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="admin-login-form">
                    <div className="form-group"><label htmlFor="name">Admin name</label><input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your registered admin name" required disabled={loading} className="form-input" /></div>
                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@example.com"
                            required
                            disabled={loading}
                            className="form-input"
                        />
                    </div>

                    <div className="form-group"><label htmlFor="phone">Registered mobile number</label><input id="phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" required disabled={loading} className="form-input" /></div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            disabled={loading}
                            className="form-input"
                        />
                    </div>

                    <div className="form-group"><label htmlFor="accessCode">Secret access code</label><input id="accessCode" type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="Admin-only secret code" required disabled={loading} className="form-input" /></div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="login-button"
                    >
                        {loading ? 'Logging in...' : 'Login to Admin Panel'}
                    </button>
                </form>

                <div className="admin-info">
                    <p>🔐 Admin credentials required</p>
                    <p>Contact system administrator for access</p>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
