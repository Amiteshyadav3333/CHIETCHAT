import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { AuthContext } from './AuthContext';
import { API_BASE_URL } from '../utils/apiBaseUrl';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { token } = useContext(AuthContext);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (token) {
            // We can pass token in auth object
            const url = API_BASE_URL || '/';
            const newSocket = io(url, {
                auth: token === 'cookie-session' ? {} : { token },
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
