const CACHE_PREFIX = 'cheetchat_chat_metadata:v1';
const LEGACY_KEY = 'cached_chats';

const cacheKey = userId => `${CACHE_PREFIX}:${userId}`;

const stripPrivatePreview = chat => {
    if (!chat || typeof chat !== 'object' || chat.id == null) return null;
    const safe = { ...chat };
    if (safe.lastMessage && typeof safe.lastMessage === 'object') {
        const metadata = { ...safe.lastMessage };
        delete metadata.content;
        safe.lastMessage = metadata;
    }
    return safe;
};

export const saveChatMetadata = (userId, chats) => {
    window.localStorage.removeItem(LEGACY_KEY);
    if (!userId || !Array.isArray(chats)) return [];
    const safeChats = chats.map(stripPrivatePreview).filter(Boolean);
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(safeChats));
    return safeChats;
};

export const loadChatMetadata = userId => {
    // Earlier versions mixed accounts and stored decrypted last-message previews.
    window.localStorage.removeItem(LEGACY_KEY);
    if (!userId) return [];
    try {
        const stored = window.localStorage.getItem(cacheKey(userId));
        const parsed = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(parsed)) throw new Error('Invalid chat metadata cache');
        const safeChats = parsed.map(stripPrivatePreview).filter(Boolean);
        if (safeChats.length !== parsed.length) throw new Error('Invalid chat metadata record');
        window.localStorage.setItem(cacheKey(userId), JSON.stringify(safeChats));
        return safeChats;
    } catch {
        window.localStorage.removeItem(cacheKey(userId));
        return [];
    }
};

export const clearChatMetadata = userId => {
    window.localStorage.removeItem(LEGACY_KEY);
    if (userId) window.localStorage.removeItem(cacheKey(userId));
};
