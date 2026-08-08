const PRODUCTION_API_URL = 'https://chietchat-backend.onrender.com';
const LEGACY_API_HOSTS = new Set(['chietchat.onrender.com']);

export const resolveApiBaseUrl = (configuredUrl, isProduction = false) => {
    const candidate = String(configuredUrl || '').trim().replace(/\/$/, '');
    if (!candidate) return isProduction ? PRODUCTION_API_URL : '';

    try {
        const parsed = new URL(candidate);
        if (LEGACY_API_HOSTS.has(parsed.hostname)) return PRODUCTION_API_URL;
        if (isProduction && parsed.protocol !== 'https:') return PRODUCTION_API_URL;
        return parsed.origin;
    } catch {
        return isProduction ? PRODUCTION_API_URL : '';
    }
};

export const API_BASE_URL = resolveApiBaseUrl(
    import.meta.env.VITE_API_URL,
    import.meta.env.PROD,
);
