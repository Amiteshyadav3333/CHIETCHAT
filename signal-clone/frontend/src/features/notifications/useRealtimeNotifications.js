import { useEffect } from 'react';
import { normalizeRealtimeNotification } from './notificationModel';

export const useRealtimeNotifications = ({ socket, onNotification }) => {
    useEffect(() => {
        if (!socket) return undefined;
        const receive = payload => onNotification(normalizeRealtimeNotification(payload));
        socket.on('new_notification', receive);
        return () => socket.off('new_notification', receive);
    }, [onNotification, socket]);
};
