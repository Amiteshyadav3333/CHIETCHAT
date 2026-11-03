import { describe, expect, it } from 'vitest';
import { getGoogleLoginErrorMessage, isExistingPasswordAccountError } from './googleLoginErrors';

describe('Google login account conflict recovery', () => {
    it('recognizes an existing password account and gives the usable login options', () => {
        const error = { response: { data: { code: 'EXISTING_EMAIL_ACCOUNT' } } };

        expect(isExistingPasswordAccountError(error)).toBe(true);
        expect(getGoogleLoginErrorMessage(error)).toContain('Sign in below with that email and password');
        expect(getGoogleLoginErrorMessage(error)).toContain('Login with OTP');
        expect(getGoogleLoginErrorMessage(error)).toContain('Forgot password');
    });

    it('keeps other Google sign-in errors intact', () => {
        const error = { response: { data: { error: 'Google sign-in could not be verified' } } };

        expect(isExistingPasswordAccountError(error)).toBe(false);
        expect(getGoogleLoginErrorMessage(error)).toBe('Google sign-in could not be verified');
    });
});
