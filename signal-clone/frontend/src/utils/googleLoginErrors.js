const EXISTING_PASSWORD_ACCOUNT_CODE = 'EXISTING_EMAIL_ACCOUNT';

export const isExistingPasswordAccountError = error =>
    error?.response?.data?.code === EXISTING_PASSWORD_ACCOUNT_CODE;

export const getGoogleLoginErrorMessage = error => {
    if (isExistingPasswordAccountError(error)) {
        return 'This email already has a Ducor password account. Sign in below with that email and password, use Login with OTP, or choose Forgot password.';
    }
    return error?.response?.data?.error || error?.message || 'Google sign-in failed';
};
