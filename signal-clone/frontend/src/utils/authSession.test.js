import { describe, expect, it } from 'vitest';
import { shouldExpireSession, usableBearerToken } from './authSession';

describe('401 session handling', () => {
    it('does not expire a session for bootstrap or login requests', () => {
        expect(shouldExpireSession({ status: 401, requestUrl: '/api/auth/me', hasSession: true })).toBe(false);
        expect(shouldExpireSession({ status: 401, requestUrl: '/api/login', hasSession: true })).toBe(false);
    });

    it('does not redirect anonymous users on ordinary 401 responses', () => {
        expect(shouldExpireSession({ status: 401, requestUrl: '/api/chats', hasSession: false })).toBe(false);
    });

    it('expires an authenticated session rejected by a protected endpoint', () => {
        expect(shouldExpireSession({ status: 401, requestUrl: '/api/chats', hasSession: true })).toBe(true);
    });

    it('accepts only real legacy bearer tokens', () => {
        expect(usableBearerToken('legacy.jwt.token')).toBe('legacy.jwt.token');
        expect(usableBearerToken('cookie-session')).toBe('');
        expect(usableBearerToken('undefined')).toBe('');
    });
});
