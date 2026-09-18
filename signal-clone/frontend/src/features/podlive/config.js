export const PODLIVE_API_URL = String(import.meta.env.VITE_PODLIVE_API_URL || 'https://podlive-api-18as.onrender.com').replace(/\/+$/, '');
export const PODLIVE_STORAGE = Object.freeze({
    token: 'cheetchat_podlive_access_token',
    refreshToken: 'cheetchat_podlive_refresh_token',
    user: 'cheetchat_podlive_user',
});
export const PODLIVE_CATEGORIES = ['Technology', 'Music', 'Comedy', 'Education', 'Finance', 'Gaming', 'General'];
