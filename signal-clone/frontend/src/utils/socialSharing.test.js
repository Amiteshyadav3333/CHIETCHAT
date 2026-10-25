import { describe, expect, it } from 'vitest';
import { getSocialShareData, getSocialShareTargets } from './socialSharing';

describe('Social sharing', () => {
    it('builds direct sharing links for a post', () => {
        const data = getSocialShareData({ id: 9, caption: 'Hello Social', user: { username: 'amit' } }, 'https://chat.example');
        const targets = getSocialShareTargets(data);
        expect(data.url).toBe('https://chat.example/posts/9');
        expect(decodeURIComponent(targets.whatsapp)).toContain('Hello Social');
        expect(targets.snapchat).toContain('attachmentUrl=');
        expect(targets.sms).toMatch(/^sms:/);
        expect(targets.twitter).toContain('twitter.com/intent/tweet');
    });

    it('creates a different link for each post', () => {
        const first = getSocialShareData({ id: 9 }, 'https://chat.example');
        const second = getSocialShareData({ id: 10 }, 'https://chat.example');
        expect(first.url).toBe('https://chat.example/posts/9');
        expect(second.url).toBe('https://chat.example/posts/10');
        expect(first.url).not.toBe(second.url);
    });
});
