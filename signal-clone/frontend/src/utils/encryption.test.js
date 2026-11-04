// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

import {
    assertPinnedPublicKey, decryptEnvelope, encryptForRecipients, generateKeys, trustPinnedPublicKey,
    protectPrivateKeyWithPassword, restorePrivateKeyWithPassword,
} from './encryption';

beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        clear: () => values.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
});

describe('message encryption', () => {
    it('decrypts only for recipients whose key was wrapped', async () => {
        const alice = await generateKeys();
        const bob = await generateKeys();
        const eve = await generateKeys();
        const envelope = await encryptForRecipients({
            alice: alice.publicKeyString,
            bob: bob.publicKeyString,
        }, 'launch secret');
        await expect(decryptEnvelope(alice.privateKey, 'alice', envelope)).resolves.toBe('launch secret');
        await expect(decryptEnvelope(bob.privateKey, 'bob', envelope)).resolves.toBe('launch secret');
        await expect(decryptEnvelope(eve.privateKey, 'eve', envelope)).resolves.toBe('🔒 Encrypted message');
    });

    it('round-trips password backup and rejects manipulated metadata', async () => {
        const keys = await generateKeys();
        const backup = await protectPrivateKeyWithPassword(keys.privateKeyString, 'strong-password');
        await expect(restorePrivateKeyWithPassword(backup, 'strong-password')).resolves.toBe(keys.privateKeyString);
        const manipulated = JSON.stringify({ ...JSON.parse(backup), iterations: 999999999 });
        await expect(restorePrivateKeyWithPassword(manipulated, 'strong-password')).rejects.toThrow('Invalid key backup');
        await expect(restorePrivateKeyWithPassword(backup, 'wrong-password')).rejects.toThrow();
    });

    it('blocks changed contact keys until the user explicitly verifies and trusts them', async () => {
        const firstKey = await generateKeys();
        const replacementKey = await generateKeys();
        const contactId = `pin-test-${Date.now()}`;
        await expect(assertPinnedPublicKey(contactId, firstKey.publicKeyString)).resolves.toBeTruthy();
        await expect(assertPinnedPublicKey(contactId, replacementKey.publicKeyString))
            .rejects.toMatchObject({ code: 'CONTACT_KEY_CHANGED', retryable: false });

        await trustPinnedPublicKey(contactId, replacementKey.publicKeyString);
        await expect(assertPinnedPublicKey(contactId, replacementKey.publicKeyString)).resolves.toBeTruthy();
    });
});
