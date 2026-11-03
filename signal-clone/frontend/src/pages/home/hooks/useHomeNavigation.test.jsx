// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserRouter, useLocation } from '../../../utils/clientRouter';
import { useHomeNavigation } from './useHomeNavigation';

let container;
let root;

const NavigationProbe = () => {
    const navigation = useHomeNavigation();
    const { pathname, search } = useLocation();
    return <>
        <output data-testid="pathname">{pathname}</output>
        <output data-testid="location">{`${pathname}${search}`}</output>
        <output data-testid="mobile-tab">{navigation.mobileHomeTab}</output>
        <output data-testid="show-social">{String(navigation.showSocial)}</output>
        <output data-testid="social-deep-link">{navigation.socialDeepLink ? `${navigation.socialDeepLink.type}:${navigation.socialDeepLink.id}` : ""}</output>
        <button onClick={() => navigation.navigateToProfile('profile-42')}>view-profile</button>
        {['chats', 'stories', 'groups', 'calls'].map(tab => (
            <button key={`tab-${tab}`} onClick={() => navigation.setMobileHomeTab(tab)}>tab-{tab}</button>
        ))}
        {['chats', 'social', 'reels', 'podlive', 'settings', 'ai-chat', 'smart-space', 'saskat-ai'].map(view => (
            <button key={view} onClick={() => navigation.navigateToView(view)}>{view}</button>
        ))}
    </>;
};

beforeEach(() => {
    window.history.replaceState({}, '', '/');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    window.scrollTo = () => {};
    const storage = new Map();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key),
        clear: () => storage.clear(),
    } });
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    root = null;
});

describe('main section navigation', () => {
    it.each([
        ['chats', '/chats'], ['social', '/social'], ['reels', '/reels'],
        ['podlive', '/podlive'], ['settings', '/settings'],
        ['ai-chat', '/ai-chat'], ['smart-space', '/smart-space'], ['saskat-ai', '/saskat-ai'],
    ])('navigates to %s immediately on selection', (view, path) => {
        act(() => root.render(<BrowserRouter><NavigationProbe /></BrowserRouter>));
        act(() => [...container.querySelectorAll('button')].find(button => button.textContent === view).click());
        expect(window.location.pathname).toBe(path);
        expect(container.querySelector('output').textContent).toBe(path);
    });
});


describe('mobile chat tabs', () => {
    it.each(['stories', 'groups', 'calls'])('writes the %s tab to a shareable URL immediately', tab => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        window.history.replaceState({}, '', '/chats');
        act(() => root.render(<BrowserRouter><NavigationProbe /></BrowserRouter>));
        act(() => [...container.querySelectorAll('button')].find(button => button.textContent === `tab-${tab}`).click());
        expect(window.location.pathname).toBe('/chats');
        expect(window.location.search).toBe(`?tab=${tab}`);
        expect(container.querySelector('[data-testid="location"]').textContent).toBe(`/chats?tab=${tab}`);
    });

    it('restores the selected tab after browser back or forward navigation', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        window.history.replaceState({}, '', '/chats');
        act(() => root.render(<BrowserRouter><NavigationProbe /></BrowserRouter>));
        act(() => {
            window.history.replaceState({}, '', '/chats?tab=groups');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(container.querySelector('[data-testid="location"]').textContent).toBe('/chats?tab=groups');
        expect(container.querySelector('[data-testid="mobile-tab"]').textContent).toBe('groups');
    });
});


describe('profile navigation', () => {
    it('opens the selected profile directly and preserves its deep link', () => {
        act(() => root.render(<BrowserRouter><NavigationProbe /></BrowserRouter>));
        act(() => [...container.querySelectorAll('button')].find(button => button.textContent === 'view-profile').click());
        expect(window.location.pathname).toBe('/profile/profile-42');
        expect(container.querySelector('[data-testid="social-deep-link"]').textContent).toBe('profile:profile-42');
    });
});

describe('direct chat URLs', () => {
    it.each(['/chats/42', '/chats/abc-123/'])('keeps %s in the chat section', path => {
        window.history.replaceState({}, '', path);
        act(() => root.render(<BrowserRouter><NavigationProbe /></BrowserRouter>));
        expect(container.querySelector('[data-testid="show-social"]').textContent).toBe('false');
        expect(container.querySelector('[data-testid="pathname"]').textContent).toBe(path);
    });
});
