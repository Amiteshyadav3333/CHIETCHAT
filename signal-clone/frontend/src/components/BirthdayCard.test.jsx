import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BirthdayCard from './BirthdayCard';

describe('BirthdayCard privacy', () => {
    it('renders celebration effects without third-party network assets', () => {
        const markup = renderToStaticMarkup(
            <BirthdayCard data={{
                interactive: false,
                playMusic: true,
                message: 'Happy Birthday!',
                effect: { id: 'confetti' },
            }} />,
        );

        expect(markup).toContain('Happy Birthday!');
        expect(markup).toContain('Local celebration sound');
        expect(markup).not.toMatch(/https?:\/\//i);
        expect(markup).not.toContain('url(');
    });
});
