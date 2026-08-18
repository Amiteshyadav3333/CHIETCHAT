import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { ensurePodLiveSession } from './auth/usePodLiveSession';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from './config';

// Keeps the PodLive identity reachable while the user is anywhere in CHEETCHAT.
// Without this bridge, stage invites only arrive after PodLive is already open.
export default function PodLiveInviteBridge({ active, onInvite }) {
    useEffect(() => {
        if (!active) return undefined;
        let socket;
        let cancelled = false;

        ensurePodLiveSession().then((user) => {
            if (cancelled || !user?.id) return;
            const token = localStorage.getItem(PODLIVE_STORAGE.token);
            if (!token) return;
            socket = io(PODLIVE_API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
            socket.on('connect', () => socket.emit('register_user', user.id));
            socket.on('receive_invite', onInvite);
        }).catch(() => {});

        return () => {
            cancelled = true;
            socket?.off('receive_invite', onInvite);
            socket?.disconnect();
        };
    }, [active, onInvite]);

    return null;
}
