import { useCallback, useEffect, useRef, useState } from 'react';

export const LIVE_LOCATION_DURATIONS = [15, 30, 60, 480];
export const normalizeLiveLocationDuration = value => LIVE_LOCATION_DURATIONS.includes(Number(value)) ? Number(value) : 30;

export const applyLiveLocationUpdate = (messages, update) => messages.map(message => (
    message.type === 'live_location' && message.senderId === update.userId
        ? { ...message, content: JSON.stringify({ ...safeLocationContent(message.content), lat: update.lat, lng: update.lng }) }
        : message
));

const safeLocationContent = content => {
    try { return JSON.parse(content) || {}; } catch { return {}; }
};

export const useLiveLocationSharing = ({ socket, sendLocationMessage, onError }) => {
    const sharingRef = useRef(null);
    const [sharing, setSharing] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null);

    const stop = useCallback(() => {
        const current = sharingRef.current;
        if (current?.watchId != null) navigator.geolocation.clearWatch(current.watchId);
        if (current?.timerId) window.clearInterval(current.timerId);
        sharingRef.current = null;
        setSharing(null);
        setTimeLeft(null);
    }, []);

    const start = useCallback((chatId, durationMinutes = 30) => {
        stop();
        const normalizedMinutes = normalizeLiveLocationDuration(durationMinutes);
        const durationMs = normalizedMinutes * 60 * 1000;
        const expiry = Date.now() + durationMs;
        let initialMessageSent = false;
        const watchId = navigator.geolocation.watchPosition(position => {
            if (Date.now() >= expiry) return stop();
            const payload = { lat: position.coords.latitude, lng: position.coords.longitude };
            socket.emit('live_location_update', { chatId, ...payload });
            if (!initialMessageSent) {
                initialMessageSent = true;
                sendLocationMessage({ ...payload, expiresAt: new Date(expiry).toISOString(), durationMinutes: normalizedMinutes });
            }
        }, error => {
            if (!initialMessageSent) onError?.(error);
        }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });

        const timerId = window.setInterval(() => {
            const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (!remaining) stop();
        }, 1000);
        const current = { chatId, expiry, watchId, timerId };
        sharingRef.current = current;
        setSharing(current);
        setTimeLeft(durationMs / 1000);
    }, [onError, sendLocationMessage, socket, stop]);

    useEffect(() => () => {
        const current = sharingRef.current;
        if (current?.watchId != null) navigator.geolocation.clearWatch(current.watchId);
        if (current?.timerId) window.clearInterval(current.timerId);
        sharingRef.current = null;
    }, []);
    return { liveLocationSharing: sharing, timeLeft, startLiveLocation: start, stopLiveLocation: stop };
};
