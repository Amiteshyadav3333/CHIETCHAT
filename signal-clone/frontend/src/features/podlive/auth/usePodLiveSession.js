import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from '../config';

let pendingSession = null;

const readUser = () => {
    try { return JSON.parse(localStorage.getItem(PODLIVE_STORAGE.user) || 'null'); } catch { return null; }
};

export const clearPodLiveSession = () => Object.values(PODLIVE_STORAGE).forEach((key) => localStorage.removeItem(key));

const saveSession = (data) => {
    localStorage.setItem(PODLIVE_STORAGE.token, data.accessToken);
    localStorage.setItem(PODLIVE_STORAGE.refreshToken, data.refreshToken);
    localStorage.setItem(PODLIVE_STORAGE.user, JSON.stringify(data.user));
    return data.user;
};

const exchangeCheetchatSession = async () => {
    const { data: ticketData } = await axios.post('/api/auth/podlive-sso');
    const { data } = await axios.post(
        `${PODLIVE_API_URL}/api/auth/sso/cheetchat`,
        { ticket: ticketData.ticket },
        { withCredentials: false, timeout: 15000 },
    );
    return saveSession(data);
};

export const ensurePodLiveSession = ({ validate = false } = {}) => {
    if (pendingSession) return pendingSession;
    pendingSession = (async () => {
        const token = localStorage.getItem(PODLIVE_STORAGE.token);
        const cachedUser = readUser();
        if (token && cachedUser && !validate) return cachedUser;
        if (token) {
            try {
                const { data: profile } = await axios.get(`${PODLIVE_API_URL}/api/user/profile`, {
                    headers: { Authorization: `Bearer ${token}` }, withCredentials: false, timeout: 10000,
                });
                localStorage.setItem(PODLIVE_STORAGE.user, JSON.stringify(profile));
                return profile;
            } catch (error) {
                if (error?.response?.status !== 401) throw error;
                clearPodLiveSession();
            }
        }
        return exchangeCheetchatSession();
    })().finally(() => { pendingSession = null; });
    return pendingSession;
};

export const primePodLiveSession = () => ensurePodLiveSession().catch(() => null);

export default function usePodLiveSession(active) {
    const cachedUser = readUser();
    const [state, setState] = useState({ loading: !cachedUser, user: cachedUser, error: '' });
    const connect = useCallback(async () => {
        setState((current) => ({ ...current, loading: !current.user, error: '' }));
        try {
            const user = await ensurePodLiveSession({ validate: true });
            setState({ loading: false, user, error: '' });
        } catch (error) {
            clearPodLiveSession();
            setState({ loading: false, user: null, error: error?.response?.data?.error || 'PodLive could not connect to your CHEETCHAT account.' });
        }
    }, []);
    useEffect(() => { if (active) connect(); }, [active, connect]);
    return { ...state, retry: connect };
}
