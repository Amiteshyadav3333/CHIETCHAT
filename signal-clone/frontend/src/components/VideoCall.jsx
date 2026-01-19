import React, { useState, useEffect, useRef, useContext } from 'react';
import Peer from 'peerjs';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { PhoneIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/solid';

const VideoCallModal = ({ activeChat, onClose }) => {
    const { socket } = useContext(SocketContext);
    const { user } = useContext(AuthContext);

    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callStatus, setCallStatus] = useState('idle'); // idle, calling, receiving, connected
    const [peerId, setPeerId] = useState('');
    const [incomingCall, setIncomingCall] = useState(null); // { signal, from, name }

    const myVideoRef = useRef();
    const remoteVideoRef = useRef();
    const peerRef = useRef();

    useEffect(() => {
        // Initialize Peer
        // In real app, reuse the peer connection
        const peer = new Peer(undefined, {
            // host: '/', port: 3001 // if running own peer server
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
            setPeerId(id);
            // We don't really need to send this to server if we use socket signaling entirely
            // But if we used PeerJS server properly, we'd exchange peerIDs.
            // Here we use simplified socket signaling to transport "Offer/Answer" data manually or let PeerJS do it?
            // "WebRTC peerjs for simulation" -> PeerJS simplifies it.
            // It expects peer.connect(peerID).
            // But we don't know the remote peerID unless we exchange it via socket.
        });

        peer.on('call', (call) => {
            // Incoming call via PeerJS (if we knew ID)
            // But since we want to handle signaling manually for learning or robust custom logic:
            // Actually, PeerJS handles signaling if we just exchange IDs.
            // Let's use the socket events 'call_user' to Just send the PeerID!

            navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
                setStream(currentStream);
                if (myVideoRef.current) myVideoRef.current.srcObject = currentStream;

                call.answer(currentStream);

                call.on('stream', (userVideoStream) => {
                    setRemoteStream(userVideoStream);
                    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = userVideoStream;
                });
                setCallStatus('connected');
            });
        });

        // Socket listeners for manual signaling of PeerIDs
        socket.on('call_made', (data) => {
            // Received a call intent
            // data contains: signal (PeerID of caller), from, name
            setIncomingCall(data);
            setCallStatus('receiving');
        });

        return () => {
            peer.destroy();
            socket.off('call_made');
            if (stream) stream.getTracks().forEach(track => track.stop());
        }
    }, [socket]);

    const startCall = () => {
        setCallStatus('calling');
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
            setStream(currentStream);
            if (myVideoRef.current) myVideoRef.current.srcObject = currentStream;

            // Tell the other user to call us? Or we call them?
            // With PeerJS, if I have their ID, I call them.
            // I don't have their ID.
            // So I send MY ID to them via Socket. They use it to call me? Or I wait for them to send theirs?
            // Standard Pattern: I send my PeerID to them via Socket. They Call Me.
            // OR: I wait for their PeerID?
            // Simpler: I send "call_user" with my PeerID. They receive it and `peer.call(myPeerID, stream)`.
            // Wait, standard is Caller calls Callee.
            // Caller needs Callee's PeerID.
            // So Callee must have sent it to server? Or we exchange on connect?

            // Simplest for now: Broadcast PeerID on "call_user".
            // But `peer.call` takes an ID. 
            // Let's assume we send our ID. The RECEIVER calls us back? No that's reverse.
            // Let's assume we exchange IDs.

            // Let's change strategy: We use PeerJS automatic ID generation.
            // We send OUR ID to the recipient via socket `call_user`.
            // The RECIPIENT receives `call_made` with OUR ID.
            // The RECIPIENT calls US? (Reverse calling?)
            // OR The RECIPIENT accepts, sends their ID back, and WE call THEM?

            // Let's go with: Caller sends intent. Recipient sends "I am ready, here is my ID". Caller calls.
            // OR: Both join a room?

            // EASIEST: Caller gets media. Caller emits 'call_user' with { from: socketId, name, ... }.
            // Recipient answers. Recipient emits 'answer_call'.
            // This is for SimplePeer (manual signaling). PeerJS wraps this.

            // If using PeerJS:
            // 1. We need the OTHER person's PeerJS ID.
            // 2. Since we don't store it in DB, we must message them "Hey what's your PeerID?"
            // 3. Or we just use Short-lived Socket signaling to Manual Signal.

            // Let's use SimplePeer logic conceptually but with PeerJS events?
            // No, let's just use manual signaling with `simple-peer` library would be easier for "custom" signaling.
            // But prompt said "WebRTC peerjs".

            // Okay, PeerJS Flow:
            // Both users have a random PeerID.
            // 1. Caller: emits `call_request` via socket to Callee.
            // 2. Callee: receives `call_request`, emits `call_accepted` with THEIR PeerID.
            // 3. Caller: receives `call_accepted`, calls `peer.call(CalleeID, stream)`.
            // 4. Callee: receives `peer.on('call')`, answers.

            socket.emit('call_user', {
                to: activeChat.participants.find(p => p.id !== user.id).id,
                signalData: peerId, // We send OUR ID initially just in case (or just specific msg)
                from: user.id,
                name: user.username
            });
        });
    };

    const answerCall = () => {
        // incomingCall.signal is the CALLER's PeerID.
        // We can call them! 
        setCallStatus('connected');
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
            setStream(currentStream);
            if (myVideoRef.current) myVideoRef.current.srcObject = currentStream;

            // We call the caller using their ID we received
            const call = peerRef.current.call(incomingCall.signal, currentStream);

            call.on('stream', (remoteStream) => {
                setRemoteStream(remoteStream);
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            });
        });
    };

    if (callStatus === 'idle' && !activeChat) return null;

    // Minimal UI
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 p-4 rounded-2xl w-full max-w-2xl relative">
                <button onClick={onClose} className="absolute top-2 right-2 text-white"><XMarkIcon className="w-6 h-6" /></button>

                <h2 className="text-white text-center mb-4">
                    {callStatus === 'idle' ? 'Start Call' :
                        callStatus === 'calling' ? 'Calling...' :
                            callStatus === 'receiving' ? `Incoming Call from ${incomingCall?.name}` : 'Connected'}
                </h2>

                <div className="flex justify-center gap-4 h-64 md:h-96 relative bg-black rounded-xl overflow-hidden">
                    {/* Remote Video */}
                    {remoteStream && (
                        <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover" />
                    )}
                    {/* My Video (PiP) */}
                    <div className="absolute bottom-4 right-4 w-32 h-48 bg-gray-800 rounded-lg overflow-hidden border-2 border-white">
                        <video ref={myVideoRef} autoPlay muted className="w-full h-full object-cover" />
                    </div>
                </div>

                <div className="flex justify-center gap-4 mt-4">
                    {callStatus === 'idle' && (
                        <button onClick={startCall} className="bg-green-600 p-4 rounded-full text-white">
                            <VideoCameraIcon className="w-6 h-6" />
                        </button>
                    )}

                    {callStatus === 'receiving' && (
                        <button onClick={answerCall} className="bg-green-600 p-4 rounded-full text-white animate-pulse">
                            <PhoneIcon className="w-6 h-6" />
                        </button>
                    )}

                    {(callStatus === 'connected' || callStatus === 'calling' || callStatus === 'receiving') && (
                        <button onClick={onClose} className="bg-red-600 p-4 rounded-full text-white">
                            <PhoneIcon className="w-6 h-6 transform rotate-[135deg]" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoCallModal;
