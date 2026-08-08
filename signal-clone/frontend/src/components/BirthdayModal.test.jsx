import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BirthdayModal from './BirthdayModal';

describe('BirthdayModal privacy', () => {
    it('previews a card without loading remote fonts or artwork', () => {
        const markup = renderToStaticMarkup(<BirthdayModal onClose={vi.fn()} onSend={vi.fn()} />);

        expect(markup).toContain('Premium Card Studio');
        expect(markup).not.toMatch(/(?:src|href)=["']https?:\/\//i);
        expect(markup).not.toContain('url(');
    });
});
