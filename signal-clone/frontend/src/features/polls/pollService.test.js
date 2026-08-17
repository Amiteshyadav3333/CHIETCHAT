import { describe, expect, it } from 'vitest';
import { applyPollVoteUpdate } from './pollService';

describe('poll feature contract', () => {
    it('accepts both legacy id and canonical messageId socket payloads', () => {
        const messages = [{ id: 7, votes: [] }, { id: 8, votes: [] }];
        const votes = [{ userId: 2, optionIdx: 1 }];
        expect(applyPollVoteUpdate(messages, { messageId: 7, votes })[0].votes).toEqual(votes);
        expect(applyPollVoteUpdate(messages, { id: 8, votes })[1].votes).toEqual(votes);
    });
});
