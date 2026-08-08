import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessageBubble, renderMarkdown } from './AiChatPresentation';

describe('AI chat presentation safety', () => {
    it('renders markdown tokens as escaped React content', () => {
        const markup = renderToStaticMarkup(<div>{renderMarkdown('**bold** `<tag>`')}</div>);
        expect(markup).toContain('<strong>bold</strong>');
        expect(markup).toContain('&lt;tag&gt;');
        expect(markup).not.toContain('<tag>');
        expect(() => renderMarkdown(null)).not.toThrow();
    });

    it('rejects unsafe generated-image URLs and malformed timestamps', () => {
        const markup = renderToStaticMarkup(<MessageBubble msg={{
            role: 'assistant', content: 'Safe response',
            imageUrl: 'javascript:alert(1)', timestamp: 'not-a-date',
        }} botInfo={{ name: 'Aria' }} />);
        expect(markup).toContain('Safe response');
        expect(markup).not.toContain('<img');
        expect(markup).not.toContain('javascript:');
    });
});
