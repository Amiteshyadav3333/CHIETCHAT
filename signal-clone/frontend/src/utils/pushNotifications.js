import axios from 'axios';

const urlBase64ToUint8Array = (value) => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
};

export const enablePushNotifications = async (token) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Background notifications are not supported on this browser.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    const config = await axios.get('/api/push/config', { headers: { Authorization: `Bearer ${token}` } });
    if (!config.data.enabled || !config.data.publicKey) throw new Error('Background notifications are not configured yet.');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(config.data.publicKey),
        });
    }
    await axios.post('/api/push/subscriptions', subscription.toJSON(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    return subscription;
};

export const disablePushNotifications = async (token) => {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    let serverError = null;
    try {
        await axios.delete('/api/push/subscriptions', {
            headers: { Authorization: `Bearer ${token}` }, data: { endpoint: subscription.endpoint },
        });
    } catch (error) {
        serverError = error;
    } finally {
        await subscription.unsubscribe();
    }
    if (serverError) throw serverError;
};
