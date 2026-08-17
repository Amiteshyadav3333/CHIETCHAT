import { describe, expect, it } from 'vitest';
import { callMediaConstraints, optimizeCallSdp } from './mediaPolicy';

describe('call media policy', () => {
    it('keeps voice calls audio-only and video calls device-aware', () => {
        expect(callMediaConstraints('voice').video).toBe(false);
        expect(callMediaConstraints('video', 'environment').video.facingMode).toBe('environment');
    });

    it('adds resilient Opus parameters to SDP', () => {
        const source = 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 opus\r\n';
        const result = optimizeCallSdp(source);
        expect(result).toContain('useinbandfec=1');
        expect(result).toContain('maxaveragebitrate=64000');
    });
});
