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
});
