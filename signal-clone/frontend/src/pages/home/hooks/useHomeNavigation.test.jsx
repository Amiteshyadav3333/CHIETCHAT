// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserRouter, usePathname } from '../../../utils/clientRouter';
import { useHomeNavigation } from './useHomeNavigation';

let container;
let root;

const NavigationProbe = () => {
    const navigation = useHomeNavigation();
    const pathname = usePathname();
    return <>
        <output>{pathname}</output>
        {['chats', 'social', 'reels', 'podlive', 'settings', 'ai-chat', 'smart-space', 'saskat-ai'].map(view => (
            <button key={view} onClick={() => navigation.navigateToView(view)}>{view}</button>
        ))}
    </>;
};

beforeEach(() => {
    window.history.replaceState({}, '', '/');
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
