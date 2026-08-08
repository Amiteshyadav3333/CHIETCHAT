import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import ReelCard from './ReelCard';

describe('ReelCard defensive rendering', () => {
    it('renders legacy reels without an embedded user instead of crashing', () => {
        const markup = renderToStaticMarkup(
            <AuthContext.Provider value={{ token: null }}>
                <ReelCard
                    reel={{ id: 1, caption: 'Cached reel', videoUrl: '', likesCount: 0 }}
                    currentUser={undefined}
                    onProfileClick={() => {}}
                    onReact={() => {}}
                    onDelete={() => {}}
                    active={false}
                />
            </AuthContext.Provider>,
        );
        expect(markup).toContain('@unknown');
        expect(markup).toContain('Cached reel');
    });
});
