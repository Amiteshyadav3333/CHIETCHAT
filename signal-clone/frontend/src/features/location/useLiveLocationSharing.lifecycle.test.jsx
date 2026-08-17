// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiveLocationSharing } from './useLiveLocationSharing';

const Harness = ({ expose }) => {
    const controller = useLiveLocationSharing({ socket: { emit: vi.fn() }, sendLocationMessage: vi.fn() });
    useEffect(() => expose(controller), [controller, expose]);
    return null;
};

describe('live location lifecycle', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('stops the geolocation watcher automatically after the selected duration', () => {
        vi.useFakeTimers();
        const clearWatch = vi.fn();
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
            watchPosition: vi.fn(() => 42), clearWatch,
        }});
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        let controller;
        act(() => root.render(<Harness expose={value => { controller = value; }} />));
        act(() => controller.startLiveLocation(9, 15));
        act(() => vi.advanceTimersByTime(15 * 60 * 1000));
        expect(clearWatch).toHaveBeenCalledWith(42);
        expect(controller.liveLocationSharing).toBeNull();
        act(() => root.unmount());
    });
});
