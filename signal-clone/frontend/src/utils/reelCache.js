const PREFIX = 'cheetchat_reels:v1';
const LEGACY_KEY = 'reels_cache';

const keyFor = userId => `${PREFIX}:${userId}`;

export const loadReelCache = userId => {
    window.sessionStorage.removeItem(LEGACY_KEY);
    if (!userId) return [];
    try {
        const parsed = JSON.parse(window.sessionStorage.getItem(keyFor(userId)) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        window.sessionStorage.removeItem(keyFor(userId));
        return [];
    }
};

export const saveReelCache = (userId, reels) => {
    window.sessionStorage.removeItem(LEGACY_KEY);
    if (!userId || !Array.isArray(reels)) return;
    window.sessionStorage.setItem(keyFor(userId), JSON.stringify(reels));
};

export const clearReelCache = userId => {
    window.sessionStorage.removeItem(LEGACY_KEY);
    if (userId) window.sessionStorage.removeItem(keyFor(userId));
};
