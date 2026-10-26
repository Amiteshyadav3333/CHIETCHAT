// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserRouter, Route, Routes, useNavigate, useParams, usePathname } from './clientRouter';

let container;
let root;

const CurrentRoute = () => {
    const pathname = usePathname();
    const params = useParams();
    return <output>{`${pathname}|${params.reelId || params.postId || params.chatId || ''}`}</output>;
};

const SectionLinks = () => {
    const navigate = useNavigate();
    return <><button onClick={() => navigate('/reels')}>Reels</button><button onClick={() => navigate('/podlive')}>PodLive</button></>;
};

beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.scrollTo = () => {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('client router direct URLs', () => {
    it.each([
        ['/reels/42', '/reels/:reelId', '/reels/42|42'],
        ['/posts/post-9', '/posts/:postId', '/posts/post-9|post-9'],
        ['/chats/chat-3', '/chats/:chatId', '/chats/chat-3|chat-3'],
    ])('restores %s from the browser URL', (url, route, expected) => {
        window.history.replaceState({}, '', url);
        act(() => root.render(
            <BrowserRouter>
                <Routes><Route path={route} element={<CurrentRoute />} /></Routes>
            </BrowserRouter>
        ));
        expect(container.textContent).toBe(expected);
    });

    it.each([['Reels', '/reels'], ['PodLive', '/podlive']])('updates the browser URL when %s is selected', (label, path) => {
        act(() => root.render(
            <BrowserRouter>
                <SectionLinks />
                <Routes>
                    <Route path="/" element={<CurrentRoute />} />
                    <Route path="/reels" element={<CurrentRoute />} />
                    <Route path="/podlive" element={<CurrentRoute />} />
                </Routes>
            </BrowserRouter>
        ));
        act(() => [...container.querySelectorAll('button')].find(button => button.textContent === label).click());
        expect(window.location.pathname).toBe(path);
        expect(container.querySelector('output').textContent).toBe(`${path}|`);
    });
});
