import { describe, expect, it } from 'vitest';
import { hashDevicePin } from './deviceLock';

describe('device privacy PIN helper', () => {
    it('hashes PINs to a stable SHA-256 digest without storing the PIN itself', async () => {
        const first = await hashDevicePin('0426');
        const second = await hashDevicePin('0426');
        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });
});
