import { isEncryptedPayload } from './encryption';

const CACHE_PREFIX = 'cheetchat_encrypted_messages:v1';
const LEGACY_PREFIX = 'cached_messages_';

const cacheKey = (userId, chatId) => `${CACHE_PREFIX}:${userId}:${chatId}`;

const isSafeCachedMessage = message => (
    message && typeof message === 'object' && message.id != null &&
    typeof message.content === 'string' && isEncryptedPayload(message.content)
);

export const purgeLegacyMessageCaches = () => {
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(LEGACY_PREFIX)) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
    return keys.length;
};

export const saveEncryptedMessages = (userId, chatId, messages) => {
    if (!userId || !chatId || !Array.isArray(messages)) return [];
    const encryptedOnly = messages.filter(isSafeCachedMessage);
    window.localStorage.setItem(cacheKey(userId, chatId), JSON.stringify(encryptedOnly));
    // Earlier releases stored decrypted message bodies under this key.
    window.localStorage.removeItem(`${LEGACY_PREFIX}${chatId}`);
    return encryptedOnly;
};

export const loadEncryptedMessages = (userId, chatId) => {
    if (!userId || !chatId) return [];
    // Never migrate the legacy value: it may contain plaintext.
    window.localStorage.removeItem(`${LEGACY_PREFIX}${chatId}`);
    try {
        const stored = window.localStorage.getItem(cacheKey(userId, chatId));
        const parsed = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(parsed) || parsed.some(message => !isSafeCachedMessage(message))) {
            window.localStorage.removeItem(cacheKey(userId, chatId));
            return [];
        }
        return parsed;
    } catch {
        window.localStorage.removeItem(cacheKey(userId, chatId));
        return [];
    }
};

export const clearEncryptedMessageCache = (userId, chatId) => {
    if (userId && chatId) window.localStorage.removeItem(cacheKey(userId, chatId));
    if (chatId) window.localStorage.removeItem(`${LEGACY_PREFIX}${chatId}`);
};

export const clearAccountEncryptedMessageCaches = userId => {
    if (!userId) return 0;
    const accountPrefix = `${CACHE_PREFIX}:${userId}:`;
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(accountPrefix)) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
    return keys.length;
};

export const upsertEncryptedMessage = (userId, chatId, message) => {
    if (!isSafeCachedMessage(message)) return false;
    const current = loadEncryptedMessages(userId, chatId);
    const index = current.findIndex(item => String(item.id) === String(message.id));
    if (index === -1) current.push(message);
    else current[index] = { ...current[index], ...message };
    saveEncryptedMessages(userId, chatId, current);
    return true;
};

export const updateEncryptedMessageContent = (userId, chatId, messageId, content, editedAt) => {
    if (!isEncryptedPayload(content)) return false;
    const current = loadEncryptedMessages(userId, chatId);
    const message = current.find(item => String(item.id) === String(messageId));
    if (!message) return false;
    message.content = content;
    message.editedAt = editedAt;
    saveEncryptedMessages(userId, chatId, current);
    return true;
};

export const removeEncryptedMessage = (userId, chatId, messageId) => {
    const current = loadEncryptedMessages(userId, chatId);
    saveEncryptedMessages(userId, chatId, current.filter(item => String(item.id) !== String(messageId)));
};
