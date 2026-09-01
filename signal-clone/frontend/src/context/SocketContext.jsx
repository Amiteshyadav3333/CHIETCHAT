import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { AuthContext } from './AuthContext';
import { API_BASE_URL, SOCKET_BASE_URL } from '../utils/apiBaseUrl';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { token } = useContext(AuthContext);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (token) {
            // We can pass token in auth object
            // Dev mein: Vite proxy `/socket.io` ko backend pe forward karta hai (ws: true).
            // Isliye dev mein always same-origin '/' use karo — direct backend URL dene se
            // browser `ws://localhost:5001` open karta hai jahan CORS header nahi hota,
            // result: "Invalid frame header" error.
            // Prod mein: direct backend URL use hoti hai (Vercel WebSocket proxy nahi karta).
            const url = import.meta.env.PROD ? SOCKET_BASE_URL : '/';
            const newSocket = io(url, {
                auth: async (callback) => {
                    if (token !== 'cookie-session') {
                        callback({ token });
                        return;
                    }
                    try {
                        const response = await axios.get('/api/auth/socket-ticket');
                        callback({ token: response.data.ticket });
                    } catch {
                        callback({});
                    }
                },
                withCredentials: true,
                transports: ['websocket', 'polling'],
                upgrade: true,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 15000
            });
            setSocket(newSocket);

            return () => newSocket.close();
        }
    }, [token]);

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    );
};
