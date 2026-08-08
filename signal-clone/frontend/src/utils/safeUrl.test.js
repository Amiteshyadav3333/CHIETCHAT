import { describe, expect, it } from 'vitest';
import { getSafeHttpUrl, getSafeMediaUrl, getSafeWebsiteUrl } from './safeUrl';

describe('safe URL validation', () => {
    it('accepts HTTPS and same-origin relative paths', () => {
        expect(getSafeHttpUrl('https://cdn.example/file.pdf')).toBe('https://cdn.example/file.pdf');
        expect(getSafeHttpUrl('/uploads/file.pdf', 'https://chat.example/app')).toBe('https://chat.example/uploads/file.pdf');
    });

    it('blocks executable, credentialed and insecure public URLs', () => {
        expect(getSafeHttpUrl('javascript:alert(1)')).toBeNull();
        expect(getSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
        expect(getSafeHttpUrl('https://user:secret@example.com/file')).toBeNull();
        expect(getSafeHttpUrl('http://example.com/file')).toBeNull();
    });

    it('allows HTTP only for local development', () => {
        expect(getSafeHttpUrl('http://127.0.0.1:5001/uploads/a.pdf')).toBe('http://127.0.0.1:5001/uploads/a.pdf');
    });

    it('normalizes profile websites without treating them as app-relative paths', () => {
        expect(getSafeWebsiteUrl('example.com/profile')).toBe('https://example.com/profile');
        expect(getSafeWebsiteUrl('javascript:alert(1)')).toBeNull();
    });

    it('allows safe media sources and rejects active data payloads', () => {
        expect(getSafeMediaUrl('blob:https://chat.example/id')).toBe('blob:https://chat.example/id');
        expect(getSafeMediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
        expect(getSafeMediaUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
    });
});
