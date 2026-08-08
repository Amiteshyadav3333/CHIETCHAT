import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './apiBaseUrl';

describe('production API URL resolution', () => {
    it('replaces the retired Render hostname', () => {
        expect(resolveApiBaseUrl('https://chietchat.onrender.com', true))
            .toBe('https://chietchat-backend.onrender.com');
    });

    it('uses the production backend when the build variable is missing or unsafe', () => {
        expect(resolveApiBaseUrl('', true)).toBe('https://chietchat-backend.onrender.com');
        expect(resolveApiBaseUrl('http://api.example.com', true))
            .toBe('https://chietchat-backend.onrender.com');
    });

    it('preserves an explicitly configured HTTPS backend', () => {
        expect(resolveApiBaseUrl('https://api.example.com/', true)).toBe('https://api.example.com');
    });
});
