import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvatarPlaceholder, ControlBtn } from './CallMediaPrimitives';

describe('call media primitives', () => {
    it('uses safe avatar rendering for remote participant data', () => {
        const markup = renderToStaticMarkup(
            <AvatarPlaceholder avatar="javascript:alert(1)" name="Remote user" />,
        );
        expect(markup).toContain('Remote user');
        expect(markup).not.toContain('javascript:');
    });

    it('exposes control state to assistive technology', () => {
        const markup = renderToStaticMarkup(
            <ControlBtn label="Mute microphone" active><span>mute</span></ControlBtn>,
        );
        expect(markup).toContain('aria-label="Mute microphone"');
        expect(markup).toContain('aria-pressed="true"');
        expect(markup).toContain('type="button"');
    });
});
