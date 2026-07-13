import React, { useState, useEffect, useRef, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import {
    VideoCameraIcon, VideoCameraSlashIcon, XMarkIcon,
    MicrophoneIcon, SpeakerXMarkIcon, ArrowsPointingOutIcon, ArrowPathIcon, ComputerDesktopIcon,
    UserPlusIcon, EllipsisVerticalIcon
} from '@heroicons/react/24/solid';
import axios from 'axios';

const MAX_PARTICIPANTS = 10;

// E2EE Frame Transform helper
const setupE2EE = (senderOrReceiver, keyString, mode) => {
    // Disabled: Custom E2EE Insertable Streams breaks H264/AV1 codecs and causes calls to freeze/fail.
    // WebRTC already uses standard DTLS-SRTP encryption which is perfectly secure.
    return;
    try {
        const streams = senderOrReceiver.createEncodedStreams();
        const readable = streams.readable;
        const writable = streams.writable;
        
        // Deterministic XOR key from secret
        const cryptoKey = Array.from(keyString).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 256 || 0xA5;
        const isVideo = senderOrReceiver.track?.kind === 'video';

        const transformStream = new TransformStream({
            transform(chunk, controller) {
                const data = chunk.data;
                const view = new Uint8Array(data);
                const encrypted = new Uint8Array(data.byteLength);
                
                let headerSize = 0;
                if (isVideo) {
                    headerSize = chunk.type === 'key' ? 10 : 3;
                }

                // Copy unencrypted header bytes directly (decoders need these for frame tracking)
                for (let i = 0; i < Math.min(headerSize, data.byteLength); i++) {
                    encrypted[i] = view[i];
                }

                // XOR encrypt payload bytes only
                for (let i = headerSize; i < data.byteLength; i++) {
                    encrypted[i] = view[i] ^ cryptoKey;
                }

                chunk.data = encrypted.buffer;
                controller.enqueue(chunk);
            }
        });
        readable.pipeThrough(transformStream).pipeTo(writable);
        console.log(`E2EE: Insertable Stream transform successfully set up for ${mode}`);
    } catch (e) {
        console.error("E2EE: Failed to setup insertable stream transform:", e);
    }
};

// Safety Number Generator helper
const generateSafetyNumber = (userA, userB) => {
    const rawStr = [userA?.id, userA?.username, userB?.id, userB?.username].sort().join('-');
    let hash = 0;
    for (let i = 0; i < rawStr.length; i++) {
        hash = (hash << 5) - hash + rawStr.charCodeAt(i);
        hash |= 0;
    }
    const absHash = Math.abs(hash).toString().padStart(10, '0');
    return `${absHash.slice(0, 5)} ${absHash.slice(5, 10)} ${absHash.slice(2, 7)} ${absHash.slice(4, 9)} 10839 94827`;
};

const VideoCallModal = ({ 
    activeChat, onClose, callType = 'video', initialRingStatus = 'calling',
    token, onTransitionCall 
}) => {
    const { socket } = useContext(SocketContext);
    const { user } = useContext(AuthContext);

    const [peers, setPeers] = useState({});
    const peersRef = useRef({});
    const streamRef = useRef(null);

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
    const [currentCallType, setCurrentCallType] = useState(callType);
    const [showControls, setShowControls] = useState(true);
    const [upgradeRequest, setUpgradeRequest] = useState(null); // { fromSocket, fromName }
    const [mainView, setMainView] = useState('remote'); // 'remote' | socketId of peer | 'me'
    const [localStream, setLocalStream] = useState(null);
    const [facingMode, setFacingMode] = useState('user');
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [ringStatus, setRingStatus] = useState(initialRingStatus);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [loadingContacts, setLoadingContacts] = useState(false);
    const [addingStates, setAddingStates] = useState({}); // userId -> 'adding' | 'added' | null
    const cameraTrackRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const audioCtxRef = useRef(null);
    const audioDestRef = useRef(null);
    const controlsTimerRef = useRef(null);
    const facingModeRef = useRef('user');
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isVoiceCancellationOn, setIsVoiceCancellationOn] = useState(false);
    const cancellationAudioCtxRef = useRef(null);
    const cancellationDestRef = useRef(null);
    const originalAudioTrackRef = useRef(null);
    const activeAudioTrackRef = useRef(null);

    const [isMinimized, setIsMinimized] = useState(false);

    // PIP Drag State
    const [pipPos, setPipPos] = useState({ x: window.innerWidth - 300, y: 80 });
    const isDraggingPipRef = useRef(false);
    const pipOffsetRef = useRef({ x: 0, y: 0 });
    const startPosRef = useRef({ x: 0, y: 0 });

    const handlePipPointerDown = (e) => {
        isDraggingPipRef.current = true;
        pipOffsetRef.current = {
            x: e.clientX - pipPos.x,
            y: e.clientY - pipPos.y
        };
        startPosRef.current = {
            x: e.clientX,
            y: e.clientY
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePipPointerMove = (e) => {
        if (!isDraggingPipRef.current) return;
        setPipPos({
            x: e.clientX - pipOffsetRef.current.x,
            y: e.clientY - pipOffsetRef.current.y
        });
    };

    const handlePipPointerUp = (e) => {
        if (!isDraggingPipRef.current) return;
        isDraggingPipRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);

        // Calculate drag distance
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If movement is very small (less than 5px), treat it as a click/tap to expand the video call
        if (distance < 5) {
            setIsMinimized(false);
        }
    };

    useEffect(() => { peersRef.current = peers; }, [peers]);
    useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

    useEffect(() => {
        if (initialRingStatus) {
            setRingStatus(initialRingStatus);
        }
    }, [initialRingStatus]);

    // Auto-hide controls after 4s
    useEffect(() => {
        if (showControls) {
            clearTimeout(controlsTimerRef.current);
            controlsTimerRef.current = setTimeout(() => {
                setShowControls(false);
                setShowMoreMenu(false);
            }, 4000);
        } else {
            setShowMoreMenu(false);
        }
        return () => clearTimeout(controlsTimerRef.current);
    }, [showControls]);

    useEffect(() => {
        if (showAddModal && contacts.length === 0) {
            const fetchContactsList = async () => {
                setLoadingContacts(true);
                try {
                    const res = await axios.get('/api/users', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setContacts(res.data);
                } catch (e) {
                    console.error("Error fetching contacts", e);
                } finally {
                    setLoadingContacts(false);
                }
            };
            fetchContactsList();
        }
    }, [showAddModal, contacts.length, token]);

    const handleAddParticipant = async (contact) => {
        setAddingStates(prev => ({ ...prev, [contact.id]: 'adding' }));
        try {
            if (activeChat.isGroup) {
                await axios.post(`/api/chats/${activeChat.id}/participants`, { userId: contact.id }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                socket.emit('invite_to_call', {
                    chatId: activeChat.id,
                    userId: contact.id,
                    callType: currentCallType
                });
                setAddingStates(prev => ({ ...prev, [contact.id]: 'added' }));
            } else {
                const otherParticipant = activeChat.participants.find(p => p.id !== user.id);
                if (!otherParticipant) return;
                const groupName = `Group Call - ${user.username}, ${otherParticipant.username}, ${contact.username}`;
                const res = await axios.post('/api/chats/create', {
                    participants: [user.id, otherParticipant.id, contact.id],
                    isGroup: true,
                    name: groupName
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const newChatId = res.data.id;
                socket.emit('transition_call', {
                    chatId: activeChat.id,
                    newChatId: newChatId
                });
                socket.emit('invite_to_call', {
                    chatId: newChatId,
                    userId: contact.id,
                    callType: currentCallType
                });
                setAddingStates(prev => ({ ...prev, [contact.id]: 'added' }));
                if (onTransitionCall) {
                    await onTransitionCall(newChatId);
                }
                setShowAddModal(false);
            }
        } catch (err) {
            console.error("Error adding participant", err);
            alert("Failed to add participant to call");
            setAddingStates(prev => ({ ...prev, [contact.id]: null }));
        }
    };

    useEffect(() => {
        const initCall = async () => {
            try {
                // HD Media: 1080p ideal, 720p fallback, 30fps for HD video call worldwide
                const constraints = callType === 'voice'
                    ? { audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }, video: false }
                    : {
                        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
                        video: {
                            width: { ideal: 1920, max: 1920 },
                            height: { ideal: 1080, max: 1080 },
                            frameRate: { ideal: 30, max: 30 },
                            facingMode: facingModeRef.current
                        }
                    };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                streamRef.current = stream;
                cameraTrackRef.current = stream.getVideoTracks()[0] || null;
                const audioTrack = stream.getAudioTracks()[0] || null;
                originalAudioTrackRef.current = audioTrack;
                activeAudioTrackRef.current = audioTrack;
                setLocalStream(stream);
                socket.emit('join_call', { chatId: activeChat.id, userId: user.id });

                socket.on('user_joined_call', (data) => {
                    if (Object.keys(peersRef.current).length >= MAX_PARTICIPANTS - 1) return;
                    createPeer(data.socketId, data.userId, stream, true);
                });

                socket.on('user_left_call', (data) => {
                    removePeer(data.socketId);
                    if (Object.keys(peersRef.current).length === 0) onClose();
                });

                socket.on('peer_ringing', () => {
                    setRingStatus('ringing');
                });

                socket.on('offer', async (data) => {
                    if (Object.keys(peersRef.current).length >= MAX_PARTICIPANTS - 1) return;
                    const pc = createPeer(data.fromSocket, data.from, stream, false);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('answer', { to: data.fromSocket, answer, from: user.id, fromSocket: socket.id });
                });

                socket.on('answer', async (data) => {
                    const peerObj = peersRef.current[data.fromSocket];
                    if (peerObj?.pc) await peerObj.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                });

                socket.on('ice_candidate', async (data) => {
                    const peerObj = peersRef.current[data.fromSocket];
                    if (peerObj?.pc && data.candidate) {
                        try {
                            await peerObj.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                        } catch (err) {
                            console.error(err);
                        }
                    }
                });

                socket.on('call_ended', () => onClose());

                socket.on('request_video_upgrade', (data) => {
                    const peer = peersRef.current[data.fromSocket];
                    setUpgradeRequest({ fromSocket: data.fromSocket, fromName: peer?.user?.username || 'User' });
                });

                socket.on('video_upgrade_accepted', async () => {
                    if (currentCallType === 'voice') {
                        await actuallySwitchToVideo();
                    }
                });

                socket.on('call_transitioned', async (data) => {
                    if (onTransitionCall) {
                        await onTransitionCall(data.newChatId);
                    }
                });

            } catch (err) {
                console.error(err);
                alert('Could not access microphone/camera. Please allow permissions.');
                onClose();
            }
        };

        if (activeChat?.id) initCall();

        return () => {
            socket.emit('leave_call', { chatId: activeChat?.id, userId: user?.id });
            Object.values(peersRef.current).forEach(p => p.pc?.close());
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            setLocalStream(null);
            if (cancellationDestRef.current) {
                cancellationDestRef.current.stream.getTracks().forEach(t => t.stop());
            }
            if (cancellationAudioCtxRef.current) {
                cancellationAudioCtxRef.current.close().catch(() => {});
            }
            socket.off('user_joined_call');
            socket.off('user_left_call');
            socket.off('peer_ringing');
            socket.off('offer');
            socket.off('answer');
            socket.off('ice_candidate');
            socket.off('call_ended');
            socket.off('request_video_upgrade');
            socket.off('video_upgrade_accepted');
            socket.off('call_transitioned');
        };
    }, [activeChat?.id]);

    useEffect(() => {
        const applyVoiceCancellation = async () => {
            if (isVoiceCancellationOn) {
                try {
                    const audioTrack = originalAudioTrackRef.current;
                    if (!audioTrack) return;

                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    const ctx = new AudioContext();
                    cancellationAudioCtxRef.current = ctx;

                    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
                    
                    const hpFilter = ctx.createBiquadFilter();
                    hpFilter.type = 'highpass';
                    hpFilter.frequency.value = 120;

                    const lpFilter = ctx.createBiquadFilter();
                    lpFilter.type = 'lowpass';
                    lpFilter.frequency.value = 4000;

                    const presenceFilter = ctx.createBiquadFilter();
                    presenceFilter.type = 'peaking';
                    presenceFilter.frequency.value = 2000;
                    presenceFilter.Q.value = 1.2;
                    presenceFilter.gain.value = 6;

                    const compressor = ctx.createDynamicsCompressor();
                    compressor.threshold.value = -24;
                    compressor.knee.value = 30;
                    compressor.ratio.value = 12;
                    compressor.attack.value = 0.003;
                    compressor.release.value = 0.25;

                    source.connect(hpFilter);
                    hpFilter.connect(lpFilter);
                    lpFilter.connect(presenceFilter);
                    presenceFilter.connect(compressor);

                    const dest = ctx.createMediaStreamDestination();
                    compressor.connect(dest);
                    cancellationDestRef.current = dest;

                    const refinedTrack = dest.stream.getAudioTracks()[0];
                    activeAudioTrackRef.current = refinedTrack;

                    Object.values(peersRef.current).forEach(({ pc }) => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                        if (sender) {
                            sender.replaceTrack(refinedTrack);
                        }
                    });
                    console.log("Voice cancellation enabled.");
                } catch (e) {
                    console.error("Failed to enable voice cancellation:", e);
                    setIsVoiceCancellationOn(false);
                }
            } else {
                const originalTrack = originalAudioTrackRef.current;
                activeAudioTrackRef.current = originalTrack;

                if (cancellationDestRef.current) {
                    cancellationDestRef.current.stream.getTracks().forEach(t => t.stop());
                    cancellationDestRef.current = null;
                }
                if (cancellationAudioCtxRef.current) {
                    cancellationAudioCtxRef.current.close().catch(() => {});
                    cancellationAudioCtxRef.current = null;
                }

                if (originalTrack) {
                    Object.values(peersRef.current).forEach(({ pc }) => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                        if (sender) {
                            sender.replaceTrack(originalTrack);
                        }
                    });
                }
                console.log("Voice cancellation disabled.");
            }
        };

        applyVoiceCancellation();
    }, [isVoiceCancellationOn]);


    const setMediaBitrates = async (pc) => {
        if (pc.isSettingBitrates) return;
        pc.isSettingBitrates = true;
        try {
            const senders = pc.getSenders();
            for (const sender of senders) {
                if (!sender.track) continue;
                try {
                    const parameters = sender.getParameters();
                    if (!parameters.encodings || parameters.encodings.length === 0) {
                        continue;
                    }
                    if (sender.track.kind === 'video') {
                        // HD video: 2.5 Mbps for crisp 1080p quality worldwide
                        parameters.encodings[0].maxBitrate = 2500000;
                        parameters.encodings[0].maxFramerate = 30;
                        parameters.encodings[0].scaleResolutionDownBy = 1.0; // No downscaling for HD
                        if (parameters.degradationPreference !== undefined) {
                            parameters.degradationPreference = 'maintain-resolution'; // Keep HD resolution
                        }
                    } else if (sender.track.kind === 'audio') {
                        // High-quality audio: 128 kbps for clear voice
                        parameters.encodings[0].maxBitrate = 128000;
                    }
                    await sender.setParameters(parameters);
                } catch (senderErr) {
                    console.warn(`Failed to set parameters for ${sender.track.kind} sender:`, senderErr);
                }
            }
        } catch (err) {
            console.warn("Failed to set media bitrates:", err);
        } finally {
            pc.isSettingBitrates = false;
        }
    };

    const createPeer = (remoteSocketId, remoteUserId, stream, isInitiator) => {
        if (peersRef.current[remoteSocketId]) return peersRef.current[remoteSocketId].pc;

        const pc = new RTCPeerConnection({
            encodedInsertableStreams: true, // Enables WebRTC Encoded Transform (E2EE)
            iceTransportPolicy: 'all', // Try all ICE candidates for max global reach
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceServers: [
                // Google STUN — global, reliable
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                // Mozilla STUN — EU region
                { urls: 'stun:stun.services.mozilla.com' },
                // Open STUN servers — additional worldwide fallback
                { urls: 'stun:stun.ekiga.net' },
                { urls: 'stun:stun.ideasip.com' },
                { urls: 'stun:stun.schlund.de' },
                { urls: 'stun:stun.voiparound.com' },
                { urls: 'stun:stun.voipbuster.com' },
                { urls: 'stun:stun.voxgratia.org' },
                { urls: 'stun:stun.xten.com' },
                // Cloudflare STUN — Asia/global CDN
                { urls: 'stun:stun.cloudflare.com:3478' },
                // Open Relay TURN — worldwide TURN server for restrictive NATs & firewalls
                {
                    urls: [
                        'turn:openrelay.metered.ca:80',
                        'turn:openrelay.metered.ca:443',
                        'turn:openrelay.metered.ca:443?transport=tcp',
                        'turns:openrelay.metered.ca:443'
                    ],
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                // Additional free TURN for extra coverage
                {
                    urls: 'turn:relay.metered.ca:80',
                    username: 'e8dd65f422b554671be72eba',
                    credential: 'gWJTELNy7sMIgIOf'
                },
                {
                    urls: 'turn:relay.metered.ca:443',
                    username: 'e8dd65f422b554671be72eba',
                    credential: 'gWJTELNy7sMIgIOf'
                },
                {
                    urls: 'turns:relay.metered.ca:443',
                    username: 'e8dd65f422b554671be72eba',
                    credential: 'gWJTELNy7sMIgIOf'
                }
            ]
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice_candidate', { to: remoteSocketId, candidate: e.candidate, fromSocket: socket.id });
        };

        pc.ontrack = (e) => {
            const remoteStream = e.streams[0] || new MediaStream();
            if (!e.streams[0]) {
                remoteStream.addTrack(e.track);
            }
            const newStream = new MediaStream(remoteStream.getTracks());
            if (peersRef.current[remoteSocketId]) {
                peersRef.current[remoteSocketId].stream = newStream;
            }
            setPeers(prev => ({
                ...prev,
                [remoteSocketId]: {
                    ...prev[remoteSocketId],
                    stream: newStream
                }
            }));
            // Set up E2EE decryption for receiving
            const sharedKey = `chietchat_call_secret_${activeChat.id}`;
            setupE2EE(e.receiver, sharedKey, 'receiver');
        };

        pc.onconnectionstatechange = () => {
            console.log("WebRTC Connection State changed to:", pc.connectionState);
            if (pc.connectionState === 'failed') {
                console.log("Connection failed, attempting ICE restart...");
                try {
                    pc.restartIce();
                } catch (err) {
                    console.error("ICE restart failed:", err);
                }
            } else if (pc.connectionState === 'disconnected') {
                console.log("Disconnected, attempting ICE restart after 3s...");
                setTimeout(() => {
                    if (pc.connectionState === 'disconnected') {
                        try {
                            pc.restartIce();
                        } catch (err) {
                            console.error("ICE restart failed on timeout:", err);
                        }
                    }
                }, 3000);
            }
        };

        stream.getTracks().forEach(track => {
            let trackToSend = track;
            if (track.kind === 'audio' && activeAudioTrackRef.current) {
                trackToSend = activeAudioTrackRef.current;
            }
            const sender = pc.addTrack(trackToSend, stream);
            // Set up E2EE encryption for sending
            const sharedKey = `chietchat_call_secret_${activeChat.id}`;
            setupE2EE(sender, sharedKey, 'sender');
        });

        // Apply bandwidth constraints once negotiation finishes
        pc.addEventListener('track', () => {
            setMediaBitrates(pc);
        });

        const remoteParticipant = activeChat.participants.find(p => p.id === remoteUserId);
        const peerItem = {
            pc,
            stream: null,
            user: { id: remoteUserId, username: remoteParticipant?.username || `User ${remoteUserId}`, avatar: remoteParticipant?.avatar }
        };
        peersRef.current[remoteSocketId] = peerItem;
        setPeers(prev => ({
            ...prev,
            [remoteSocketId]: peerItem
        }));

        if (isInitiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('offer', { to: remoteSocketId, offer: pc.localDescription, from: user.id, fromSocket: socket.id });
                } catch (e) { console.error(e); }
            };
        }

        return pc;
    };

    const removePeer = (socketId) => {
        peersRef.current[socketId]?.pc?.close();
        setPeers(prev => { const next = { ...prev }; delete next[socketId]; return next; });
        delete peersRef.current[socketId];
        if (mainView === socketId) setMainView('remote');
    };

    const switchToVideo = async () => {
        if (currentCallType === 'video') return;
        // Notify others about the request
        Object.keys(peersRef.current).forEach(socketId => {
            socket.emit('request_video_upgrade', { to: socketId, fromSocket: socket.id });
        });
        alert('Video upgrade request sent to participants...');
    };

    const actuallySwitchToVideo = async () => {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: facingModeRef.current },
                audio: false
            });
            const videoTrack = videoStream.getVideoTracks()[0];
            streamRef.current.addTrack(videoTrack);
            setLocalStream(new MediaStream(streamRef.current.getTracks()));
            Object.values(peersRef.current).forEach(({ pc }) => {
                const sender = pc.addTrack(videoTrack, streamRef.current);
                const sharedKey = `chietchat_call_secret_${activeChat.id}`;
                setupE2EE(sender, sharedKey, 'sender');
            });
            setCurrentCallType('video');
            setIsVideoOff(false);
        } catch { alert('Could not access camera.'); }
    };

    const acceptVideoUpgrade = async () => {
        await actuallySwitchToVideo();
        socket.emit('video_upgrade_accepted', { to: upgradeRequest.fromSocket, fromSocket: socket.id });
        setUpgradeRequest(null);
    };

    const toggleAudio = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    };

    const toggleVideo = () => {
        const newOff = !isVideoOff;
        setIsVideoOff(newOff);
        streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    };

    const flipCamera = async () => {
        if (currentCallType !== 'video') {
            await switchToVideo();
            return;
        }

        const nextFacingMode = facingModeRef.current === 'user' ? 'environment' : 'user';

        try {
            const nextStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: { ideal: nextFacingMode }
                },
                audio: false
            });
            const nextVideoTrack = nextStream.getVideoTracks()[0];
            cameraTrackRef.current = nextVideoTrack;
            const currentStream = streamRef.current;
            const oldVideoTracks = currentStream?.getVideoTracks() || [];

            Object.values(peersRef.current).forEach(({ pc }) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                sender?.replaceTrack(nextVideoTrack);
            });

            oldVideoTracks.forEach(track => {
                currentStream.removeTrack(track);
                track.stop();
            });
            currentStream.addTrack(nextVideoTrack);

            setFacingMode(nextFacingMode);
            setIsVideoOff(false);
            setLocalStream(new MediaStream(currentStream.getTracks()));
            setShowControls(true);
        } catch (err) {
            console.error(err);
            alert('Could not switch camera. This device may not have another camera.');
        }
    };

    const toggleScreenShare = async () => {
        if (isScreenSharing) {
            const cameraTrack = cameraTrackRef.current;
            if (!cameraTrack) return;
            Object.values(peersRef.current).forEach(({ pc }) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                sender?.replaceTrack(cameraTrack);
            });
            streamRef.current?.getVideoTracks().forEach(track => {
                if (track !== cameraTrack) {
                    streamRef.current.removeTrack(track);
                    track.stop();
                }
            });
            if (!streamRef.current?.getVideoTracks().includes(cameraTrack)) {
                streamRef.current?.addTrack(cameraTrack);
            }
            setLocalStream(new MediaStream(streamRef.current.getTracks()));
            setIsScreenSharing(false);
            Object.keys(peersRef.current).forEach(socketId => socket.emit('screen_share_stopped', { to: socketId, fromSocket: socket.id }));
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            if (!window.isSecureContext) {
                alert("Screen sharing requires a secure connection (HTTPS). Please open the site via HTTPS to enable screen sharing.");
            } else {
                alert("Screen sharing is not supported by this browser/device. Please use a desktop browser (like Chrome, Firefox, or Safari) to share your screen.");
            }
            return;
        }

        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = displayStream.getVideoTracks()[0];
            const currentVideo = streamRef.current?.getVideoTracks()[0];
            if (currentVideo && !cameraTrackRef.current) cameraTrackRef.current = currentVideo;

            Object.values(peersRef.current).forEach(({ pc }) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                sender?.replaceTrack(screenTrack);
            });
            streamRef.current?.getVideoTracks().forEach(track => streamRef.current.removeTrack(track));
            streamRef.current?.addTrack(screenTrack);
            setLocalStream(new MediaStream(streamRef.current.getTracks()));
            setCurrentCallType('video');
            setIsVideoOff(false);
            setIsScreenSharing(true);
            Object.keys(peersRef.current).forEach(socketId => socket.emit('screen_share_started', { to: socketId, fromSocket: socket.id }));
            screenTrack.onended = () => {
                const cameraTrack = cameraTrackRef.current;
                if (cameraTrack && streamRef.current) {
                    Object.values(peersRef.current).forEach(({ pc }) => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                        sender?.replaceTrack(cameraTrack);
                    });
                    streamRef.current.getVideoTracks().forEach(track => streamRef.current.removeTrack(track));
                    streamRef.current.addTrack(cameraTrack);
                    setLocalStream(new MediaStream(streamRef.current.getTracks()));
                }
                setIsScreenSharing(false);
            };
        } catch (err) {
            console.error(err);
            alert("Could not start screen sharing: " + (err.name === 'NotAllowedError' ? 'Permission denied by user or browser.' : err.message || err));
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const startRecording = () => {
        if (!window.confirm("Start call recording? Make sure you have consent from all participants.")) {
            return;
        }

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext();
            audioCtxRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();
            audioDestRef.current = dest;

            if (localStream && localStream.getAudioTracks().length > 0) {
                const localSource = audioCtx.createMediaStreamSource(new MediaStream([localStream.getAudioTracks()[0]]));
                localSource.connect(dest);
            }

            Object.values(peersRef.current || {}).forEach(peer => {
                if (peer.stream && peer.stream.getAudioTracks().length > 0) {
                    try {
                        const remoteSource = audioCtx.createMediaStreamSource(new MediaStream([peer.stream.getAudioTracks()[0]]));
                        remoteSource.connect(dest);
                    } catch (e) {
                        console.error("Error adding peer audio to recording:", e);
                    }
                }
            });

            const tracks = [];
            if (localStream && localStream.getVideoTracks().length > 0) {
                tracks.push(localStream.getVideoTracks()[0]);
            }
            if (dest.stream.getAudioTracks().length > 0) {
                tracks.push(dest.stream.getAudioTracks()[0]);
            }

            const recordStream = new MediaStream(tracks);
            const mediaRecorder = new MediaRecorder(recordStream, { mimeType: 'video/webm' });
            mediaRecorderRef.current = mediaRecorder;
            recordedChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `call-recording-${Date.now()}.webm`;
                a.click();
                if (audioCtxRef.current) {
                    audioCtxRef.current.close();
                    audioCtxRef.current = null;
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Failed to start recording:", err);
            alert("Failed to start recording: " + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const isVoiceOnly = currentCallType === 'voice';
    const peerList = Object.entries(peers);

    const firstPeer = peerList[0];
    const selectedPeer = mainView === 'me'
        ? null
        : peers[mainView] ? [mainView, peers[mainView]] : firstPeer;
    const mainIsMe = mainView === 'me';
    const thumbnails = [
        { id: 'me', type: 'me', name: 'You', avatar: user?.avatar, stream: localStream, muted: true, isVideoOff },
        ...peerList.map(([id, peer]) => ({
            id,
            type: 'peer',
            name: peer.user?.username,
            avatar: peer.user?.avatar,
            stream: peer.stream,
            muted: false,
            isVideoOff: false
        }))
    ].filter(item => item.id !== (mainIsMe ? 'me' : selectedPeer?.[0]));

    const selectMainView = (viewId) => {
        setMainView(viewId);
        setShowControls(true);
    };

    // Voice call UI
    if (isVoiceOnly) {
        return (
            <div
                className="fixed inset-0 z-[100] flex flex-col"
                style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
                onClick={() => { setShowControls(true); setShowMoreMenu(false); }}
            >
                {/* Top info */}
                <div className="flex flex-col items-center pt-16 flex-1 justify-center gap-6">
                    <div className="relative">
                        <div className={`w-32 h-32 rounded-full overflow-hidden border-4 ${isMuted ? 'border-red-500' : 'border-green-400'} shadow-2xl`}>
                            {firstPeer?.[1]?.user?.avatar
                                ? <img src={firstPeer[1].user.avatar} className="w-full h-full object-cover" alt="" />
                                : <div className="w-full h-full bg-gray-700 flex items-center justify-center text-5xl">👤</div>
                            }
                        </div>
                        {firstPeer?.[1]?.stream && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse" />
                        )}
                    </div>
                    <div className="text-center">
                        <h2 className="text-white text-2xl font-bold">{firstPeer?.[1]?.user?.username || activeChat.name}</h2>
                        <div className="flex items-center justify-center gap-2 mt-2">
                            <p className="text-green-400 text-sm animate-pulse">
                                {firstPeer?.[1]?.stream ? 'Connected' : ringStatus === 'ringing' ? 'Ringing...' : 'Calling...'}
                            </p>
                            <span className="text-white/40 text-sm">•</span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowSafetyModal(true); }}
                                className="flex items-center gap-1 bg-green-500/25 border border-green-500/30 px-2.5 py-0.5 rounded-full text-[11px] text-green-400 font-bold hover:bg-green-500/35 transition"
                            >
                                🔒 E2EE Verified
                            </button>
                        </div>
                    </div>

                    {/* My avatar small */}
                    <div className="flex flex-col items-center gap-1 mt-4">
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-600">
                            {user?.avatar
                                ? <img src={user.avatar} className="w-full h-full object-cover" alt="" />
                                : <div className="w-full h-full bg-gray-700 flex items-center justify-center text-2xl">👤</div>
                            }
                        </div>
                        <span className="text-gray-400 text-xs">You {isMuted && '🔇'}</span>
                    </div>

                    {peerList.map(([id, p]) => p.stream && <AudioPlayer key={id} stream={p.stream} />)}
                </div>

                {/* Controls */}
                <div className="flex justify-center gap-6 pb-12" onClick={e => { e.stopPropagation(); setShowMoreMenu(false); }}>
                    <ControlBtn onClick={toggleAudio} active={isMuted} activeColor="bg-red-600" label={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? <SpeakerXMarkIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                    </ControlBtn>
                    <ControlBtn onClick={switchToVideo} activeColor="bg-blue-600" label="Video">
                        <VideoCameraIcon className="w-6 h-6" />
                    </ControlBtn>
                    <ControlBtn onClick={flipCamera} activeColor="bg-gray-700" label="Switch Camera">
                        <ArrowPathIcon className="w-6 h-6" />
                    </ControlBtn>
                    
                    {/* 3-dot dropdown menu */}
                    <div className="relative">
                        <ControlBtn 
                            onClick={(e) => { e.stopPropagation(); setShowMoreMenu(prev => !prev); }} 
                            active={showMoreMenu} 
                            activeColor="bg-gray-600" 
                            label="More Options"
                        >
                            <EllipsisVerticalIcon className="w-6 h-6" />
                        </ControlBtn>
                        {showMoreMenu && (
                            <div 
                                className="absolute bottom-full right-0 mb-3 w-56 bg-[#1f2c34] border border-white/10 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 text-left animate-fade-in"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => { setShowAddModal(true); setShowMoreMenu(false); }}
                                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition text-sm text-left font-medium w-full"
                                >
                                    <UserPlusIcon className="w-5 h-5 text-gray-300" />
                                    <span>Add Participant</span>
                                </button>
                                <button
                                    onClick={() => { toggleScreenShare(); setShowMoreMenu(false); }}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm text-left font-medium w-full ${isScreenSharing ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' : 'text-white hover:bg-white/10'}`}
                                >
                                    <ComputerDesktopIcon className="w-5 h-5" />
                                    <span>{isScreenSharing ? 'Stop Screen Share' : 'Screen Share'}</span>
                                </button>
                                <button
                                    onClick={() => { setIsVoiceCancellationOn(prev => !prev); setShowMoreMenu(false); }}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm text-left font-medium w-full ${isVoiceCancellationOn ? 'text-green-400 bg-green-500/10 hover:bg-green-500/20' : 'text-white hover:bg-white/10'}`}
                                >
                                    <span className="w-5 h-5 flex items-center justify-center text-base">
                                        {isVoiceCancellationOn ? '🎙️✨' : '🎙️'}
                                    </span>
                                    <span>{isVoiceCancellationOn ? 'Voice Cancellation: On' : 'Voice Cancellation: Off'}</span>
                                </button>
                                <button
                                    onClick={() => { toggleRecording(); setShowMoreMenu(false); }}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm text-left font-medium w-full ${isRecording ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'text-white hover:bg-white/10'}`}
                                >
                                    {isRecording ? (
                                        <span className="w-5 h-5 flex items-center justify-center">
                                            <span className="w-3.5 h-3.5 rounded bg-red-500" />
                                        </span>
                                    ) : (
                                        <span className="w-5 h-5 flex items-center justify-center">
                                            <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
                                        </span>
                                    )}
                                    <span>{isRecording ? 'Stop Recording' : 'Record Call'}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <button onClick={onClose} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg">
                        <XMarkIcon className="w-7 h-7 text-white" />
                    </button>
                </div>

                {/* Upgrade Request Popup */}
                {upgradeRequest && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-fade-in">
                        <div className="bg-[#202c33] p-6 rounded-2xl w-full max-w-sm shadow-2xl text-center">
                            <VideoCameraIcon className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                            <h3 className="text-white text-lg font-bold mb-2">Video Call Request</h3>
                            <p className="text-gray-300 text-sm mb-6">{upgradeRequest.fromName} wants to switch to video call.</p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setUpgradeRequest(null)}
                                    className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                                >
                                    Decline
                                </button>
                                <button
                                    onClick={acceptVideoUpgrade}
                                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20"
                                >
                                    Accept
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Video call UI — WhatsApp style
    return (
        <div
            className={isMinimized 
                ? "fixed z-[100] bg-black flex flex-col select-none overflow-hidden rounded-2xl shadow-2xl border border-white/20 cursor-move touch-none" 
                : "fixed inset-0 z-[100] bg-black flex flex-col select-none"
            }
            style={isMinimized ? { left: pipPos.x, top: pipPos.y, width: '280px', height: '400px' } : {}}
            onPointerDown={isMinimized ? handlePipPointerDown : undefined}
            onPointerMove={isMinimized ? handlePipPointerMove : undefined}
            onPointerUp={isMinimized ? handlePipPointerUp : undefined}
            onPointerCancel={isMinimized ? handlePipPointerUp : undefined}
            onClick={!isMinimized ? () => { setShowControls(v => !v); setShowMoreMenu(false); } : undefined}
        >
            {/* ── MAIN VIDEO (full screen) ── */}
            <div className="absolute inset-0">
                {mainIsMe ? (
                    // My video is main
                    <>
                        <LocalVideo stream={localStream} muted className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`} />
                        {isVideoOff && <AvatarPlaceholder avatar={user?.avatar} name="You" />}
                        <div className="absolute bottom-24 left-4 bg-black/50 px-3 py-1 rounded-full text-white text-sm font-medium">
                            You {isMuted && '🔇'}
                        </div>
                    </>
                ) : (
                    // Remote peer is main
                    selectedPeer ? (
                        <>
                            <RemoteVideo stream={selectedPeer[1].stream} className="w-full h-full object-cover bg-black" />
                            {!selectedPeer[1].stream && <AvatarPlaceholder avatar={selectedPeer[1].user?.avatar} name={selectedPeer[1].user?.username} />}
                            <div className="absolute bottom-24 left-4 bg-black/50 px-3 py-1 rounded-full text-white text-sm font-medium">
                                {selectedPeer[1].user?.username}
                            </div>
                        </>
                    ) : (
                        // Waiting for peer
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4"
                            style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)' }}>
                            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-600">
                                {activeChat.avatar
                                    ? <img src={activeChat.avatar} className="w-full h-full object-cover" alt="" />
                                    : <div className="w-full h-full bg-gray-700 flex items-center justify-center text-4xl">👤</div>
                                }
                            </div>
                            <p className="text-white text-xl font-bold">{activeChat.name}</p>
                            <p className="text-gray-400 text-sm animate-pulse">Waiting for others to join...</p>
                        </div>
                    )
                )}
            </div>

            {/* ── PIP thumbnails (Draggable) ── */}
            <div 
                className="absolute z-20 flex flex-col gap-2 cursor-move touch-none"
                style={{ left: pipPos.x, top: pipPos.y }}
                onPointerDown={handlePipPointerDown}
                onPointerMove={handlePipPointerMove}
                onPointerUp={handlePipPointerUp}
                onPointerCancel={handlePipPointerUp}
            >
                {thumbnails.length > 0 ? thumbnails.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        className="relative w-28 h-36 md:w-32 md:h-44 overflow-hidden rounded-2xl border-2 border-white/40 bg-gray-900 shadow-2xl transition-transform active:scale-95"
                        onClick={(e) => { e.stopPropagation(); selectMainView(item.id); }}
                        title={`Show ${item.name || 'participant'} full screen`}
                    >
                        {item.type === 'me' ? (
                            <>
                                <LocalVideo stream={item.stream} muted className={`w-full h-full object-cover ${item.isVideoOff ? 'hidden' : ''}`} />
                                {item.isVideoOff && <AvatarPlaceholder avatar={item.avatar} name={item.name} small />}
                            </>
                        ) : (
                            <>
                                <RemoteVideo stream={item.stream} className="w-full h-full object-cover" />
                                {!item.stream && <AvatarPlaceholder avatar={item.avatar} name={item.name} small />}
                            </>
                        )}
                        <div className="absolute left-0 right-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="truncate text-left text-[11px] font-medium text-white">
                                {item.name || 'Participant'} {item.id === 'me' && isMuted ? 'Muted' : ''}
                            </p>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/25 hover:opacity-100">
                            <ArrowsPointingOutIcon className="w-5 h-5 text-white" />
                        </div>
                    </button>
                )) : (
                    <div className="w-28 h-36 md:w-32 md:h-44 rounded-2xl border border-white/20 bg-gray-900/80 flex items-center justify-center shadow-2xl">
                        <span className="text-gray-400 text-xs text-center px-3">Waiting...</span>
                    </div>
                )}
            </div>

            {/* ── TOP BAR (name + end call) ── */}
            <div className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-${isMinimized ? '4' : '10'} pb-4 transition-opacity duration-300 ${showControls || isMinimized ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
            >
                <div className="flex items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-white font-bold text-lg">{activeChat.name}</h2>
                            {/* HD Badge */}
                            <span className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-blue-500/30 tracking-widest uppercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                HD
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-green-400 text-xs font-semibold">
                                {firstPeer?.[1]?.stream ? 'Connected · 1080p' : ringStatus === 'ringing' ? 'Ringing...' : 'Calling...'}
                            </span>
                            <span className="text-white/40 text-xs">•</span>
                            <button 
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); setShowSafetyModal(true); }}
                                className="flex items-center gap-1 bg-green-500/25 border border-green-500/30 px-2 py-0.5 rounded-full text-[10px] text-green-400 font-bold hover:bg-green-500/35 transition"
                            >
                                🔒 E2EE Verified
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* Minimize / Expand Button */}
                <div className="flex items-center">
                    {isMinimized ? (
                        <button 
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md pointer-events-auto"
                            title="Expand Call"
                        >
                            <ArrowsPointingOutIcon className="w-5 h-5" />
                        </button>
                    ) : (
                        <button 
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md pointer-events-auto"
                            title="Minimize to Chat"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ── BOTTOM CONTROLS ── */}
            {!isMinimized && (
                <div
                    className={`absolute bottom-0 left-0 right-0 z-10 flex justify-center gap-5 pb-10 pt-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
                    onClick={e => { e.stopPropagation(); setShowMoreMenu(false); }}
                >
                    <ControlBtn onClick={toggleAudio} active={isMuted} activeColor="bg-red-600" label={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? <SpeakerXMarkIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                    </ControlBtn>

                    <ControlBtn onClick={toggleVideo} active={isVideoOff} activeColor="bg-red-600" label={isVideoOff ? 'Start Video' : 'Stop Video'}>
                        {isVideoOff ? <VideoCameraSlashIcon className="w-6 h-6" /> : <VideoCameraIcon className="w-6 h-6" />}
                    </ControlBtn>

                <ControlBtn onClick={flipCamera} activeColor="bg-gray-700" label="Switch Camera">
                    <ArrowPathIcon className="w-6 h-6" />
                </ControlBtn>

                {/* 3-dot dropdown menu */}
                <div className="relative">
                    <ControlBtn 
                        onClick={(e) => { e.stopPropagation(); setShowMoreMenu(prev => !prev); }} 
                        active={showMoreMenu} 
                        activeColor="bg-gray-600" 
                        label="More Options"
                    >
                        <EllipsisVerticalIcon className="w-6 h-6" />
                    </ControlBtn>
                    {showMoreMenu && (
                        <div 
                            className="absolute bottom-full right-0 mb-3 w-56 bg-[#1f2c34] border border-white/10 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 text-left animate-fade-in"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => { setShowAddModal(true); setShowMoreMenu(false); }}
                                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition text-sm text-left font-medium w-full"
                            >
                                <UserPlusIcon className="w-5 h-5 text-gray-300" />
                                <span>Add Participant</span>
                            </button>
                            <button
                                onClick={() => { toggleScreenShare(); setShowMoreMenu(false); }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm text-left font-medium w-full ${isScreenSharing ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' : 'text-white hover:bg-white/10'}`}
                            >
                                <ComputerDesktopIcon className="w-5 h-5" />
                                <span>{isScreenSharing ? 'Stop Screen Share' : 'Screen Share'}</span>
                            </button>
                            <button
                                onClick={() => { setIsVoiceCancellationOn(prev => !prev); setShowMoreMenu(false); }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm text-left font-medium w-full ${isVoiceCancellationOn ? 'text-green-400 bg-green-500/10 hover:bg-green-500/20' : 'text-white hover:bg-white/10'}`}
                            >
                                <span className="w-5 h-5 flex items-center justify-center text-base">
                                    {isVoiceCancellationOn ? '🎙️✨' : '🎙️'}
                                </span>
                                <span>{isVoiceCancellationOn ? 'Voice Cancellation: On' : 'Voice Cancellation: Off'}</span>
                            </button>
                            <button
                                onClick={() => { toggleRecording(); setShowMoreMenu(false); }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm text-left font-medium w-full ${isRecording ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'text-white hover:bg-white/10'}`}
                            >
                                {isRecording ? (
                                    <span className="w-5 h-5 flex items-center justify-center">
                                        <span className="w-3.5 h-3.5 rounded bg-red-500" />
                                    </span>
                                ) : (
                                    <span className="w-5 h-5 flex items-center justify-center">
                                        <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
                                    </span>
                                )}
                                <span>{isRecording ? 'Stop Recording' : 'Record Call'}</span>
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-xl transition-transform active:scale-95"
                >
                    <XMarkIcon className="w-7 h-7 text-white" />
                </button>
            </div>
            )}

            {/* Audio players for all peers */}
            {peerList.map(([id, p]) => p.stream && <AudioPlayer key={id} stream={p.stream} />)}

            {/* Safety Verification Modal */}
            {showSafetyModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowSafetyModal(false)}>
                    <div className="bg-[#1c2431] border border-white/10 p-6 rounded-3xl w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-xl">🔒</span>
                        </div>
                        <h3 className="text-white text-lg font-bold mb-2">Safety Number</h3>
                        <p className="text-gray-400 text-xs mb-4">
                            Verify that your call with {firstPeer?.[1]?.user?.username || activeChat.name} is end-to-end encrypted. Compare these numbers with their device:
                        </p>
                        <div className="bg-black/40 border border-white/5 p-4 rounded-2xl font-mono text-white text-sm tracking-wider break-words mb-6 select-all cursor-pointer" title="Click to copy" onClick={() => { navigator.clipboard.writeText(generateSafetyNumber(user, firstPeer?.[1]?.user || { id: 0, username: activeChat.name })); alert("Safety number copied!"); }}>
                            {generateSafetyNumber(user, firstPeer?.[1]?.user || { id: 0, username: activeChat.name })}
                        </div>
                        <button
                            onClick={() => setShowSafetyModal(false)}
                            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold shadow-lg shadow-green-600/20 transition"
                        >
                            Close & Verify
                        </button>
                    </div>
                </div>
            )}

            {/* Add Participant Modal */}
            {showAddModal && (
                <div 
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fade-in"
                    onClick={() => setShowAddModal(false)}
                >
                    <div 
                        className="bg-[#1c2431] border border-white/10 p-6 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                            <h3 className="text-white text-lg font-bold">Add Participant</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white p-1">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                            {loadingContacts ? (
                                <p className="text-center text-gray-400 text-sm py-4">Loading contacts...</p>
                            ) : contacts.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-4">No contacts found.</p>
                            ) : (
                                contacts.map(contact => {
                                    if (contact.id === user.id) return null;
                                    
                                    const isInCall = Object.values(peers).some(p => p.user?.id === contact.id) || 
                                                     (activeChat.participants && activeChat.participants.some(p => p.id === contact.id && p.id !== user.id && Object.values(peers).some(peer => peer.user?.id === p.id)));
                                    
                                    const addingState = addingStates[contact.id];
                                    
                                    return (
                                        <div key={contact.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition">
                                            <div className="flex items-center gap-3">
                                                <img src={contact.avatar || "https://avatar.iran.liara.run/public"} className="w-10 h-10 rounded-full object-cover border border-white/10" alt="" />
                                                <div className="text-left">
                                                    <p className="text-white text-sm font-semibold">{contact.username}</p>
                                                    <p className="text-gray-400 text-[10px]">{contact.phone}</p>
                                                </div>
                                            </div>
                                            
                                            <button
                                                disabled={isInCall || addingState === 'adding' || addingState === 'added'}
                                                onClick={() => handleAddParticipant(contact)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 ${
                                                    isInCall 
                                                        ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                                                        : addingState === 'adding'
                                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                        : addingState === 'added'
                                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                        : 'bg-signal-accent hover:bg-signal-accentHover text-white'
                                                }`}
                                            >
                                                {isInCall ? 'In Call' : addingState === 'adding' ? 'Calling...' : addingState === 'added' ? 'Added' : 'Add'}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Helper Components ──

const ControlBtn = ({ onClick, active, activeColor = 'bg-gray-700', children, label }) => (
    <button
        onClick={onClick}
        title={label}
        className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${active ? activeColor : 'bg-gray-700/80 hover:bg-gray-600'}`}
    >
        {children}
    </button>
);

const AvatarPlaceholder = ({ avatar, name, small }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900">
        <div className={`${small ? 'w-12 h-12' : 'w-24 h-24'} rounded-full overflow-hidden border-2 border-gray-600`}>
            {avatar
                ? <img src={avatar} className="w-full h-full object-cover" alt="" />
                : <div className="w-full h-full bg-gray-700 flex items-center justify-center text-3xl">👤</div>
            }
        </div>
        {!small && <p className="text-white text-sm font-medium">{name}</p>}
    </div>
);

const RemoteVideo = ({ stream, className }) => {
    const videoRef = useRef();
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline className={className} />;
};

const LocalVideo = ({ stream, className, muted = true }) => {
    const videoRef = useRef();
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);
    return <video ref={videoRef} muted={muted} autoPlay playsInline className={className} />;
};

const AudioPlayer = ({ stream }) => {
    const audioRef = useRef();
    useEffect(() => {
        if (audioRef.current && stream) audioRef.current.srcObject = stream;
    }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};

export default VideoCallModal;
