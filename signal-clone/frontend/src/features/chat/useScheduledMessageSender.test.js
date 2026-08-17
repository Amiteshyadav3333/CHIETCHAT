import { describe, expect, it } from 'vitest';
import { buildRecipientKeyMap } from './useScheduledMessageSender';

describe('scheduled message recipient keys', () => {
    it('uses the local public key for the current user', () => {
        expect(buildRecipientKeyMap({
            participants: [{ id: 1, publicKey: 'stale' }, { id: 2, publicKey: 'remote' }],
            currentUserId: 1,
            currentPublicKey: 'local',
        })).toEqual({ 1: 'local', 2: 'remote' });
    });

    it('fails before sending when any participant key is unavailable', () => {
        expect(() => buildRecipientKeyMap({ participants: [{ id: 2 }], currentUserId: 1, currentPublicKey: 'local' }))
            .toThrow('A participant encryption key is unavailable');
    });
});
