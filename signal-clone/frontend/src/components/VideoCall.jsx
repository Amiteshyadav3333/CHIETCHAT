import React, { useState, useEffect, useRef, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import {
    VideoCameraIcon, VideoCameraSlashIcon, XMarkIcon,
    MicrophoneIcon, SpeakerXMarkIcon, ArrowsPointingOutIcon, ArrowPathIcon
} from '@heroicons/react/24/solid';

const MAX_PARTICIPANTS = 10;

const VideoCallModal = ({ activeChat, onClose, callType = 'video' }) => {
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
    const controlsTimerRef = useRef(null);
    const facingModeRef = useRef('user');

    useEffect(() => { peersRef.current = peers; }, [peers]);
    useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

    // Auto-hide controls after 4s
    useEffect(() => {
        if (showControls) {
            clearTimeout(controlsTimerRef.current);
            controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
        }
        return () => clearTimeout(controlsTimerRef.current);
    }, [showControls]);

    useEffect(() => {
        const initCall = async () => {
            try {
                const constraints = callType === 'voice'
                    ? { audio: true, video: false }
                    : { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facingModeRef.current } };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                streamRef.current = stream;
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
            socket.off('user_joined_call');
            socket.off('user_left_call');
            socket.off('offer');
            socket.off('answer');
            socket.off('ice_candidate');
            socket.off('call_ended');
            socket.off('request_video_upgrade');
            socket.off('video_upgrade_accepted');
        };
    }, [activeChat?.id]);

    const createPeer = (remoteSocketId, remoteUserId, stream, isInitiator) => {
        if (peersRef.current[remoteSocketId]) return peersRef.current[remoteSocketId].pc;

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice_candidate', { to: remoteSocketId, candidate: e.candidate, fromSocket: socket.id });
        };

        pc.ontrack = (e) => {
            setPeers(prev => ({ ...prev, [remoteSocketId]: { ...prev[remoteSocketId], stream: e.streams[0] } }));
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') removePeer(remoteSocketId);
        };

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const remoteParticipant = activeChat.participants.find(p => p.id === remoteUserId);
        setPeers(prev => ({
            ...prev,
            [remoteSocketId]: {
                pc,
                stream: null,
                user: { username: remoteParticipant?.username || `User ${remoteUserId}`, avatar: remoteParticipant?.avatar }
            }
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
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facingModeRef.current },
                audio: false
            });
            const videoTrack = videoStream.getVideoTracks()[0];
            streamRef.current.addTrack(videoTrack);
            setLocalStream(new MediaStream(streamRef.current.getTracks()));
            Object.values(peersRef.current).forEach(({ pc }) => pc.addTrack(videoTrack, streamRef.current));
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
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: { ideal: nextFacingMode }
                },
                audio: false
            });
            const nextVideoTrack = nextStream.getVideoTracks()[0];
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
                className="fixed inset-0 z-50 flex flex-col"
                style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
                onClick={() => setShowControls(true)}
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
                        <p className="text-green-400 text-sm mt-1 animate-pulse">
                            {firstPeer?.[1]?.stream ? 'Connected' : 'Calling...'}
                        </p>
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
                <div className="flex justify-center gap-6 pb-12">
                    <ControlBtn onClick={toggleAudio} active={isMuted} activeColor="bg-red-600" label={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? <SpeakerXMarkIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                    </ControlBtn>
                    <ControlBtn onClick={switchToVideo} activeColor="bg-blue-600" label="Video">
                        <VideoCameraIcon className="w-6 h-6" />
                    </ControlBtn>
                    <ControlBtn onClick={flipCamera} activeColor="bg-gray-700" label="Switch Camera">
                        <ArrowPathIcon className="w-6 h-6" />
                    </ControlBtn>
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
            className="fixed inset-0 z-50 bg-black flex flex-col select-none"
            onClick={() => setShowControls(v => !v)}
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

            {/* ── PIP thumbnails ── */}
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
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
            <div className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-10 pb-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
            >
                <div>
                    <h2 className="text-white font-bold text-lg">{activeChat.name}</h2>
                    <p className="text-green-400 text-xs">
                        {firstPeer?.[1]?.stream ? 'Connected' : 'Calling...'}
                    </p>
                </div>
            </div>

            {/* ── BOTTOM CONTROLS ── */}
            <div
                className={`absolute bottom-0 left-0 right-0 z-10 flex justify-center gap-5 pb-10 pt-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
                onClick={e => e.stopPropagation()}
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

                <button
                    onClick={onClose}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-xl transition-transform active:scale-95"
                >
                    <XMarkIcon className="w-7 h-7 text-white" />
                </button>
            </div>

            {/* Audio players for all peers */}
            {peerList.map(([id, p]) => p.stream && <AudioPlayer key={id} stream={p.stream} />)}
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
