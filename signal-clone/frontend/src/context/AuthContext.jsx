import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { disablePushNotifications } from '../utils/pushNotifications';
import { clearAccountEncryptedMessageCaches } from '../utils/encryptedMessageCache';
import { clearChatMetadata } from '../utils/chatMetadataCache';
import { clearReelCache } from '../utils/reelCache';
import { deleteDevicePrivateKey } from '../utils/secureKeyStore';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    const clearLocalSession = () => {
        let storedUserId = null;
        try { storedUserId = JSON.parse(localStorage.getItem('user') || 'null')?.id || null; } catch { /* corrupt cache */ }
        const currentUserId = user?.id || storedUserId;
        clearAccountEncryptedMessageCaches(currentUserId);
        clearChatMetadata(currentUserId);
        clearReelCache(currentUserId);
        if (currentUserId) {
            deleteDevicePrivateKey(currentUserId).catch(() => {});
            localStorage.removeItem(`pubKey_${currentUserId}`);
        }
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('cheetchat_csrf_token');
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        axios.get('/api/auth/me')
            .then(async ({ data }) => {
                if (cancelled) return;
                setUser(data.user);
                setToken('cookie-session');
                localStorage.setItem('user', JSON.stringify(data.user));
                try {
                    const csrf = await axios.get('/api/auth/csrf');
                    if (!cancelled) sessionStorage.setItem('cheetchat_csrf_token', csrf.data.csrfToken);
                } catch { /* csrf endpoint may not be available */ }
            })
            .catch(async (error) => {
                if (cancelled) return;
                // 401 is expected when not logged in - don't treat as error
                if (error.response?.status === 401) {
                    clearLocalSession();
                } else {
                    // Other errors - log but don't crash
                    console.warn('Auth check failed:', error.message);
                    clearLocalSession();
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Handle 401 (Token Expired/Invalid due to server restart)
    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            response => response,
            error => {
                if (error.response && error.response.status === 401) {
                    console.warn("Session expired or invalid, logging out...");
                    clearLocalSession();
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
    }, []);

    const login = (userData, _authToken, csrfToken = null) => {
        setUser(userData);
        setToken('cookie-session');
        localStorage.removeItem('token');
        localStorage.setItem('user', JSON.stringify(userData));
        if (csrfToken) sessionStorage.setItem('cheetchat_csrf_token', csrfToken);
    };

    const updateUser = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = async () => {
        const activeToken = token;
        if (activeToken) {
            try { await disablePushNotifications(activeToken); } catch { /* best-effort cleanup */ }
            try {
                await axios.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${activeToken}` } });
            } catch { /* session may already be revoked */ }
        }
        clearLocalSession();
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
