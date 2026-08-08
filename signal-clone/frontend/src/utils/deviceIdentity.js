const DEVICE_KEY = 'cheetchat_device_id';

export const getDeviceFingerprint = () => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(DEVICE_KEY, id);
    }
    const platform = navigator.userAgentData?.platform || navigator.platform || 'web';
    return `${platform}:${id}`.slice(0, 255);
};
