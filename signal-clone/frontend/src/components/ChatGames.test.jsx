import { describe, expect, it } from 'vitest';
import { getGameWinner, isValidGameBoard } from './ChatGames';

describe('chat game state validation', () => {
    it('rejects malformed remote boards before they reach the UI', () => {
        expect(isValidGameBoard(null)).toBe(false);
        expect(isValidGameBoard(['X'])).toBe(false);
        expect(isValidGameBoard(['X', 'O', 'BAD', null, null, null, null, null, null])).toBe(false);
        expect(getGameWinner({ board: [] })).toBeNull();
    });

    it('detects wins and draws only on valid boards', () => {
        expect(getGameWinner(['X', 'X', 'X', null, 'O', null, 'O', null, null])).toEqual({
            winner: 'X', line: [0, 1, 2],
        });
        expect(getGameWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toEqual({
            winner: 'Draw', line: null,
        });
    });
});
