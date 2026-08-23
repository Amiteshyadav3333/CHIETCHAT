import { describe, expect, it } from 'vitest';
import { applyChessMove, chessMoves, createChessBoard, createLudoState, moveLudoToken } from './BoardGames';

describe('Chess rules', () => {
    it('allows opening pawn and knight moves but blocks sliding pieces', () => {
        const board = createChessBoard();
        expect(chessMoves(board, 52)).toEqual([44, 36]);
        expect(chessMoves(board, 57).sort((a, b) => a - b)).toEqual([40, 42]);
        expect(chessMoves(board, 56)).toEqual([]);
    });

    it('moves, captures, and promotes pieces', () => {
        const opened = applyChessMove(createChessBoard(), 52, 36);
        expect(opened[52]).toBeNull();
        expect(opened[36]).toBe('P');
        const promotion = Array(64).fill(null);
        promotion[8] = 'P';
        expect(applyChessMove(promotion, 8, 0)[0]).toBe('Q');
    });
});

describe('Ludo rules', () => {
    it('requires a six to enter the board', () => {
        expect(moveLudoToken({ ...createLudoState(), dice: 5 }, 0)).toBeNull();
        const entered = moveLudoToken({ ...createLudoState(), dice: 6 }, 0);
        expect(entered.tokens[0][0]).toBe(0);
        expect(entered.turn).toBe(0);
    });

    it('captures a rival on a non-safe square', () => {
        const state = { ...createLudoState(), tokens: [[4, -1, -1, -1], [31, -1, -1, -1]], dice: 1 };
        const moved = moveLudoToken(state, 0);
        expect(moved.tokens[0][0]).toBe(5);
        expect(moved.tokens[1][0]).toBe(-1);
    });
});
