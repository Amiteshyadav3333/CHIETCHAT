// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearOfflineQueue, enqueueOfflineMessage, getOfflineQueue, processOfflineQueue,
} from './offlineQueue';

const encrypted = label => JSON.stringify({ encrypted: true, recipients: { 1: `key-${label}` }, data: label });

beforeEach(() => {
    const values = new Map();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: key => values.has(key) ? values.get(key) : null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key),
        },
    });
});

describe('offline message queue', () => {
    it('isolates queues by account and preserves caller client IDs', () => {
        enqueueOfflineMessage(1, 10, encrypted('first'), 'image', null, 0, 'client-stable-id', 'asset-123');
        enqueueOfflineMessage(1, 10, encrypted('duplicate'), 'text', null, 0, 'client-stable-id');
        enqueueOfflineMessage(2, 20, encrypted('second-user'), 'text');
        expect(getOfflineQueue(1)).toHaveLength(1);
        expect(getOfflineQueue(1)[0].tempId).toBe('client-stable-id');
        expect(getOfflineQueue(1)[0].assetId).toBe('asset-123');
        expect(getOfflineQueue(2)).toHaveLength(1);
        clearOfflineQueue(1);
        expect(getOfflineQueue(1)).toEqual([]);
        expect(getOfflineQueue(2)).toHaveLength(1);
    });

    it('dequeues only after acknowledgement and stops on first failure', async () => {
        enqueueOfflineMessage(1, 10, encrypted('one'), 'text', null, 0, 'one');
        enqueueOfflineMessage(1, 10, encrypted('two'), 'text', null, 0, 'two');
        const failedSend = vi.fn().mockRejectedValue(new Error('no acknowledgement'));
        await processOfflineQueue(1, failedSend);
        expect(getOfflineQueue(1).map(message => message.tempId)).toEqual(['one', 'two']);

        const successfulSend = vi.fn().mockResolvedValue({ ok: true });
        await processOfflineQueue(1, successfulSend);
        expect(getOfflineQueue(1)).toEqual([]);
        expect(successfulSend).toHaveBeenCalledTimes(2);
    });

    it('refuses to persist plaintext message content', () => {
        expect(() => enqueueOfflineMessage(1, 10, 'private plaintext', 'text')).toThrow(/encrypted/i);
        expect(window.localStorage.getItem('cheetchat_offline_messages:1')).toBeNull();
    });

    it('stores only an opaque reply ID instead of quoted plaintext metadata', () => {
        enqueueOfflineMessage(1, 10, encrypted('reply'), 'text', {
            id: 77, content: 'quoted private text', senderName: 'Private Person', type: 'text',
        });
        const serialized = window.localStorage.getItem('cheetchat_offline_messages:1');
        expect(serialized).not.toContain('quoted private text');
        expect(serialized).not.toContain('Private Person');
        expect(getOfflineQueue(1)[0].replyTo).toEqual({ id: 77 });
    });

    it('holds future scheduled envelopes while delivering due messages', async () => {
        enqueueOfflineMessage(1, 10, encrypted('future'), 'text', null, 0, 'future', null, '2999-01-01T00:00:00.000Z');
        enqueueOfflineMessage(1, 10, encrypted('due'), 'text', null, 0, 'due', null, '2000-01-01T00:00:00.000Z');
        const send = vi.fn().mockResolvedValue({ ok: true });

        await processOfflineQueue(1, send);

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].tempId).toBe('due');
        expect(getOfflineQueue(1).map(message => message.tempId)).toEqual(['future']);
    });
});
