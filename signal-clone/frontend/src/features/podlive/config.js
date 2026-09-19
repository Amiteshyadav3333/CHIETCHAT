export const PODLIVE_ORIGIN_URL = String(import.meta.env.VITE_PODLIVE_API_URL || 'https://podlive-api-18as.onrender.com').replace(/\/+$/, '');

const resolvePodLiveApiUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
        const host = window.location.hostname || '';
        // If hosted on custom domain (chat.indiasearch.site) or vercel, proxy through /podlive-api for same-origin CORS bypass
        if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
            return `${window.location.origin}/podlive-api`;
        }
    }
    return PODLIVE_ORIGIN_URL;
};

export const PODLIVE_API_URL = resolvePodLiveApiUrl();
export const PODLIVE_SOCKET_URL = PODLIVE_ORIGIN_URL;
export const PODLIVE_STORAGE = Object.freeze({
    token: 'cheetchat_podlive_access_token',
    refreshToken: 'cheetchat_podlive_refresh_token',
    user: 'cheetchat_podlive_user',
});
export const PODLIVE_CATEGORIES = ['Technology', 'Music', 'Comedy', 'Education', 'Finance', 'Gaming', 'General'];
