export const hashDevicePin = async pin => Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pin || ''))))
).map(byte => byte.toString(16).padStart(2, '0')).join('');

export const verifyDevicePin = async pin => {
    const savedHash = localStorage.getItem('app_lock_pin_hash');
    return Boolean(savedHash && await hashDevicePin(pin) === savedHash);
};

export const ensureDevicePin = async () => {
    if (localStorage.getItem('app_lock_pin_hash')) return true;
    const pin = window.prompt('Create a 4–6 digit privacy PIN for this browser:');
    if (!/^\d{4,6}$/.test(pin || '')) {
        if (pin !== null) window.alert('PIN must contain 4–6 digits.');
        return false;
    }
    const confirmation = window.prompt('Enter the same PIN again to confirm:');
    if (confirmation !== pin) {
        window.alert('PINs did not match. No lock was enabled.');
        return false;
    }
    localStorage.setItem('app_lock_pin_hash', await hashDevicePin(pin));
    return true;
};
