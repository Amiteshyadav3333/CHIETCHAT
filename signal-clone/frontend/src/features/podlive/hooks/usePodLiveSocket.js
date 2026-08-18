import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from '../config';

export default function usePodLiveSocket(sessionId, user) {
    const [viewerCount, setViewerCount] = useState(0);
    const [messages, setMessages] = useState([]);
    const [invite, setInvite] = useState(null);
    const socket = useMemo(() => {
        const token = localStorage.getItem(PODLIVE_STORAGE.token);
        return token ? io(PODLIVE_API_URL, { auth: { token }, transports: ['websocket', 'polling'], autoConnect: false }) : null;
    }, []);

    useEffect(() => {
        if (!socket || !user?.id) return undefined;
        socket.connect();
        socket.emit('register_user');
        if (sessionId) socket.emit('join_chat_room', sessionId);
        const onCount = ({ viewerCount: count }) => setViewerCount(Number(count || 0));
        const onMessage = (message) => setMessages((current) => [...current.slice(-199), message]);
        const onInvite = (data) => setInvite(data);
        const onEnded = () => window.dispatchEvent(new CustomEvent('podlive:ended', { detail: { sessionId } }));
        socket.on('viewer_count_update', onCount);
        socket.on('receive_chat_message', onMessage);
        socket.on('receive_invite', onInvite);
        socket.on('podcast_ended', onEnded);
        return () => {
            if (sessionId) socket.emit('leave_chat_room', sessionId);
            socket.off('viewer_count_update', onCount);
            socket.off('receive_chat_message', onMessage);
            socket.off('receive_invite', onInvite);
            socket.off('podcast_ended', onEnded);
            socket.disconnect();
        };
    }, [sessionId, socket, user?.id]);

    const sendMessage = (message) => socket?.emit('send_chat_message', { sessionId, message, senderHandle: user?.unique_handle });
    return { socket, viewerCount, messages, invite, clearInvite: () => setInvite(null), sendMessage };
}
