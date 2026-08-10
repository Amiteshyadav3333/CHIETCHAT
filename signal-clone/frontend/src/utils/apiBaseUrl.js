const PRODUCTION_API_URL = 'https://chietchat-backend.onrender.com';
const LEGACY_API_HOSTS = new Set(['chietchat.onrender.com']);

export const resolveApiBaseUrl = (configuredUrl, isProduction = false) => {
    // Production HTTP API calls go through the frontend's same-origin Vercel
    // rewrite. This keeps the HttpOnly session cookie first-party instead of
    // relying on third-party cookie support for the Render hostname.
    if (isProduction) return '';
    const candidate = String(configuredUrl || '').trim().replace(/\/$/, '');
    if (!candidate) return '';

    try {
        const parsed = new URL(candidate);
        if (LEGACY_API_HOSTS.has(parsed.hostname)) return PRODUCTION_API_URL;
        return parsed.origin;
    } catch {
        return '';
    }
};

export const API_BASE_URL = resolveApiBaseUrl(
    import.meta.env.VITE_API_URL,
    import.meta.env.PROD,
);

// Vercel does not proxy WebSocket upgrades. Realtime connects directly and
// authenticates with a short-lived ticket fetched through the same-origin API.
export const SOCKET_BASE_URL = PRODUCTION_API_URL;
