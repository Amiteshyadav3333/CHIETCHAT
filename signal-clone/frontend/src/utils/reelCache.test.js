// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearReelCache, loadReelCache, saveReelCache } from './reelCache';

let values;
beforeEach(() => {
    values = new Map();
    Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: {
            getItem: key => values.has(key) ? values.get(key) : null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key),
        },
    });
});

describe('reels cache', () => {
    it('isolates personalized feeds by account', () => {
        saveReelCache(1, [{ id: 10, isLiked: true }]);
        saveReelCache(2, [{ id: 20, isLiked: false }]);
        expect(loadReelCache(1)[0].id).toBe(10);
        expect(loadReelCache(2)[0].id).toBe(20);
        clearReelCache(1);
        expect(loadReelCache(1)).toEqual([]);
        expect(loadReelCache(2)).toHaveLength(1);
    });

    it('deletes the unscoped legacy feed without migration', () => {
        window.sessionStorage.setItem('reels_cache', JSON.stringify([{ id: 99 }]));
        expect(loadReelCache(1)).toEqual([]);
        expect(window.sessionStorage.getItem('reels_cache')).toBeNull();
    });
});
