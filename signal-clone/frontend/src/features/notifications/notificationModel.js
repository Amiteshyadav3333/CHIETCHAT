export const normalizeRealtimeNotification = data => ({
    id: data.id,
    type: data.type,
    content: data.content,
    targetId: data.targetId,
    postPreview: data.postPreview || null,
    isRead: false,
    createdAt: data.createdAt,
    sender: data.sender || {
        id: null,
        username: data.senderName || 'Someone',
        avatar: data.senderAvatar || null,
    },
});
