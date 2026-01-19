import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const { token } = useContext(AuthContext);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (token) {
            // We can pass token in auth object
            const url = import.meta.env.VITE_API_URL || '/';
            const newSocket = io(url, {
                auth: { error: 'e' } // placeholder, actual key passing usually needed
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
