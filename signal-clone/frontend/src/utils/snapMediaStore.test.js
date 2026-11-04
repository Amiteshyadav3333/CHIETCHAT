import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { getEncryptedSnapMedia, saveEncryptedSnapMedia, setChatSnapMediaExpiry } from './snapMediaStore';

describe('direct Snap media store', () => {
    beforeEach(async () => {
        vi.useRealTimers();
        const localValues = new Map();
        globalThis.localStorage = {
            getItem: key => localValues.has(key) ? localValues.get(key) : null,
            setItem: (key, value) => localValues.set(key, String(value)),
            removeItem: key => localValues.delete(key),
        };
        await new Promise(resolve => {
            const request = indexedDB.deleteDatabase('cheetchat-snap-media');
            request.onsuccess = resolve;
            request.onerror = resolve;
            request.onblocked = resolve;
        });
    });

    it('stores and retrieves only the encrypted video bytes locally', async () => {
        const transferId = crypto.randomUUID();
        const encryptedBlob = new Blob(['ciphertext bytes'], { type: 'application/octet-stream' });
        await saveEncryptedSnapMedia(transferId, encryptedBlob, { chatId: 7, kind: 'video' });
        const restored = await getEncryptedSnapMedia(transferId);
        expect(await restored.text()).toBe('ciphertext bytes');
        expect(restored.type).toBe('application/octet-stream');
    });

    it('expires stored video after ten minutes', async () => {
        const transferId = crypto.randomUUID();
        const now = Date.now();
        await saveEncryptedSnapMedia(transferId, new Blob(['encrypted']), { chatId: 7, kind: 'video' });
        await setChatSnapMediaExpiry(7, new Date(now + 10 * 60 * 1000).toISOString());
        vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000 + 1);
        await expect(getEncryptedSnapMedia(transferId)).rejects.toThrow('This direct Snap video has expired.');
        vi.restoreAllMocks();
    });
});
