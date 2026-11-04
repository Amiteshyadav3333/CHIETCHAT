import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import IncomingChatBell from './IncomingChatBell';

describe('IncomingChatBell', () => {
    it('shows the caller configured message and keeps the silence control', () => {
        const html = renderToStaticMarkup(<IncomingChatBell
            bell={{ bellId: 'bell-1', callerName: 'Amit', message: 'Please call me now.' }}
            onSilence={vi.fn()}
        />);

        expect(html).toContain('Please call me now.');
        expect(html).toContain('Amit is calling your attention');
        expect(html).toContain('Silence bell');
    });
});
