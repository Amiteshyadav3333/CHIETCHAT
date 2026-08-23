import { describe, expect, it } from 'vitest';
import { advanceSnake, placeSnakeFood } from './SnakeGame';

describe('Snake arcade rules', () => {
    it('moves forward and grows after eating', () => {
        const snake = [{ x: 2, y: 2 }, { x: 1, y: 2 }];
        const moved = advanceSnake({ snake, direction: 'right', food: { x: 3, y: 2 } });
        expect(moved.ate).toBe(true);
        expect(moved.snake).toHaveLength(3);
        expect(moved.snake[0]).toEqual({ x: 3, y: 2 });
    });

    it('detects walls and self collisions', () => {
        expect(advanceSnake({ snake: [{ x: 0, y: 0 }], direction: 'left', food: { x: 5, y: 5 } }).crashed).toBe(true);
        const curled = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }];
        expect(advanceSnake({ snake: curled, direction: 'left', food: { x: 8, y: 8 } }).crashed).toBe(true);
    });

    it('never places food on the snake', () => {
        const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
        expect(placeSnakeFood(snake, () => 0)).toEqual({ x: 2, y: 0 });
    });
});
