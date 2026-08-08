import { describe, expect, it } from 'vitest';
import { searchEmojis } from './SidebarEmojiPicker';

describe('sidebar emoji search', () => {
    it('returns the selected category when search is empty', () => {
        const food = searchEmojis('', 'food');
        expect(food).toContain('🍕');
        expect(food).not.toContain('😀');
    });

    it('supports category names and exact emoji searches', () => {
        expect(searchEmojis('travel')).toContain('✈️');
        expect(searchEmojis('😀')).toEqual(['😀']);
        expect(searchEmojis('does-not-exist')).toEqual([]);
    });
});
