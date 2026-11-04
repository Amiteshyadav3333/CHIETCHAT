import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LiveDrawingPreview } from './ChatWindowView';

describe('NoteIt Live drawing preview', () => {
    it('keeps the compact default and offers resize and full-screen controls', () => {
        const html = renderToStaticMarkup(<LiveDrawingPreview preview={{
            userId: 2,
            username: 'Sam',
            drawing: { actions: [{ tool: 'text', color: '#ffffff', size: 5, text: 'Hello', x: 500, y: 500 }] },
        }} />);

        expect(html).toContain('width:260px;height:190px');
        expect(html).toContain('resize:both');
        expect(html).toContain('Full screen');
        expect(html).toContain('Drag the lower corner to resize');
        expect(html).toContain('Hello');
    });
});
