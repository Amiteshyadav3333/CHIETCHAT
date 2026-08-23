import { describe, expect, it } from 'vitest';
import { createCharoState, drainDemonGap, takeCharoStep } from './CharoGame';

describe('CHARO game engine', () => {
    it('adds distance and collects an item in the selected lane', () => {
        const state = { ...createCharoState(() => 0), lane: 1, items: [{ at: 1, lane: 1, type: 'book', label: 'Book', points: 35, escape: 4 }] };
        const next = takeCharoStep(state, () => 0);
        expect(next.distance).toBe(1);
        expect(next.bonus).toBe(35);
        expect(next.collected.book).toBe(1);
    });

    it('lets the demon catch an inactive player', () => {
        const state = { ...createCharoState(), demonGap: 2 };
        const next = drainDemonGap(state, 3);
        expect(next.gameOver).toBe(true);
        expect(next.demonGap).toBe(0);
    });

    it('does not advance after game over', () => {
        const state = { ...createCharoState(), gameOver: true };
        expect(takeCharoStep(state)).toBe(state);
    });
});
