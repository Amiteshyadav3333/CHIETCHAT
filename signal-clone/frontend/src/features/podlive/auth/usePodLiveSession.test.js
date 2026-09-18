// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { clearPodLiveSession, ensurePodLiveSession } from './usePodLiveSession';
import { PODLIVE_STORAGE } from '../config';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const values = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
} });

describe('PodLive session isolation', () => {
    beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

    it('clears only namespaced PodLive credentials', () => {
        localStorage.setItem(PODLIVE_STORAGE.token, 'podlive-token');
        localStorage.setItem(PODLIVE_STORAGE.user, '{}');
        localStorage.setItem('cheetchat_other_setting', 'keep');
        clearPodLiveSession();
        expect(localStorage.getItem(PODLIVE_STORAGE.token)).toBeNull();
        expect(localStorage.getItem(PODLIVE_STORAGE.user)).toBeNull();
        expect(localStorage.getItem('cheetchat_other_setting')).toBe('keep');
    });

    it('uses one CHEETCHAT exchange for simultaneous mobile startup calls', async () => {
        axios.post
            .mockResolvedValueOnce({ data: { ticket: 'one-time-ticket' } })
            .mockResolvedValueOnce({ data: { accessToken: 'pod-token', refreshToken: 'refresh', user: { id: 'p1' } } });
        const [first, second] = await Promise.all([ensurePodLiveSession(), ensurePodLiveSession()]);
        expect(first).toEqual({ id: 'p1' });
        expect(second).toEqual({ id: 'p1' });
        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem(PODLIVE_STORAGE.token)).toBe('pod-token');
    });

    it('automatically replaces an expired PodLive token through CHEETCHAT SSO', async () => {
        localStorage.setItem(PODLIVE_STORAGE.token, 'expired');
        localStorage.setItem(PODLIVE_STORAGE.user, JSON.stringify({ id: 'old' }));
        axios.get.mockRejectedValueOnce({ response: { status: 401 } });
        axios.post
            .mockResolvedValueOnce({ data: { ticket: 'fresh-ticket' } })
            .mockResolvedValueOnce({ data: { accessToken: 'fresh', refreshToken: 'refresh', user: { id: 'new' } } });
        const user = await ensurePodLiveSession({ validate: true });
        expect(user).toEqual({ id: 'new' });
        expect(localStorage.getItem(PODLIVE_STORAGE.token)).toBe('fresh');
    });
});
