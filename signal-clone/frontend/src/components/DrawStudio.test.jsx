import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DrawStudio from './DrawStudio';

describe('DrawStudio tools', () => {
    it('offers writing tools without photo or video uploads', () => {
        const markup = renderToStaticMarkup(<DrawStudio onClose={vi.fn()} onSendDrawing={vi.fn()} />);
        expect(markup).toContain('Draw on chat');
        expect(markup).toContain('Text');
        expect(markup).toContain('pen');
        expect(markup).not.toContain('type="file"');
        expect(markup).not.toContain('>Photo<');
    });
});
