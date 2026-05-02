import React, { useState, useEffect, useRef, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { VideoCameraIcon, VideoCameraSlashIcon, XMarkIcon, MicrophoneIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';

const VideoCallModal = ({ activeChat, onClose, callType = 'video' }) => {
    const { socket } = useContext(SocketContext);
    const { user } = useContext(AuthContext);

    const [peers, setPeers] = useState({});
    const peersRef = useRef({});
    const myStreamRef = useRef(null);
    const myVideoRef = useRef();

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');

    useEffect(() => { peersRef.current = peers; }, [peers]);

    useEffect(() => {
        const initCall = async () => {
            try {
                const constraints = callType === 'voice'
                    ? { audio: true, video: false }
                    : { audio: true, video: true };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                myStreamRef.current = stream;
                if (myVideoRef.current) myVideoRef.current.srcObject = stream;

                socket.emit('join_call', { chatId: activeChat.id, userId: user.id });

                socket.on('user_joined_call', (data) => {
                    createPeer(data.socketId, data.userId, stream, true);
                });

                socket.on('user_left_call', (data) => removePeer(data.socketId));

                socket.on('offer', async (data) => {
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
            myStreamRef.current?.getTracks().forEach(t => t.stop());
            myStreamRef.current = null;
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
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice_candidate', { to: remoteSocketId, candidate: e.candidate, fromSocket: socket.id });
        };

        pc.ontrack = (e) => {
            setPeers(prev => ({ ...prev, [remoteSocketId]: { ...prev[remoteSocketId], stream: e.streams[0] } }));
        };

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const remoteParticipant = activeChat.participants.find(p => p.id === remoteUserId);
        setPeers(prev => ({ ...prev, [remoteSocketId]: { pc, stream: null, user: { username: remoteParticipant?.username || `User ${remoteUserId}` } } }));

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
        myStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    };

    const toggleVideo = () => {
        const newOff = !isVideoOff;
        setIsVideoOff(newOff);
        myStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    };

    const isVoiceOnly = callType === 'voice';

    return (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col p-4">
            <div className="flex justify-between items-center mb-4 text-white">
                <h2 className="text-xl font-bold">
                    {isVoiceOnly ? '🎙️ Voice Call' : '📹 Video Call'}: {activeChat.name}
                </h2>
                <button onClick={onClose} className="bg-red-600 hover:bg-red-700 p-2 rounded-full">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>

            {isVoiceOnly ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-5xl border-4 border-green-500 animate-pulse">
                        🎙️
                    </div>
                    <p className="text-white text-lg font-semibold">{activeChat.name}</p>
                    <p className="text-green-400 text-sm animate-pulse">Voice call in progress...</p>
                    <div className="flex gap-4 mt-4">
                        {Object.entries(peers).map(([id, p]) => (
                            <div key={id} className="flex flex-col items-center gap-1">
                                <div className="w-14 h-14 bg-gray-700 rounded-full flex items-center justify-center text-2xl border-2 border-green-500">👤</div>
                                <span className="text-xs text-gray-300">{p.user?.username}</span>
                                {p.stream && <AudioPlayer stream={p.stream} />}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                    <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video border-2 border-green-500">
                        <video ref={myVideoRef} muted autoPlay playsInline className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`} />
                        {isVideoOff && <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-900 text-4xl">👤</div>}
                        <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
                            You {isMuted && <span className="text-red-400 ml-1">🔇</span>}
                        </div>
                    </div>
                    {Object.entries(peers).map(([id, peerData]) => (
                        <VideoPlayer key={id} stream={peerData.stream} user={peerData.user} />
                    ))}
                </div>
            )}

            <div className="mt-4 flex justify-center gap-4">
                <button onClick={toggleAudio} className={`p-4 rounded-full text-white ${isMuted ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    {isMuted ? <SpeakerXMarkIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                </button>
                {!isVoiceOnly && (
                    <button onClick={toggleVideo} className={`p-4 rounded-full text-white ${isVideoOff ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                        {isVideoOff ? <VideoCameraSlashIcon className="w-6 h-6" /> : <VideoCameraIcon className="w-6 h-6" />}
                    </button>
                )}
                <button onClick={onClose} className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-6">
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
        <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
            {stream ? <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-gray-500">Connecting...</div>}
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">{user?.username}</div>
        </div>
    );
};

const AudioPlayer = ({ stream }) => {
    const audioRef = useRef();
    useEffect(() => { if (audioRef.current && stream) audioRef.current.srcObject = stream; }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};

export default VideoCallModal;
