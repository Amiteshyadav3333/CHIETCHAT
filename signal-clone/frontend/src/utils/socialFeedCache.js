const DB_NAME = 'ducor-social-cache';
const DB_VERSION = 1;
const STORE_NAME = 'feeds';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHED_POSTS = 60;

const memoryCache = new Map();
let databasePromise;

const makeKey = (userId, feed) => `${String(userId)}:${feed}`;

const openDatabase = () => {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
    if (!databasePromise) {
        databasePromise = new Promise(resolve => {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        });
    }
    return databasePromise;
};

const readRecord = (database, key) => new Promise(resolve => {
    try {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    } catch {
        resolve(null);
    }
});

const writeRecord = (database, record) => new Promise(resolve => {
    try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
    } catch {
        resolve(false);
    }
});

export const loadSocialFeedCache = async (userId, feed) => {
    if (!userId || !feed) return null;
    const key = makeKey(userId, feed);
    let record = memoryCache.get(key);
    if (!record) {
        const database = await openDatabase();
        if (database) record = await readRecord(database, key);
    }
    if (!record || !Array.isArray(record.posts)) return null;
    if (!record.updatedAt || Date.now() - record.updatedAt > MAX_CACHE_AGE) {
        memoryCache.delete(key);
        return null;
    }
    memoryCache.set(key, record);
    return record;
};

export const saveSocialFeedCache = async (userId, feed, posts) => {
    if (!userId || !feed || !Array.isArray(posts)) return;
    const key = makeKey(userId, feed);
    const record = { key, posts: posts.slice(0, MAX_CACHED_POSTS), updatedAt: Date.now() };
    memoryCache.set(key, record);
    const database = await openDatabase();
    if (database) await writeRecord(database, record);
};

export const isSocialFeedCacheFresh = updatedAt =>
    Number.isFinite(updatedAt) && Date.now() - updatedAt < 3 * 60 * 1000;

export const clearSocialFeedCache = async userId => {
    if (!userId) return;
    const prefix = `${String(userId)}:`;
    memoryCache.forEach((_, key) => { if (key.startsWith(prefix)) memoryCache.delete(key); });
    const database = await openDatabase();
    if (!database) return;
    await new Promise(resolve => {
        try {
            const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) { resolve(); return; }
                if (cursor.key.startsWith(prefix)) cursor.delete();
                cursor.continue();
            };
            request.onerror = () => resolve();
        } catch { resolve(); }
    });
};
