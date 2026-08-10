import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DrawingMessage } from './ChatBubble';

describe('DrawingMessage', () => {
    it('renders native vector drawing actions instead of an image attachment', () => {
        const content = JSON.stringify({
            version: 1,
            actions: [
                { tool: 'pen', color: '#22c55e', size: 5, points: [{ x: 10, y: 20 }, { x: 80, y: 90 }] },
                { tool: 'text', color: '#ffffff', size: 5, text: 'Look here', x: 500, y: 500 },
            ],
        });
        const html = renderToStaticMarkup(<DrawingMessage content={content} />);
        expect(html).toContain('<svg');
        expect(html).toContain('<polyline');
        expect(html).toContain('Look here');
        expect(html).not.toContain('<img');
    });

    it('handles malformed drawing payloads safely', () => {
        expect(renderToStaticMarkup(<DrawingMessage content="not-json" />)).toContain('Drawing unavailable');
    });

    it('renders the referenced chat message together with vector marks', () => {
        const content = JSON.stringify({
            version: 2,
            background: { type: 'chat', senderName: 'Amit', text: 'Yahan dekho', timestamp: '2026-08-10T10:00:00Z' },
            actions: [{ tool: 'arrow', color: '#facc15', size: 5, points: [{ x: 100, y: 100 }, { x: 700, y: 500 }] }],
        });
        const html = renderToStaticMarkup(<DrawingMessage content={content} />);
        expect(html).toContain('Amit');
        expect(html).toContain('Yahan dekho');
        expect(html).toContain('<polyline');
    });
});
