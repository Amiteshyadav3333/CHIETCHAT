import React, { useState, useEffect, useRef, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { VideoCameraIcon, VideoCameraSlashIcon, XMarkIcon, MicrophoneIcon, SpeakerXMarkIcon, UserGroupIcon } from '@heroicons/react/24/solid';

const MAX_PARTICIPANTS = 10;

const VideoCallModal = ({ activeChat, onClose, callType = 'video' }) => {
    const { socket } = useContext(SocketContext);
    const { user } = useContext(AuthContext);

    const [peers, setPeers] = useState({});
    const peersRef = useRef({});
    const myStreamRef = useRef(null);
    const myVideoRef = useRef();
    const streamRef = useRef(null);

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
    const [participantCount, setParticipantCount] = useState(1);

    useEffect(() => { peersRef.current = peers; }, [peers]);

    useEffect(() => {
        const initCall = async () => {
            try {
                const constraints = callType === 'voice'
                    ? { audio: true, video: false }
                    : { audio: true, video: { width: 640, height: 480 } };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                myStreamRef.current = stream;
                streamRef.current = stream;
                if (myVideoRef.current) myVideoRef.current.srcObject = stream;

                socket.emit('join_call', { chatId: activeChat.id, userId: user.id });

                socket.on('user_joined_call', (data) => {
                    if (Object.keys(peersRef.current).length >= MAX_PARTICIPANTS - 1) return;
                    createPeer(data.socketId, data.userId, stream, true);
                    setParticipantCount(c => c + 1);
                });

                socket.on('user_left_call', (data) => {
                    removePeer(data.socketId);
                    setParticipantCount(c => Math.max(1, c - 1));
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
                        try { await peerObj.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { }
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
            myStreamRef.current = null;
            streamRef.current = null;
            socket.off('user_joined_call');
            socket.off('user_left_call');
            socket.off('offer');
            socket.off('answer');
            socket.off('ice_candidate');
        };
    }, [activeChat?.id]);

    const createPeer = (remoteSocketId, remoteUserId, stream, isInitiator) => {
        if (peersRef.current[remoteSocketId]) return peersRef.current[remoteSocketId].pc;

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice_candidate', { to: remoteSocketId, candidate: e.candidate, fromSocket: socket.id });
        };

        pc.ontrack = (e) => {
            setPeers(prev => ({ ...prev, [remoteSocketId]: { ...prev[remoteSocketId], stream: e.streams[0] } }));
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                removePeer(remoteSocketId);
            }
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

    const isVoiceOnly = callType === 'voice';
    const peerList = Object.entries(peers);
    const totalCount = peerList.length + 1;

    // Grid layout based on participant count
    const getGridClass = () => {
        if (totalCount <= 1) return 'grid-cols-1';
        if (totalCount <= 2) return 'grid-cols-2';
        if (totalCount <= 4) return 'grid-cols-2';
        if (totalCount <= 6) return 'grid-cols-3';
        return 'grid-cols-4';
    };

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 bg-gray-900 border-b border-gray-800">
                <div className="flex items-center gap-2 text-white">
                    <span className="text-lg">{isVoiceOnly ? '🎙️' : '📹'}</span>
                    <h2 className="font-bold">{activeChat.name}</h2>
                    <span className="text-xs bg-gray-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <UserGroupIcon className="w-3 h-3" /> {totalCount}/{MAX_PARTICIPANTS}
                    </span>
                </div>
                <button onClick={onClose} className="bg-red-600 hover:bg-red-700 p-2 rounded-full">
                    <XMarkIcon className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* Call Area */}
            {isVoiceOnly ? (
                // Voice Call UI
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
                    <div className="flex flex-wrap justify-center gap-6 max-w-2xl">
                        {/* Me */}
                        <div className="flex flex-col items-center gap-2">
                            <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl overflow-hidden ${isMuted ? 'border-red-500' : 'border-green-500 animate-pulse'}`}>
                                {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : '👤'}
                            </div>
                            <span className="text-white text-sm font-medium">You {isMuted && '🔇'}</span>
                        </div>
                        {/* Peers */}
                        {peerList.map(([id, p]) => (
                            <div key={id} className="flex flex-col items-center gap-2">
                                <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl overflow-hidden ${p.stream ? 'border-green-500 animate-pulse' : 'border-gray-600'}`}>
                                    {p.user?.avatar ? <img src={p.user.avatar} className="w-full h-full object-cover" alt="" /> : '👤'}
                                </div>
                                <span className="text-white text-sm font-medium">{p.user?.username}</span>
                                {p.stream && <AudioPlayer stream={p.stream} />}
                            </div>
                        ))}
                    </div>
                    <p className="text-green-400 text-sm animate-pulse mt-4">Voice call in progress...</p>
                </div>
            ) : (
                // Video Call Grid UI
                <div className={`flex-1 grid ${getGridClass()} gap-1 p-1 overflow-hidden`}>
                    {/* My Video */}
                    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                        <video ref={myVideoRef} muted autoPlay playsInline className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`} />
                        {isVideoOff && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-green-500">
                                    {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-4xl flex items-center justify-center h-full">👤</span>}
                                </div>
                            </div>
                        )}
                        <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-white text-xs flex items-center gap-1">
                            You {isMuted && '🔇'}
                        </div>
                        <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full"></div>
                    </div>

                    {/* Remote Peers */}
                    {peerList.map(([id, peerData]) => (
                        <VideoPlayer key={id} stream={peerData.stream} user={peerData.user} />
                    ))}
                </div>
            )}

            {/* Controls */}
            <div className="flex justify-center gap-4 py-4 bg-gray-900 border-t border-gray-800">
                <button
                    onClick={toggleAudio}
                    className={`p-4 rounded-full text-white transition-all ${isMuted ? 'bg-red-600 scale-95' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? <SpeakerXMarkIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                </button>

                {!isVoiceOnly && (
                    <button
                        onClick={toggleVideo}
                        className={`p-4 rounded-full text-white transition-all ${isVideoOff ? 'bg-red-600 scale-95' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
                    >
                        {isVideoOff ? <VideoCameraSlashIcon className="w-6 h-6" /> : <VideoCameraIcon className="w-6 h-6" />}
                    </button>
                )}

                <button
                    onClick={onClose}
                    className="px-8 py-4 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold transition-all"
                >
                    End Call
                </button>
            </div>
        </div>
    );
};

const VideoPlayer = ({ stream, user }) => {
    const videoRef = useRef();
    useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

    return (
        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
            {stream ? (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-600">
                        {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-4xl flex items-center justify-center h-full">👤</span>}
                    </div>
                </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-white text-xs">{user?.username}</div>
            {stream && <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>}
        </div>
    );
};

const AudioPlayer = ({ stream }) => {
    const audioRef = useRef();
    useEffect(() => { if (audioRef.current && stream) audioRef.current.srcObject = stream; }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};

export default VideoCallModal;
