// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadChatMetadata, saveChatMetadata } from './chatMetadataCache';

let values;
beforeEach(() => {
    values = new Map();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: key => values.has(key) ? values.get(key) : null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key),
        },
    });
});

describe('chat metadata cache', () => {
    it('removes decrypted previews and isolates cached lists by account', () => {
        const saved = saveChatMetadata(1, [{
            id: 10, name: 'Friend', lastMessage: { content: 'private preview', type: 'text', timestamp: 'now' },
        }]);
        expect(saved[0].lastMessage).toEqual({ type: 'text', timestamp: 'now' });
        expect([...values.values()].join('')).not.toContain('private preview');
        expect(loadChatMetadata(1)).toHaveLength(1);
        expect(loadChatMetadata(2)).toEqual([]);
    });

    it('deletes the unsafe legacy cache without migration', () => {
        window.localStorage.setItem('cached_chats', JSON.stringify([{
            id: 10, lastMessage: { content: 'legacy secret' },
        }]));
        expect(loadChatMetadata(1)).toEqual([]);
        expect(window.localStorage.getItem('cached_chats')).toBeNull();
    });

    it('sanitizes a tampered account cache before returning it', () => {
        saveChatMetadata(1, [{ id: 10, lastMessage: { type: 'image' } }]);
        const key = [...values.keys()].find(item => item.includes('cheetchat_chat_metadata'));
        window.localStorage.setItem(key, JSON.stringify([{
            id: 10, lastMessage: { content: 'injected plaintext', type: 'text' },
        }]));
        expect(loadChatMetadata(1)[0].lastMessage).toEqual({ type: 'text' });
        expect(window.localStorage.getItem(key)).not.toContain('injected plaintext');
    });
});
