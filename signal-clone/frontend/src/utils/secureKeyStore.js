const DB_NAME = 'cheetchat-secure-vault';
const STORE_NAME = 'keys';
const DEVICE_WRAP_KEY = 'device-wrap-key-v1';

const openVault = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const vaultGet = async (key) => {
    const db = await openVault();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }).finally(() => db.close());
};

const vaultPut = async (key, value) => {
    const db = await openVault();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(value, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    }).finally(() => db.close());
};

const getDeviceWrapKey = async () => {
    let key = await vaultGet(DEVICE_WRAP_KEY);
    if (!key) {
        key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await vaultPut(DEVICE_WRAP_KEY, key);
    }
    return key;
};

const toBase64 = (value) => btoa(String.fromCharCode(...new Uint8Array(value)));
const fromBase64 = (value) => Uint8Array.from(atob(value), character => character.charCodeAt(0));

export const saveDevicePrivateKey = async (userId, privateKeyString) => {
    const wrappingKey = await getDeviceWrapKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, wrappingKey, new TextEncoder().encode(privateKeyString)
    );
    await vaultPut(`private-key:${userId}`, { version: 1, iv: toBase64(iv), data: toBase64(ciphertext) });
    window.localStorage.removeItem(`privKey_${userId}`);
};

export const loadDevicePrivateKey = async (userId) => {
    const legacy = window.localStorage.getItem(`privKey_${userId}`);
    if (legacy) {
        await saveDevicePrivateKey(userId, legacy);
        return legacy;
    }
    const envelope = await vaultGet(`private-key:${userId}`);
    if (!envelope) return null;
    const wrappingKey = await getDeviceWrapKey();
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(envelope.iv) }, wrappingKey, fromBase64(envelope.data)
    );
    return new TextDecoder().decode(plaintext);
};

export const deleteDevicePrivateKey = async (userId) => {
    const db = await openVault();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(`private-key:${userId}`);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    }).finally(() => {
        db.close();
        window.localStorage.removeItem(`privKey_${userId}`);
    });
};
