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
    videos: () => podliveApi.get('/api/live/videos').then(({ data }) => data),
    details: (id) => podliveApi.get(`/api/live/${id}/details`).then(({ data }) => data),
    viewerToken: (id) => podliveApi.get(`/api/live/${id}/token`).then(({ data }) => data),
    create: (values) => podliveApi.post('/api/live/create', values).then(({ data }) => data),
    start: (id) => podliveApi.post(`/api/live/${id}/start`).then(({ data }) => data),
    end: (id) => podliveApi.post(`/api/live/${id}/end`).then(({ data }) => data),
    participants: (id) => podliveApi.get(`/api/live/${id}/participants`).then(({ data }) => data),
    invite: (sessionId, handle) => podliveApi.post('/api/stage/invite', { sessionId, handle }).then(({ data }) => data),
    acceptInvite: (id) => podliveApi.post(`/api/stage/invite/${id}/accept`).then(({ data }) => data),
    rejectInvite: (id) => podliveApi.post(`/api/stage/invite/${id}/reject`).then(({ data }) => data),
    guests: (id) => podliveApi.get(`/api/stage/${id}/guests`).then(({ data }) => data),
    muteGuest: (sessionId, userId) => podliveApi.post(`/api/stage/guest/${sessionId}/${userId}/mute`).then(({ data }) => data),
    disableGuestCamera: (sessionId, userId) => podliveApi.post(`/api/stage/guest/${sessionId}/${userId}/disable-camera`).then(({ data }) => data),
    removeGuest: (sessionId, userId) => podliveApi.delete(`/api/stage/guest/${sessionId}/${userId}`).then(({ data }) => data),
    view: (id) => podliveApi.post(`/api/live/${id}/view`).then(({ data }) => data),
    like: (id) => podliveApi.post(`/api/live/${id}/like`, { type: 'like' }).then(({ data }) => data),
    comment: (id, message) => podliveApi.post(`/api/live/${id}/comment`, { message }).then(({ data }) => data),
    followStatus: (creatorId) => podliveApi.get(`/api/user/follow-status/${creatorId}`).then(({ data }) => data),
    follow: (creatorId) => podliveApi.post('/api/user/follow', { creatorId }).then(({ data }) => data),
    stats: () => podliveApi.get('/api/user/audience').then(({ data }) => data),
    uploadVideo: (form, onProgress) => podliveApi.post('/api/upload', form, { timeout: 0, onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded * 100) / event.total) : 0) }).then(({ data }) => data),
    profile: () => podliveApi.get('/api/user/profile').then(({ data }) => data),
    updateProfile: (values) => podliveApi.put('/api/user/profile', values).then(({ data }) => data),
};

export default podliveApi;
