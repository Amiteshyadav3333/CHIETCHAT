import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { clearPodLiveSession, ensurePodLiveSession } from './auth/usePodLiveSession';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from './config';

// Keeps the PodLive identity reachable while the user is anywhere in CHEETCHAT.
// Without this bridge, stage invites only arrive after PodLive is already open.
export default function PodLiveInviteBridge({ active, onInvite, onLiveStatus }) {
    useEffect(() => {
        if (!active) return undefined;
        let socket;
        let cancelled = false;
        let refreshTimer;

        const refreshLiveStatus = async () => {
            try {
                const response = await fetch(`${PODLIVE_API_URL}/api/live/active?_fresh=${Date.now()}`, { cache: 'no-store' });
                if (!response.ok) return;
                const lives = await response.json();
                if (!cancelled) onLiveStatus?.(Array.isArray(lives) ? lives.length : 0);
            } catch {
                // Keep the last known status during brief network interruptions.
            }
        };

        const refreshPendingInvite = async (allowSessionRetry = true) => {
            const token = localStorage.getItem(PODLIVE_STORAGE.token);
            if (!token) return;
            try {
                const response = await fetch(`${PODLIVE_API_URL}/api/stage/invites/pending?_fresh=${Date.now()}`, {
                    cache: 'no-store',
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.status === 401 && allowSessionRetry) {
                    clearPodLiveSession();
                    await ensurePodLiveSession({ validate: true });
                    if (!cancelled) await refreshPendingInvite(false);
                    return;
                }
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled && data.invite) onInvite?.(data.invite);
            } catch {
                // The next socket reconnect or scheduled refresh will retry.
            }
        };

        const refreshAll = () => {
            refreshLiveStatus();
            refreshPendingInvite();
        };

        ensurePodLiveSession({ validate: true }).then((user) => {
            if (cancelled || !user?.id) return;
            const token = localStorage.getItem(PODLIVE_STORAGE.token);
            if (!token) return;
            socket = io(PODLIVE_API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
            socket.on('connect', () => {
                socket.emit('register_user', user.id);
                refreshAll();
            });
            socket.on('receive_invite', onInvite);
            socket.on('live_started', refreshLiveStatus);
            socket.on('live_ended', refreshLiveStatus);
        }).catch(() => {});

        refreshAll();
        refreshTimer = window.setInterval(refreshAll, 10000);
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') refreshAll();
        };
        document.addEventListener('visibilitychange', refreshWhenVisible);
        window.addEventListener('online', refreshAll);

        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
            window.removeEventListener('online', refreshAll);
            socket?.off('receive_invite', onInvite);
            socket?.off('live_started', refreshLiveStatus);
            socket?.off('live_ended', refreshLiveStatus);
            socket?.disconnect();
        };
    }, [active, onInvite, onLiveStatus]);

    return null;
}
