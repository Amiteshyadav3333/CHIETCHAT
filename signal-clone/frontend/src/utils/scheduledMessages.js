const MAX_SCHEDULE_DELAY_MS = 365 * 24 * 60 * 60 * 1000;

export const normalizeScheduleRequest = (content, localDateTime, now = Date.now()) => {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const sendAtMs = new Date(localDateTime).getTime();
    if (!normalizedContent || normalizedContent.length > 10000 || !Number.isFinite(sendAtMs)) return null;
    if (sendAtMs < now + 60000 || sendAtMs > now + MAX_SCHEDULE_DELAY_MS) return null;
    return { content: normalizedContent, sendAt: new Date(sendAtMs).toISOString() };
};
