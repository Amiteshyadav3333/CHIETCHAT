const DB_NAME = 'cheetchat-snap-media';
const STORE_NAME = 'encrypted-media';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const openStore = () => new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('This browser cannot store direct Snap videos locally.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'transferId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local Snap storage.'));
});

export const saveEncryptedSnapMedia = async (transferId, blob, metadata = {}) => {
    const db = await openStore();
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const sessionExpiry = metadata.chatId ? Number(globalThis.localStorage?.getItem(`snap_media_expiry_${metadata.chatId}`) || 0) : 0;
            transaction.objectStore(STORE_NAME).put({ transferId, blob, metadata, savedAt: Date.now(), expiresAt: sessionExpiry || null });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Could not save direct Snap video locally.'));
            transaction.onabort = () => reject(transaction.error || new Error('Local Snap storage is full.'));
        });
    } finally { db.close(); }
};

export const getEncryptedSnapMedia = async transferId => {
    const db = await openStore();
    try {
        const result = await new Promise((resolve, reject) => {
            const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(transferId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Could not read local Snap video.'));
        });
        if (!result) throw new Error('This direct Snap video is only available on the device that received it.');
        if ((result.expiresAt && Date.now() > result.expiresAt) || Date.now() - result.savedAt > MAX_AGE_MS) {
            await deleteEncryptedSnapMedia(transferId);
            throw new Error('This direct Snap video has expired.');
        }
        return result.blob;
    } finally { db.close(); }
};

export const setChatSnapMediaExpiry = async (chatId, expiresAt) => {
    if (!chatId) return;
    const key = `snap_media_expiry_${chatId}`;
    if (!expiresAt) {
        globalThis.localStorage?.removeItem(key);
        return;
    }
    globalThis.localStorage?.setItem(key, String(new Date(expiresAt).getTime()));
    const db = await openStore();
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                if (Number(cursor.value.metadata?.chatId) === Number(chatId)) {
                    cursor.update({ ...cursor.value, expiresAt: new Date(expiresAt).getTime() });
                }
                cursor.continue();
            };
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Could not update Snap media expiry.'));
        });
    } finally { db.close(); }
};

export const deleteEncryptedSnapMedia = async transferId => {
    const db = await openStore();
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).delete(transferId);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Could not delete expired Snap video.'));
        });
    } finally { db.close(); }
};
