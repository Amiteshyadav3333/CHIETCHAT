import { describe, expect, it } from 'vitest';
import { mediaFileName } from './mediaDownload';

describe('media downloads', () => {
    it('keeps a safe existing image filename', () => {
        expect(mediaFileName('https://media.example/chat/photo.png', 'image/png')).toBe('photo.png');
    });

    it('adds a usable extension to extensionless media URLs', () => {
        expect(mediaFileName('https://media.example/upload/abc123', 'video/mp4')).toBe('abc123.mp4');
        expect(mediaFileName('https://media.example/upload/reaction', 'image/jpeg')).toBe('reaction.jpg');
    });
});
