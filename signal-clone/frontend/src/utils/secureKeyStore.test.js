// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

import { deleteDevicePrivateKey, loadDevicePrivateKey, saveDevicePrivateKey } from './secureKeyStore';

beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const values = new Map();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: key => values.has(key) ? values.get(key) : null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key),
        },
    });
});

describe('device private-key vault', () => {
    it('stores the key outside plaintext localStorage', async () => {
        await saveDevicePrivateKey(101, 'private-key-material');
        expect(window.localStorage.getItem('privKey_101')).toBeNull();
        await expect(loadDevicePrivateKey(101)).resolves.toBe('private-key-material');
        await deleteDevicePrivateKey(101);
        await expect(loadDevicePrivateKey(101)).resolves.toBeNull();
    });

    it('migrates a legacy plaintext key and removes the old value', async () => {
        window.localStorage.setItem('privKey_202', 'legacy-private-key');
        await expect(loadDevicePrivateKey(202)).resolves.toBe('legacy-private-key');
        expect(window.localStorage.getItem('privKey_202')).toBeNull();
        await expect(loadDevicePrivateKey(202)).resolves.toBe('legacy-private-key');
    });
});
