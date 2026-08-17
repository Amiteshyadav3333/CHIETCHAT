import { describe, expect, it } from 'vitest';
import { oppositeCameraFacing, videoNoteConstraints } from './videoNote';

describe('video note policy', () => {
    it('switches between front and rear cameras', () => {
        expect(oppositeCameraFacing('user')).toBe('environment');
        expect(oppositeCameraFacing('environment')).toBe('user');
    });

    it('keeps audio processing and bounded frame rate', () => {
        const constraints = videoNoteConstraints('user');
        expect(constraints.audio.noiseSuppression).toBe(true);
        expect(constraints.video.frameRate.max).toBe(30);
    });
});
