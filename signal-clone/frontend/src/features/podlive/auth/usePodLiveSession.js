import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from '../config';

const readUser = () => {
    try { return JSON.parse(localStorage.getItem(PODLIVE_STORAGE.user) || 'null'); } catch { return null; }
};

export const clearPodLiveSession = () => Object.values(PODLIVE_STORAGE).forEach((key) => localStorage.removeItem(key));

export default function usePodLiveSession(active) {
    const [state, setState] = useState({ loading: true, user: readUser(), error: '' });
    const connect = useCallback(async () => {
        setState((current) => ({ ...current, loading: true, error: '' }));
        try {
            const existingToken = localStorage.getItem(PODLIVE_STORAGE.token);
            if (existingToken) {
                const { data: profile } = await axios.get(`${PODLIVE_API_URL}/api/user/profile`, {
                    headers: { Authorization: `Bearer ${existingToken}` }, withCredentials: false,
                });
                localStorage.setItem(PODLIVE_STORAGE.user, JSON.stringify(profile));
                setState({ loading: false, user: profile, error: '' });
                return;
            }
            const { data: ticketData } = await axios.post('/api/auth/podlive-sso');
            const { data } = await axios.post(`${PODLIVE_API_URL}/api/auth/sso/cheetchat`, { ticket: ticketData.ticket }, { withCredentials: false });
            localStorage.setItem(PODLIVE_STORAGE.token, data.accessToken);
            localStorage.setItem(PODLIVE_STORAGE.refreshToken, data.refreshToken);
            localStorage.setItem(PODLIVE_STORAGE.user, JSON.stringify(data.user));
            setState({ loading: false, user: data.user, error: '' });
        } catch (error) {
            clearPodLiveSession();
            setState({ loading: false, user: null, error: error?.response?.data?.error || 'PodLive could not connect to your CHEETCHAT account.' });
        }
    }, []);
    useEffect(() => { if (active) connect(); }, [active, connect]);
    return { ...state, retry: connect };
}
