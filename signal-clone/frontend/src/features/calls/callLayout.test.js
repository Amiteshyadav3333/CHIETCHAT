import { describe, expect, it } from 'vitest';
import { callGridColumns, shouldUseEqualCallGrid } from './callLayout';

describe('call layout policy', () => {
    it('uses an equal grid for non-minimized multiparty calls', () => {
        expect(shouldUseEqualCallGrid({ participantCount: 3, minimized: false })).toBe(true);
        expect(shouldUseEqualCallGrid({ participantCount: 2, minimized: false })).toBe(false);
        expect(shouldUseEqualCallGrid({ participantCount: 3, minimized: true })).toBe(false);
    });

    it('scales columns for larger calls', () => {
        expect(callGridColumns(4)).toBe('grid-cols-2');
        expect(callGridColumns(5)).toContain('md:grid-cols-3');
    });
});
