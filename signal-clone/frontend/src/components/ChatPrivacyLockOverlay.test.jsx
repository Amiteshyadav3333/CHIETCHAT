import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatPrivacyLockOverlay } from './HomeOverlays';

describe('ChatPrivacyLockOverlay', () => {
    it('explains that only chats are locked and offers an exit back to Social', () => {
        const html = renderToStaticMarkup(<ChatPrivacyLockOverlay
            request={{ type: 'area' }}
            pin=""
            error=""
            onPinChange={vi.fn()}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
        />);

        expect(html).toContain('Chat area locked');
        expect(html).toContain('Back to Social');
        expect(html).toContain('Enter this browser’s privacy PIN');
    });
});
