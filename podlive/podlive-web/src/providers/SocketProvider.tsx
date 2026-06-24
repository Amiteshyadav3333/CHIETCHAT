"use client";

import { useEffect, useState, createContext, useContext } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { getSocketUrl } from '@/lib/api';

interface SocketContextData {
    socket: Socket | null;
}

const SocketContext = createContext<SocketContextData>({ socket: null });

export const useSocket = () => useContext(SocketContext);

export default function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [inviteData, setInviteData] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        const userData = localStorage.getItem('user');

        const newSocket = io(getSocketUrl());

        newSocket.on('connect', () => {
            const currentUserData = localStorage.getItem('user');
            if (currentUserData) {
                const user = JSON.parse(currentUserData);
                newSocket.emit('register_user', user.id);
            }
        });

        newSocket.on('receive_invite', (data) => {
            setInviteData(data);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const handleAccept = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            // Hit backend REST API to accept if needed, but for now we'll just emit via socket and navigate
            if (socket && inviteData) {
                const userData = localStorage.getItem('user');
                const user = userData ? JSON.parse(userData) : null;

                socket.emit('accept_invite', {
                    sessionId: inviteData.sessionId,
                    hostId: inviteData.host.id,
                    inviteeHandle: user?.unique_handle
                });

                // Also notify REST to create DB entry as accepted
                // (Assuming the backend might need a route for this, or just proceed)

                router.push(`/live/${inviteData.sessionId}`);
                setInviteData(null);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleReject = () => {
        if (socket && inviteData) {
            const userData = localStorage.getItem('user');
            const user = userData ? JSON.parse(userData) : null;

            socket.emit('reject_invite', {
                sessionId: inviteData.sessionId,
                hostId: inviteData.host.id,
                inviteeHandle: user?.unique_handle
            });
            setInviteData(null);
        }
    };

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}

            {/* Stage Invite Modal (Global) */}
            {inviteData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 fade-in">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center mb-4 relative">
                                <span className="absolute inset-0 rounded-full border-4 border-indigo-500 animate-ping opacity-50"></span>
                                <span className="text-2xl text-white font-bold">{inviteData.host.display_name?.charAt(0) || '?'}</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">{inviteData.host.display_name}</h2>
                            <p className="text-zinc-400 mb-8">is inviting you to join the stage live!</p>

                            <div className="flex w-full gap-4">
                                <button
                                    onClick={handleReject}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-zinc-800 text-white hover:bg-red-500/20 hover:text-red-500 transition-colors"
                                >
                                    Decline
                                </button>
                                <button
                                    onClick={handleAccept}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/30"
                                >
                                    Accept
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </SocketContext.Provider>
    );
}
