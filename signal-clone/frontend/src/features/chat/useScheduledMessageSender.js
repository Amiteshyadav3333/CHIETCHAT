import { useCallback } from 'react';
import axios from 'axios';
import { encryptForRecipients } from '../../utils/encryption';
import { createClientMessageId } from './messageIds';

export const buildRecipientKeyMap = ({ participants, currentUserId, currentPublicKey }) => {
    const keys = {};
    for (const participant of participants || []) {
        const key = participant.id === currentUserId ? currentPublicKey : participant.publicKey;
        if (!key) throw new Error('A participant encryption key is unavailable');
        keys[participant.id] = key;
    }
    return keys;
};

export const useScheduledMessageSender = ({ chat, userId, publicKey, token }) => useCallback(async (content, sendAt) => {
    if (!chat || !publicKey) throw new Error('Encryption keys are not ready');
    const recipientPublicKeys = buildRecipientKeyMap({ participants: chat.participants, currentUserId: userId, currentPublicKey: publicKey });
    const encryptedContent = await encryptForRecipients(recipientPublicKeys, content);
    await axios.post(`/api/chats/${chat.id}/scheduled-messages`, {
        content: encryptedContent,
        scheduledFor: sendAt,
        clientMessageId: createClientMessageId('scheduled'),
    }, { headers: { Authorization: `Bearer ${token}` } });
}, [chat, publicKey, token, userId]);
