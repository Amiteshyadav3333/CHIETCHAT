import { describe, expect, it } from 'vitest';
import { applyLiveLocationUpdate, normalizeLiveLocationDuration } from './useLiveLocationSharing';

describe('live location feature contract', () => {
    it('updates only the matching live-location message', () => {
        const messages = [
            { id: 1, type: 'live_location', senderId: 4, content: '{}' },
            { id: 2, type: 'text', senderId: 4, content: 'hello' },
        ];
        const result = applyLiveLocationUpdate(messages, { userId: 4, lat: 10, lng: 20 });
        expect(JSON.parse(result[0].content)).toEqual({ lat: 10, lng: 20 });
        expect(result[1]).toBe(messages[1]);
    });

    it('preserves expiry metadata during realtime coordinate updates', () => {
        const content = JSON.stringify({ lat: 1, lng: 2, expiresAt: '2026-01-01T00:00:00.000Z', durationMinutes: 15 });
        const [result] = applyLiveLocationUpdate([{ type: 'live_location', senderId: 4, content }], { userId: 4, lat: 3, lng: 4 });
        expect(JSON.parse(result.content)).toMatchObject({ lat: 3, lng: 4, durationMinutes: 15 });
    });

    it('allows only supported sharing durations', () => {
        expect(normalizeLiveLocationDuration(15)).toBe(15);
        expect(normalizeLiveLocationDuration('480')).toBe(480);
        expect(normalizeLiveLocationDuration(999)).toBe(30);
    });
});
