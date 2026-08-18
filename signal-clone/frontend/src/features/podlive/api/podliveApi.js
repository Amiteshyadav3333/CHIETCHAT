import axios from 'axios';
import { PODLIVE_API_URL, PODLIVE_STORAGE } from '../config';

const podliveApi = axios.create({ baseURL: PODLIVE_API_URL, withCredentials: false, timeout: 30000 });

podliveApi.interceptors.request.use((config) => {
    const token = localStorage.getItem(PODLIVE_STORAGE.token);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const unwrapApiError = (error, fallback = 'Something went wrong.') =>
    error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

export const podlive = {
    config: () => podliveApi.get('/api/config').then(({ data }) => data),
    active: () => podliveApi.get('/api/live/active').then(({ data }) => data),
    details: (id) => podliveApi.get(`/api/live/${id}/details`).then(({ data }) => data),
    viewerToken: (id) => podliveApi.get(`/api/live/${id}/token`).then(({ data }) => data),
    create: (values) => podliveApi.post('/api/live/create', values).then(({ data }) => data),
    start: (id) => podliveApi.post(`/api/live/${id}/start`).then(({ data }) => data),
    end: (id) => podliveApi.post(`/api/live/${id}/end`).then(({ data }) => data),
    view: (id) => podliveApi.post(`/api/live/${id}/view`).then(({ data }) => data),
    stats: () => podliveApi.get('/api/user/audience').then(({ data }) => data),
    profile: () => podliveApi.get('/api/user/profile').then(({ data }) => data),
    updateProfile: (values) => podliveApi.put('/api/user/profile', values).then(({ data }) => data),
};

export default podliveApi;
