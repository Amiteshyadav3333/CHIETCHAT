import { describe, expect, it } from 'vitest';
import { buildMapUrl, normalizeCoordinates } from './locationPrivacy';

describe('location privacy helpers', () => {
    it('accepts valid geographic bounds and creates an explicit navigation URL', () => {
        expect(normalizeCoordinates('28.6139', 77.209)).toEqual({ lat: 28.6139, lng: 77.209 });
        expect(buildMapUrl(28.6139, 77.209)).toBe('https://www.google.com/maps?q=28.6139%2C77.209');
    });

    it('rejects non-numeric and out-of-range coordinates', () => {
        expect(() => normalizeCoordinates('x', 20)).toThrow('Invalid location coordinates');
        expect(() => normalizeCoordinates(91, 20)).toThrow('Invalid location coordinates');
        expect(() => normalizeCoordinates(20, -181)).toThrow('Invalid location coordinates');
    });
});
