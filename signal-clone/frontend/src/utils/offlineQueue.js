import { isEncryptedPayload } from './encryption';

const queueKey = userId => `cheetchat_offline_messages:${userId}`;

export const getOfflineQueue = (userId) => {
    if (!userId) return [];
    try {
        const stored = window.localStorage.getItem(queueKey(userId));
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Error reading offline queue', error);
        return [];
    }
};

export const enqueueOfflineMessage = (
    userId, chatId, content, type, replyTo = null, disappearingTtl = 0, clientMessageId = null,
    assetId = null, scheduledFor = null,
) => {
    if (!userId || !chatId) throw new Error('User and chat are required for offline delivery');
    if (!isEncryptedPayload(content)) throw new Error('Offline messages must be encrypted before storage');
    const queue = getOfflineQueue(userId);
    const tempId = clientMessageId || `temp-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const existing = queue.find(message => message.tempId === tempId);
    if (existing) return existing;
    const safeReplyReference = replyTo?.id ? { id: replyTo.id } : null;
    const message = {
        tempId, userId, chatId, content, type, replyTo: safeReplyReference, disappearingTtl, assetId, scheduledFor,
        timestamp: new Date().toISOString(), status: 'sending',
    };
    queue.push(message);
    window.localStorage.setItem(queueKey(userId), JSON.stringify(queue));
    return message;
};

export const dequeueOfflineMessage = (userId, tempId) => {
    const queue = getOfflineQueue(userId).filter(message => message.tempId !== tempId);
    window.localStorage.setItem(queueKey(userId), JSON.stringify(queue));
};

export const clearOfflineQueue = userId => window.localStorage.removeItem(queueKey(userId));

export const processOfflineQueue = async (userId, sendFunction, batchSize = 15) => {
    const queue = getOfflineQueue(userId)
        .filter(message => !message.scheduledFor || new Date(message.scheduledFor).getTime() <= Date.now())
        .slice(0, Math.max(1, batchSize));
    for (const message of queue) {
        try {
            await sendFunction(message);
            dequeueOfflineMessage(userId, message.tempId);
        } catch (error) {
            console.error('Failed to send offline message', message, error);
            break;
        }
    }
};
