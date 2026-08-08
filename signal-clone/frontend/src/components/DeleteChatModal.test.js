import { describe, expect, it } from 'vitest';
import { canDeleteChatForEveryone } from './DeleteChatModal';

describe('delete chat authorization display', () => {
    it('allows one-to-one participants to request deletion for everyone', () => {
        expect(canDeleteChatForEveryone({ isGroup: false, currentUserId: 5 })).toBe(true);
    });

    it('allows only the matching group admin to request deletion for everyone', () => {
        expect(canDeleteChatForEveryone({ isGroup: true, groupAdminId: 5, currentUserId: 5 })).toBe(true);
        expect(canDeleteChatForEveryone({ isGroup: true, groupAdminId: 7, currentUserId: 5 })).toBe(false);
    });

    it('fails closed when no chat is selected', () => {
        expect(canDeleteChatForEveryone(null)).toBe(false);
    });
});
