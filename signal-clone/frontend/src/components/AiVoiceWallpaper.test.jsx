import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AiVoiceWallpaper, { AI_WALLPAPER_THEMES } from './AiVoiceWallpaper';

describe('AiVoiceWallpaper', () => {
    it('provides all 4 distinct interactive AI wallpaper themes', () => {
        expect(AI_WALLPAPER_THEMES.length).toBe(4);
        const themeIds = AI_WALLPAPER_THEMES.map(t => t.id);
        expect(themeIds).toContain('quantum_sphere');
        expect(themeIds).toContain('cosmic_nebula');
        expect(themeIds).toContain('cyber_aurora');
        expect(themeIds).toContain('sunset_glow');
    });

    it('renders a canvas without crashing for all themes', () => {
        AI_WALLPAPER_THEMES.forEach(t => {
            const markup = renderToStaticMarkup(
                <AiVoiceWallpaper
                    theme={t.id}
                    aiSpeaking={false}
                    userSpeaking={false}
                    loading={false}
                    callState="connected"
                />
            );
            expect(markup).toContain('<canvas');
        });
    });

    it('renders during active speaking and loading states', () => {
        const speakingMarkup = renderToStaticMarkup(
            <AiVoiceWallpaper
                theme="quantum_sphere"
                aiSpeaking={true}
                userSpeaking={false}
                loading={false}
                callState="connected"
            />
        );
        expect(speakingMarkup).toContain('<canvas');

        const listeningMarkup = renderToStaticMarkup(
            <AiVoiceWallpaper
                theme="cyber_aurora"
                aiSpeaking={false}
                userSpeaking={true}
                loading={false}
                callState="connected"
            />
        );
        expect(listeningMarkup).toContain('<canvas');
    });
});
