import { describe, expect, it } from 'vitest';
import { normalizePoll } from './PollCreatorModal';

describe('poll validation', () => {
    it('trims a valid poll before sending', () => {
        expect(normalizePoll({ question: '  Lunch? ', options: [' Pizza ', 'Dal'] })).toEqual({
            question: 'Lunch?', options: ['Pizza', 'Dal'],
        });
    });

    it('rejects missing, incomplete and oversized polls', () => {
        expect(normalizePoll({ question: '', options: ['A', 'B'] })).toBeNull();
        expect(normalizePoll({ question: 'Choose', options: ['A', ''] })).toBeNull();
        expect(normalizePoll({ question: 'Choose', options: ['A'] })).toBeNull();
        expect(normalizePoll({ question: 'Choose', options: ['A', 'B', 'C', 'D', 'E', 'F'] })).toBeNull();
        expect(normalizePoll({ question: 'Q'.repeat(301), options: ['A', 'B'] })).toBeNull();
    });
});
