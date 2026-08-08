// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearAccountEncryptedMessageCaches, loadEncryptedMessages, purgeLegacyMessageCaches, removeEncryptedMessage, saveEncryptedMessages,
    updateEncryptedMessageContent, upsertEncryptedMessage,
} from './encryptedMessageCache';

const encrypted = label => JSON.stringify({ encrypted: true, recipients: { 1: `key-${label}` }, data: label });

let values;
beforeEach(() => {
    values = new Map();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: key => values.has(key) ? values.get(key) : null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key),
            key: index => [...values.keys()][index] || null,
            get length() { return values.size; },
        },
    });
});

describe('encrypted message cache', () => {
    it('persists only encrypted server records and isolates accounts', () => {
        const saved = saveEncryptedMessages(1, 10, [
            { id: 1, content: encrypted('safe') },
            { id: 2, content: 'private plaintext' },
        ]);
        expect(saved).toHaveLength(1);
        expect([...values.values()].join('')).not.toContain('private plaintext');
        expect(loadEncryptedMessages(1, 10)).toHaveLength(1);
        expect(loadEncryptedMessages(2, 10)).toEqual([]);
    });

    it('deletes legacy plaintext and rejects tampered cache entries', () => {
        window.localStorage.setItem('cached_messages_10', JSON.stringify([{ id: 1, content: 'secret' }]));
        expect(loadEncryptedMessages(1, 10)).toEqual([]);
        expect(window.localStorage.getItem('cached_messages_10')).toBeNull();

        saveEncryptedMessages(1, 10, [{ id: 1, content: encrypted('safe') }]);
        const key = [...values.keys()].find(item => item.includes('cheetchat_encrypted_messages'));
        window.localStorage.setItem(key, JSON.stringify([{ id: 1, content: 'tampered plaintext' }]));
        expect(loadEncryptedMessages(1, 10)).toEqual([]);
        expect(window.localStorage.getItem(key)).toBeNull();
    });

    it('upserts socket messages and applies only encrypted edits', () => {
        expect(upsertEncryptedMessage(1, 10, { id: 7, content: encrypted('one') })).toBe(true);
        expect(upsertEncryptedMessage(1, 10, { id: 7, content: encrypted('newer'), status: 'delivered' })).toBe(true);
        expect(loadEncryptedMessages(1, 10)).toHaveLength(1);
        expect(loadEncryptedMessages(1, 10)[0].status).toBe('delivered');
        expect(updateEncryptedMessageContent(1, 10, 7, 'plaintext edit')).toBe(false);
        expect(updateEncryptedMessageContent(1, 10, 7, encrypted('edited'), 'now')).toBe(true);
        removeEncryptedMessage(1, 10, 7);
        expect(loadEncryptedMessages(1, 10)).toEqual([]);
    });

    it('purges every legacy plaintext cache at startup', () => {
        window.localStorage.setItem('cached_messages_10', 'private one');
        window.localStorage.setItem('cached_messages_20', 'private two');
        window.localStorage.setItem('cached_chats', 'safe metadata');
        expect(purgeLegacyMessageCaches()).toBe(2);
        expect(window.localStorage.getItem('cached_messages_10')).toBeNull();
        expect(window.localStorage.getItem('cached_messages_20')).toBeNull();
        expect(window.localStorage.getItem('cached_chats')).toBe('safe metadata');
    });

    it('clears only the signed-out account encrypted history', () => {
        saveEncryptedMessages(1, 10, [{ id: 1, content: encrypted('one') }]);
        saveEncryptedMessages(1, 20, [{ id: 2, content: encrypted('two') }]);
        saveEncryptedMessages(2, 10, [{ id: 3, content: encrypted('other') }]);
        expect(clearAccountEncryptedMessageCaches(1)).toBe(2);
        expect(loadEncryptedMessages(1, 10)).toEqual([]);
        expect(loadEncryptedMessages(2, 10)).toHaveLength(1);
    });
});
