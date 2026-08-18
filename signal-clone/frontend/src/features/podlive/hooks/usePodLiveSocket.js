import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from '../config';

export default function usePodLiveSocket(sessionId, user) {
    const [viewerCount, setViewerCount] = useState(0);
    const [messages, setMessages] = useState([]);
    const [invite, setInvite] = useState(null);
    const [inviteStatus, setInviteStatus] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        const token = localStorage.getItem(PODLIVE_STORAGE.token);
        if (!token || !user?.id) return undefined;
        const socket = io(PODLIVE_API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        const join = () => {
            socket.emit('register_user', user.id);
            if (sessionId) socket.emit('join_chat_room', sessionId);
        };
        const onCount = ({ viewerCount: count }) => setViewerCount(Number(count || 0));
        const onMessage = (message) => setMessages((current) => [...current.slice(-199), message]);
        const onInvite = (data) => setInvite(data);
        const onInviteStatus = (data) => setInviteStatus(data);
        const onEnded = () => window.dispatchEvent(new CustomEvent('podlive:ended', { detail: { sessionId } }));
        const onLiveStarted = (live) => window.dispatchEvent(new CustomEvent('podlive:started', { detail: live }));
        socket.on('connect', join);
        socket.on('viewer_count_update', onCount);
        socket.on('receive_chat_message', onMessage);
        socket.on('receive_invite', onInvite);
        socket.on('invite_status', onInviteStatus);
        socket.on('podcast_ended', onEnded);
        socket.on('live_started', onLiveStarted);
        return () => {
            if (sessionId) socket.emit('leave_chat_room', sessionId);
            socket.off('connect', join);
            socket.off('viewer_count_update', onCount);
            socket.off('receive_chat_message', onMessage);
            socket.off('receive_invite', onInvite);
            socket.off('invite_status', onInviteStatus);
            socket.off('podcast_ended', onEnded);
            socket.off('live_started', onLiveStarted);
            socket.disconnect();
            if (socketRef.current === socket) socketRef.current = null;
        };
    }, [sessionId, user?.id]);

    useEffect(() => { setMessages([]); setViewerCount(0); }, [sessionId]);
    const sendMessage = useCallback((message) => socketRef.current?.emit('send_chat_message', { sessionId, message }), [sessionId]);
    const sendInvite = useCallback((handle) => {
        setInviteStatus(null);
        socketRef.current?.emit('send_invite', { sessionId, inviteeHandle: String(handle || '').trim().toLowerCase(), hostId: user?.id });
    }, [sessionId, user?.id]);
    const respondToInvite = useCallback((eventName, data) => socketRef.current?.emit(eventName, data), []);
    return { socket: socketRef.current, viewerCount, messages, invite, inviteStatus, clearInvite: () => setInvite(null), sendMessage, sendInvite, respondToInvite };
}
