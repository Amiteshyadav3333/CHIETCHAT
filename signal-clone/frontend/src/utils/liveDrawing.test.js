import { describe, expect, it } from 'vitest';
import { compactLiveDrawing } from './liveDrawing';

describe('live drawing snapshots', () => {
    it('keeps the snapshot valid and bounds large strokes for encrypted live delivery', () => {
        const drawing = compactLiveDrawing({
            version: 2,
            background: { type: 'chat', text: 'Message preview' },
            actions: Array.from({ length: 20 }, (_, actionIndex) => ({
                tool: 'pen', color: '#22c55e', size: 5,
                points: Array.from({ length: 400 }, (_, index) => ({ x: index + actionIndex, y: index })),
            })),
        });

        expect(JSON.stringify(drawing).length).toBeLessThanOrEqual(5200);
        expect(drawing.actions.length).toBeLessThanOrEqual(12);
        expect(drawing.actions.at(-1).points.length).toBeLessThanOrEqual(24);
        expect(drawing.actions.at(-1).points.at(-1)).toEqual({ x: 418, y: 399 });
    });

    it('drops oversized background payloads without discarding strokes', () => {
        const drawing = compactLiveDrawing({
            background: { type: 'image', src: 'x'.repeat(2000) },
            actions: [{ tool: 'text', text: 'Live text' }],
        });

        expect(drawing.background).toBeNull();
        expect(drawing.actions[0].text).toBe('Live text');
    });
});
