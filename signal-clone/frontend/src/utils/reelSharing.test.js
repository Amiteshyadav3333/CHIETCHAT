import { describe, expect, it } from 'vitest';
import { getReelShareData, getReelShareTargets } from './reelSharing';

describe('Reel sharing', () => {
    it('builds direct share links from a Reel', () => {
        const data = getReelShareData({ id: 42, caption: 'Hello world', user: { username: 'amit' } }, 'https://chat.example');
        const targets = getReelShareTargets(data);
        expect(data.url).toBe('https://chat.example/reels/42');
        expect(decodeURIComponent(targets.whatsapp)).toContain('Hello world');
        expect(targets.snapchat).toContain('attachmentUrl=');
        expect(targets.sms).toMatch(/^sms:/);
        expect(targets.twitter).toContain('twitter.com/intent/tweet');
    });

    it('creates a different link for each Reel', () => {
        const first = getReelShareData({ id: 42 }, 'https://chat.example');
        const second = getReelShareData({ id: 43 }, 'https://chat.example');
        expect(first.url).toBe('https://chat.example/reels/42');
        expect(second.url).toBe('https://chat.example/reels/43');
        expect(first.url).not.toBe(second.url);
    });
});
