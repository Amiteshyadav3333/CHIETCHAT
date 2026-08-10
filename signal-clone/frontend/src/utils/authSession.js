const PUBLIC_AUTH_PATHS = new Set([
    '/api/auth/me',
    '/api/auth/csrf',
    '/api/auth/logout',
    '/api/login',
    '/api/login/request-otp',
    '/api/login/verify-otp',
    '/api/register',
    '/api/register/verify-otp',
    '/api/forgot-password',
    '/api/reset-password',
    '/api/auth/2fa/login-verify',
    '/api/auth/google/exchange',
    '/api/auth/google/complete',
]);

const requestPath = (requestUrl) => {
    try {
        return new URL(String(requestUrl || ''), 'https://cheetchat.invalid').pathname;
    } catch {
        return '';
    }
};

export const shouldExpireSession = ({ status, requestUrl, hasSession }) => (
    Boolean(hasSession) && status === 401 && !PUBLIC_AUTH_PATHS.has(requestPath(requestUrl))
);

export const usableBearerToken = (value) => {
    const token = String(value || '').trim();
    return token && !['null', 'undefined', 'cookie-session'].includes(token) ? token : '';
};
