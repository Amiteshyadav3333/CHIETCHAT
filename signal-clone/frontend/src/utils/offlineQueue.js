// Manage offline message queue in localStorage
const QUEUE_KEY = 'cheetchat_offline_messages';

export const getOfflineQueue = () => {
    try {
        const stored = localStorage.getItem(QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Error reading offline queue", e);
        return [];
    }
};

export const enqueueOfflineMessage = (chatId, content, type, replyTo = null, disappearingTtl = 0) => {
    const queue = getOfflineQueue();
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const newMsg = {
        tempId,
        chatId,
        content,
        type,
        replyTo,
        disappearingTtl,
        timestamp: new Date().toISOString(),
        status: 'sending'
    };
    queue.push(newMsg);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return newMsg;
};

export const dequeueOfflineMessage = (tempId) => {
    let queue = getOfflineQueue();
    queue = queue.filter(msg => msg.tempId !== tempId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const clearOfflineQueue = () => {
    localStorage.removeItem(QUEUE_KEY);
};

export const processOfflineQueue = async (sendFunction) => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} offline messages...`);
    for (const msg of queue) {
        try {
            await sendFunction(msg);
            dequeueOfflineMessage(msg.tempId);
        } catch (err) {
            console.error("Failed to send offline message", msg, err);
            // Stop processing if send failed (network might be offline again)
            break;
        }
    }
};
