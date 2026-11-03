import { useCallback } from 'react';
import axios from 'axios';
import { assertPinnedPublicKey, encryptForRecipients } from '../../utils/encryption';
import { createClientMessageId } from './messageIds';

export const buildRecipientKeyMap = ({ participants, currentUserId, currentPublicKey }) => {
    const keys = {};
    for (const participant of participants || []) {
        const key = String(participant.id) === String(currentUserId) ? currentPublicKey : participant.publicKey;
        if (!key) throw new Error('A participant encryption key is unavailable');
        keys[participant.id] = key;
    }
    return keys;
};

export const useScheduledMessageSender = ({ chat, userId, publicKey, token, onContactKeyChanged }) => useCallback(async (content, sendAt) => {
    if (!chat || !publicKey) throw new Error('Encryption keys are not ready');
    for (const participant of chat.participants || []) {
        if (String(participant.id) === String(userId)) continue;
        try {
            await assertPinnedPublicKey(participant.id, participant.publicKey);
        } catch (error) {
            if (error.code === 'CONTACT_KEY_CHANGED') onContactKeyChanged?.();
            throw error;
        }
    }
    const recipientPublicKeys = buildRecipientKeyMap({ participants: chat.participants, currentUserId: userId, currentPublicKey: publicKey });
    const encryptedContent = await encryptForRecipients(recipientPublicKeys, content);
    await axios.post(`/api/chats/${chat.id}/scheduled-messages`, {
        content: encryptedContent,
        scheduledFor: sendAt,
        clientMessageId: createClientMessageId('scheduled'),
    }, { headers: { Authorization: `Bearer ${token}` } });
}, [chat, onContactKeyChanged, publicKey, token, userId]);
