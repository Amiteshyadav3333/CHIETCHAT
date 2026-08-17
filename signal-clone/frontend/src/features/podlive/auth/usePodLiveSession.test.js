// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearPodLiveSession } from './usePodLiveSession';
import { PODLIVE_STORAGE } from '../config';

const values = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
} });

describe('PodLive session isolation', () => {
    beforeEach(() => localStorage.clear());

    it('clears only namespaced PodLive credentials', () => {
        localStorage.setItem(PODLIVE_STORAGE.token, 'podlive-token');
        localStorage.setItem(PODLIVE_STORAGE.user, '{}');
        localStorage.setItem('cheetchat_other_setting', 'keep');
        clearPodLiveSession();
        expect(localStorage.getItem(PODLIVE_STORAGE.token)).toBeNull();
        expect(localStorage.getItem(PODLIVE_STORAGE.user)).toBeNull();
        expect(localStorage.getItem('cheetchat_other_setting')).toBe('keep');
    });
});
