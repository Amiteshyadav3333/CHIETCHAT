import { useState, useRef, useEffect, useCallback } from 'react';

export const useCallManager = ({ socket, user, chats, activeChat, setActiveChat, fetchChats }) => {
    const [showCallModal, setShowCallModal] = useState(false);
    const [callType, setCallType] = useState('video');
    const [incomingCall, setIncomingCall] = useState(null);
    const [callRingState, setCallRingState] = useState({});
    const preparedCallStreamRef = useRef(null);
    const callStartInFlightRef = useRef(false);
    const showCallModalRef = useRef(showCallModal);

    useEffect(() => {
        showCallModalRef.current = showCallModal;
    }, [showCallModal]);

    const requestCallPermissions = async (type) => {
        if (!navigator.mediaDevices?.getUserMedia) {
            alert('Calling is not supported on this device/browser.');
            return null;
        }
        try {
            const permissionStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: type === 'voice' ? false : {
                    facingMode: 'user',
                    width: { ideal: 960, max: 1280 },
                    height: { ideal: 540, max: 720 },
                    frameRate: { ideal: 24, max: 30 }
                }
            });
            return permissionStream;
        } catch (err) {
            const device = type === 'voice' ? 'microphone' : 'camera and microphone';
            if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
                alert(`Please allow ${device} access in your browser settings, then try the call again.`);
            } else if (err?.name === 'NotFoundError') {
                alert(`No usable ${device} was found on this device.`);
            } else {
                alert(`Could not access the ${device}. Close other apps using them and try again.`);
            }
            return null;
        }
    };

    const startCallForChat = useCallback(async (chat, type = 'video') => {
        if (callStartInFlightRef.current || showCallModalRef.current) return;
        if (!chat?.id || !user?.id || !socket) {
            alert('Call information is still loading. Please try again in a moment.');
            return;
        }
        const participants = Array.isArray(chat.participants)
            ? chat.participants.filter(participant => participant?.id)
            : [];
        if (participants.length === 0) {
            alert('This chat has no available call participants.');
            return;
        }
        callStartInFlightRef.current = true;
        try {
            const preparedStream = await requestCallPermissions(type);
            if (!preparedStream) return;
            preparedCallStreamRef.current?.getTracks().forEach(track => track.stop());
            preparedCallStreamRef.current = preparedStream;
            setActiveChat(chat);
            setCallType(type);
            socket.emit('notify_ring', {
                chatId: chat.id,
                callerName: user.username || 'CHEETCHAT user',
                callerId: user.id,
                participants: participants.map(participant => participant.id),
                callType: type
            });
            setShowCallModal(true);
        } finally {
            callStartInFlightRef.current = false;
        }
    }, [socket, user, setActiveChat]);

    const startCall = useCallback(async (type = 'video') => {
        await startCallForChat(activeChat, type);
    }, [startCallForChat, activeChat]);

    const acceptCall = useCallback(async () => {
        if (incomingCall) {
            const incomingType = incomingCall.callType || 'video';
            const preparedStream = await requestCallPermissions(incomingType);
            if (!preparedStream) return;
            preparedCallStreamRef.current?.getTracks().forEach(track => track.stop());
            preparedCallStreamRef.current = preparedStream;
            let chat = incomingCall.callChat || chats.find(c => c.id === incomingCall.chatId);
            if (!chat && fetchChats) {
                const updatedChats = await fetchChats();
                chat = updatedChats.find(c => c.id === incomingCall.chatId);
            }
            if (chat) {
                setActiveChat(chat);
                setCallType(incomingType);
                setShowCallModal(true);
            } else {
                alert("Could not load chat information for this call.");
            }
            setIncomingCall(null);
        }
    }, [incomingCall, chats, fetchChats, setActiveChat]);

    const rejectCall = useCallback(() => {
        setIncomingCall(null);
    }, []);

    // Socket call events
    useEffect(() => {
        if (!socket) return;

        const handleIncomingCall = (data) => {
            if (!showCallModalRef.current) {
                setIncomingCall(data);
                socket.emit('confirm_ring', { callerId: data.callerId, chatId: data.chatId });
            }
        };

        const handleRingStatus = (data) => {
            setCallRingState(prev => ({ ...prev, [data.chatId]: data.status }));
        };

        const handlePeerRinging = (data) => {
            setCallRingState(prev => ({ ...prev, [data.chatId]: 'ringing' }));
        };

        socket.on('incoming_call', handleIncomingCall);
        socket.on('ring_status', handleRingStatus);
        socket.on('peer_ringing', handlePeerRinging);

        return () => {
            socket.off('incoming_call', handleIncomingCall);
            socket.off('ring_status', handleRingStatus);
            socket.off('peer_ringing', handlePeerRinging);
        };
    }, [socket]);

    return {
        showCallModal, setShowCallModal,
        callType, setCallType,
        incomingCall, setIncomingCall,
        callRingState, setCallRingState,
        preparedCallStreamRef,
        startCallForChat,
        startCall,
        acceptCall,
        rejectCall,
    };
};
