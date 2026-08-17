export const createClientMessageId = prefix => {
    const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${unique}`;
};
