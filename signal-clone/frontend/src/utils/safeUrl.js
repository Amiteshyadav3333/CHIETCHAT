const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const getSafeHttpUrl = (value, baseUrl = 'https://cheetchat.invalid') => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const base = new URL(baseUrl);
        const url = new URL(value.trim(), base);
        if (url.username || url.password) return null;
        if (url.protocol === 'https:') return url.href;
        const isLocalDevelopment = url.protocol === 'http:' && (
            LOOPBACK_HOSTS.has(url.hostname) || (base.protocol === 'http:' && url.origin === base.origin)
        );
        return isLocalDevelopment ? url.href : null;
    } catch {
        return null;
    }
};

export const getSafeWebsiteUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    return getSafeHttpUrl(candidate);
};

export const getSafeMediaUrl = (value, baseUrl = 'https://cheetchat.invalid') => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const candidate = value.trim();
    if (candidate.startsWith('blob:')) return candidate;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z\d+/=]+$/i.test(candidate)) return candidate;
    return getSafeHttpUrl(candidate, baseUrl);
};

export const openSafeExternal = (value, baseUrl = window.location.href) => {
    const safeUrl = getSafeHttpUrl(value, baseUrl);
    if (!safeUrl) return false;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return true;
};
