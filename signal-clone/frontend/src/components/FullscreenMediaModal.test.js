import { describe, expect, it } from 'vitest';
import { getFullscreenMediaKind } from './FullscreenMediaModal';

describe('getFullscreenMediaKind', () => {
    it('respects the explicit audio type for webm voice messages', () => {
        expect(getFullscreenMediaKind('audio', 'https://cdn.example/voice.webm')).toBe('audio');
    });

    it('classifies audio extensions before ambiguous video extensions', () => {
        expect(getFullscreenMediaKind('', 'voice.ogg?download=1')).toBe('audio');
        expect(getFullscreenMediaKind('', 'voice.webm')).toBe('audio');
    });

    it('keeps explicit video media as video and defaults unknown media to image', () => {
        expect(getFullscreenMediaKind('video', 'clip.webm')).toBe('video');
        expect(getFullscreenMediaKind('', 'photo.jpg')).toBe('image');
    });
});
