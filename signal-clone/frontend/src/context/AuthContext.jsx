import React, { createContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { disablePushNotifications } from '../utils/pushNotifications';
import { clearAccountEncryptedMessageCaches } from '../utils/encryptedMessageCache';
import { clearChatMetadata } from '../utils/chatMetadataCache';
import { clearReelCache } from '../utils/reelCache';
import { deleteDevicePrivateKey } from '../utils/secureKeyStore';
import { shouldExpireSession, usableBearerToken } from '../utils/authSession';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const tokenRef = useRef(null);
    const userRef = useRef(null);

    const clearLocalSession = ({ clearDeviceKey = false } = {}) => {
        let storedUserId = null;
        try { storedUserId = JSON.parse(localStorage.getItem('user') || 'null')?.id || null; } catch { /* corrupt cache */ }
        const currentUserId = userRef.current?.id || storedUserId;
        clearAccountEncryptedMessageCaches(currentUserId);
        clearChatMetadata(currentUserId);
        clearReelCache(currentUserId);
        if (clearDeviceKey && currentUserId) {
            deleteDevicePrivateKey(currentUserId).catch(() => {});
            localStorage.removeItem(`pubKey_${currentUserId}`);
        }
        userRef.current = null;
        tokenRef.current = null;
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('cheetchat_legacy_token');
        sessionStorage.removeItem('cheetchat_csrf_token');
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const storedBearer = usableBearerToken(sessionStorage.getItem('cheetchat_legacy_token'));
        axios.get('/api/auth/me', storedBearer ? {
            headers: { Authorization: `Bearer ${storedBearer}` },
        } : undefined)
            .then(async ({ data }) => {
                if (cancelled) return;
                userRef.current = data.user;
                tokenRef.current = storedBearer || 'cookie-session';
                setUser(data.user);
                setToken(storedBearer || 'cookie-session');
                localStorage.setItem('user', JSON.stringify(data.user));
                try {
                    const csrf = await axios.get('/api/auth/csrf');
                    if (!cancelled) sessionStorage.setItem('cheetchat_csrf_token', csrf.data.csrfToken);
                } catch { /* csrf endpoint may not be available */ }
            })
            .catch(async (error) => {
                if (cancelled) return;
                // 401 is expected when not logged in - don't treat as error
                if (error.response?.status === 401) clearLocalSession();
                else {
                    console.warn('Auth check failed:', error.message);
                    setUser(null);
                    setToken(null);
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
                if (shouldExpireSession({
                    status: error.response?.status,
                    requestUrl: error.config?.url,
                    hasSession: Boolean(tokenRef.current),
                })) {
                    console.warn("Session expired or invalid, logging out...");
                    clearLocalSession();
                    if (window.location.pathname !== '/login') {
                        window.history.replaceState({}, '', '/login');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                }
                return Promise.reject(error);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
    }, []);

    const login = (userData, authToken, csrfToken = null) => {
        const bearerToken = usableBearerToken(authToken);
        const sessionToken = bearerToken || 'cookie-session';
        userRef.current = userData;
        tokenRef.current = sessionToken;
        setUser(userData);
        setToken(sessionToken);
        localStorage.removeItem('token');
        localStorage.setItem('user', JSON.stringify(userData));
        if (bearerToken) sessionStorage.setItem('cheetchat_legacy_token', bearerToken);
        else sessionStorage.removeItem('cheetchat_legacy_token');
        if (csrfToken) sessionStorage.setItem('cheetchat_csrf_token', csrfToken);
    };

    const updateUser = (userData) => {
        userRef.current = userData;
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
        clearLocalSession({ clearDeviceKey: true });
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
