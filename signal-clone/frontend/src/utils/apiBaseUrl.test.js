import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './apiBaseUrl';

describe('production API URL resolution', () => {
    it('uses the same origin proxy even when a Render hostname is configured', () => {
        expect(resolveApiBaseUrl('https://chietchat.onrender.com', true))
            .toBe('');
    });

    it('uses the same origin proxy when the build variable is missing or unsafe', () => {
        expect(resolveApiBaseUrl('', true)).toBe('');
        expect(resolveApiBaseUrl('http://api.example.com', true))
            .toBe('');
    });

    it('keeps development API overrides available', () => {
        expect(resolveApiBaseUrl('https://api.example.com/', false)).toBe('https://api.example.com');
    });
});
