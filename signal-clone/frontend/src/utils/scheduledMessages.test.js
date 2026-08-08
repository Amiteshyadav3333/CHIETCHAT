import { describe, expect, it } from 'vitest';
import { normalizeScheduleRequest } from './scheduledMessages';

describe('scheduled message validation', () => {
    const now = Date.parse('2026-08-02T10:00:00.000Z');

    it('normalizes a future message', () => {
        expect(normalizeScheduleRequest('  hello ', '2026-08-02T10:05:00.000Z', now)).toEqual({
            content: 'hello', sendAt: '2026-08-02T10:05:00.000Z',
        });
    });

    it('rejects blank, past, immediate and over-one-year requests', () => {
        expect(normalizeScheduleRequest('', '2026-08-02T10:05:00.000Z', now)).toBeNull();
        expect(normalizeScheduleRequest('x', '2026-08-02T09:00:00.000Z', now)).toBeNull();
        expect(normalizeScheduleRequest('x', '2026-08-02T10:00:30.000Z', now)).toBeNull();
        expect(normalizeScheduleRequest('x', '2028-08-02T10:00:00.000Z', now)).toBeNull();
    });
});
