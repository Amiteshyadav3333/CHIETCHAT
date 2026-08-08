import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UserAvatar, { getInitials } from './UserAvatar';

describe('UserAvatar', () => {
    it('creates stable local initials without a tracking request', () => {
        expect(getInitials('Amitesh Kumar')).toBe('AK');
        expect(getInitials('')).toBe('?');
        const markup = renderToStaticMarkup(<UserAvatar name="Amitesh Kumar" className="h-10 w-10 rounded-full" />);
        expect(markup).toContain('AK');
        expect(markup).not.toContain('<img');
        expect(markup).not.toMatch(/https?:\/\//i);
    });

    it('protects intentional image requests from referrer leakage', () => {
        const markup = renderToStaticMarkup(<UserAvatar name="Amitesh" src="https://cdn.example/avatar.jpg" />);
        expect(markup).toContain('referrerPolicy="no-referrer"');
    });

    it('rejects executable and credential-bearing avatar URLs', () => {
        const executable = renderToStaticMarkup(<UserAvatar name="Amitesh" src="javascript:alert(1)" />);
        const credentialed = renderToStaticMarkup(<UserAvatar name="Amitesh" src="https://user:pass@cdn.example/avatar.jpg" />);
        expect(executable).not.toContain('<img');
        expect(credentialed).not.toContain('<img');
        expect(executable).not.toContain('javascript:');
    });
});
