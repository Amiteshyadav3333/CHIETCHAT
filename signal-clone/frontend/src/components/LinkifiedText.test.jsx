import { describe, expect, it } from 'vitest';
import { splitLinkifiedText } from './LinkifiedText';

describe('splitLinkifiedText', () => {
    it('turns HTTPS and www URLs into safe links', () => {
        expect(splitLinkifiedText('See https://example.com/a and www.cheetchat.com')).toEqual([
            { type: 'text', value: 'See ' },
            { type: 'link', value: 'https://example.com/a', href: 'https://example.com/a' },
            { type: 'text', value: ' and ' },
            { type: 'link', value: 'www.cheetchat.com', href: 'https://www.cheetchat.com/' },
        ]);
    });

    it('leaves sentence punctuation outside the link', () => {
        expect(splitLinkifiedText('Visit https://example.com/path.')).toEqual([
            { type: 'text', value: 'Visit ' },
            { type: 'link', value: 'https://example.com/path', href: 'https://example.com/path' },
            { type: 'text', value: '.' },
        ]);
    });

    it('does not link unsupported schemes', () => {
        expect(splitLinkifiedText('javascript:alert(1)')).toEqual([
            { type: 'text', value: 'javascript:alert(1)' },
        ]);
    });
});
