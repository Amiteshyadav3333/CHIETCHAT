import React, { useState, useEffect, useRef, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { PhoneIcon, VideoCameraIcon, VideoCameraSlashIcon, XMarkIcon, MicrophoneIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';

const VideoCallModal = ({ activeChat, onClose }) => {
    const { socket } = useContext(SocketContext);
    const { user } = useContext(AuthContext);

    const [myStream, setMyStream] = useState(null);
    const [peers, setPeers] = useState({}); // { [socketId]: { stream, user, pc } }
    const peersRef = useRef({});

    const myVideoRef = useRef();

    // State for controls
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    useEffect(() => {
        peersRef.current = peers;
    }, [peers]);

    useEffect(() => {
        const initCall = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setMyStream(stream);
                if (myVideoRef.current) myVideoRef.current.srcObject = stream;

                // Join the call room
                socket.emit('join_call', { chatId: activeChat.id, userId: user.id });

                // Socket Listeners
                socket.on('user_joined_call', (data) => {
                    // data: { userId, socketId }
                    // Existing user initiates call to new user
                    createPeer(data.socketId, data.userId, stream, true);
                });

                socket.on('user_left_call', (data) => {
                    removePeer(data.socketId);
                });

                socket.on('offer', async (data) => {
                    // Received Offer: create peer (not initiator) and answer
                    // data: { offer, from (userId), fromSocket }
                    const pc = createPeer(data.fromSocket, data.from, stream, false);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('answer', { to: data.fromSocket, answer, from: user.id, fromSocket: socket.id });
                });

                socket.on('answer', async (data) => {
                    // Received Answer
                    // data: { answer, fromSocket }
                    const peerObj = peersRef.current[data.fromSocket];
                    if (peerObj && peerObj.pc) {
                        await peerObj.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    }
                });

                socket.on('ice_candidate', async (data) => {
                    const peerObj = peersRef.current[data.fromSocket];
                    if (peerObj && peerObj.pc && data.candidate) {
                        try {
                            await peerObj.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                        } catch (e) {
                            console.error("Error adding ice candidate", e);
                        }
                    }
                });

            } catch (err) {
                console.error("Failed to get media", err);
                alert("Could not access camera/microphone. Please allow permissions.");
                onClose();
            }
        };

        if (activeChat?.id) {
            initCall();
        }

        return () => {
            socket.emit('leave_call', { chatId: activeChat?.id, userId: user?.id });

            // Cleanup peers
            Object.values(peersRef.current).forEach(p => {
                if (p.pc) p.pc.close();
            });
            if (myStream) {
                myStream.getTracks().forEach(t => t.stop());
            }

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

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', {
                    to: remoteSocketId,
                    candidate: event.candidate,
                    fromSocket: socket.id
                });
            }
        };

        pc.ontrack = (event) => {
            setPeers(prev => ({
                ...prev,
                [remoteSocketId]: {
                    ...prev[remoteSocketId],
                    stream: event.streams[0]
                }
            }));
        };

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Add to state immediately
        // We might not know username yet? We can fetch or pass it. 
        // For now, simplify and show "User <id>" or ideally backend sends map.
        // Let's assume we can map userId to username from activeChat participants
        const remoteParticipant = activeChat.participants.find(p => p.id === remoteUserId);
        const username = remoteParticipant ? remoteParticipant.username : `User ${remoteUserId}`;

        setPeers(prev => ({
            ...prev,
            [remoteSocketId]: {
                pc,
                stream: null, // Will be set in ontrack
                user: { username }
            }
        }));

        if (isInitiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('offer', {
                        to: remoteSocketId,
                        offer: pc.localDescription,
                        from: user.id,
                        fromSocket: socket.id
                    });
                } catch (e) {
                    console.error(e);
                }
            };
        }

        return pc;
    };


    const toggleAudio = () => {
        if (myStream) {
            const newMutedState = !isMuted;
            setIsMuted(newMutedState);
            myStream.getAudioTracks().forEach(track => {
                track.enabled = !newMutedState;
            });
        }
    };

    const toggleVideo = () => {
        if (myStream) {
            const newVideoState = !isVideoOff;
            setIsVideoOff(newVideoState);
            myStream.getVideoTracks().forEach(track => {
                track.enabled = !newVideoState;
            });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col p-4">
            <div className="flex justify-between items-center mb-4 text-white">
                <h2 className="text-xl font-bold">Group Call: {activeChat.name}</h2>
                <button onClick={onClose} className="bg-red-600 hover:bg-red-700 p-2 rounded-full">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                {/* My Video */}
                <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video border-2 border-green-500">
                    <video ref={myVideoRef} muted autoPlay playsInline className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`} />
                    {isVideoOff && <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-900">Video Off</div>}
                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm flex items-center gap-2">
                        You {isMuted && <span className="text-red-500 flex items-center"><SpeakerXMarkIcon className="w-3 h-3 mr-1" /> Muted</span>}
                    </div>
                </div>

                {/* Remote Peers */}
                {Object.entries(peers).map(([id, peerData]) => (
                    <VideoPlayer key={id} stream={peerData.stream} user={peerData.user} />
                ))}
            </div>

            <div className="mt-4 flex justify-center gap-4">
                <button
                    onClick={toggleAudio}
                    className={`p-4 rounded-full text-white transition-colors ${isMuted ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <SpeakerXMarkIcon className="w-6 h-6 text-white" /> : <MicrophoneIcon className="w-6 h-6" />}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`p-4 rounded-full text-white transition-colors ${isVideoOff ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                >
                    {isVideoOff ? <VideoCameraSlashIcon className="w-6 h-6 text-white" /> : <VideoCameraIcon className="w-6 h-6" />}
                </button>
            </div>
        </div>
    );
};

// Helper component for video
const VideoPlayer = ({ stream, user }) => {
    const videoRef = useRef();

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
            {stream ? (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">Connecting...</div>
            )}

            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
                {user ? user.username : 'Unknown'}
            </div>
        </div>
    );
};

export default VideoCallModal;
