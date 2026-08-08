import { describe, expect, it } from 'vitest';
import { amazonSearchUrl } from './ShoppingSearchModal';

describe('shopping handoff', () => {
    it('keeps the destination on Amazon India and encodes untrusted search text', () => {
        const url = new URL(amazonSearchUrl('phone & laptop #sale'));

        expect(url.protocol).toBe('https:');
        expect(url.hostname).toBe('www.amazon.in');
        expect(url.searchParams.get('k')).toBe('phone & laptop #sale');
    });
});
