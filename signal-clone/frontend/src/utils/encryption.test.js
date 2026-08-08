// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

import {
    decryptEnvelope, encryptForRecipients, generateKeys,
    protectPrivateKeyWithPassword, restorePrivateKeyWithPassword,
} from './encryption';

beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('message encryption', () => {
    it('decrypts only for recipients whose key was wrapped', async () => {
        const alice = await generateKeys();
        const bob = await generateKeys();
        const envelope = await encryptForRecipients({ alice: alice.publicKeyString }, 'launch secret');
        await expect(decryptEnvelope(alice.privateKey, 'alice', envelope)).resolves.toBe('launch secret');
        await expect(decryptEnvelope(bob.privateKey, 'bob', envelope)).resolves.toBe('🔒 Encrypted message');
    });

    it('round-trips password backup and rejects manipulated metadata', async () => {
        const keys = await generateKeys();
        const backup = await protectPrivateKeyWithPassword(keys.privateKeyString, 'strong-password');
        await expect(restorePrivateKeyWithPassword(backup, 'strong-password')).resolves.toBe(keys.privateKeyString);
        const manipulated = JSON.stringify({ ...JSON.parse(backup), iterations: 999999999 });
        await expect(restorePrivateKeyWithPassword(manipulated, 'strong-password')).rejects.toThrow('Invalid key backup');
        await expect(restorePrivateKeyWithPassword(backup, 'wrong-password')).rejects.toThrow();
    });
});
