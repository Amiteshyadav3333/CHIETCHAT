import { useEffect, useRef } from 'react';

/**
 * Global back navigation stack for CheetChat.
 * Ensures the browser/device back button (and swipe-back gestures)
 * steps back 1-by-1 through modals, drawers, subviews, and active chats.
 */

const backStack = [];
let programmaticPopCount = 0;
let isInitialized = false;

function initBackNavigation() {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

    window.addEventListener('popstate', () => {
        // If this popstate was triggered by our own history.back() cleanup, consume it and return
        if (programmaticPopCount > 0) {
            programmaticPopCount--;
            return;
        }

        if (backStack.length > 0) {
            const top = backStack.pop();
            top.poppedByPopstate = true;
            try {
                top.handler();
            } catch (err) {
                console.error('[BackNavigation] Error in handler for', top.id, err);
            }
        }
    });

    // Also support keyboard Escape key on desktop to go back 1 step
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && backStack.length > 0) {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                activeEl.blur();
                return;
            }
            window.history.back();
        }
    });
}

/**
 * Register a step on the back stack.
 * Pushes a dummy state into history so the browser's back button triggers popstate.
 * Returns an unregister function.
 */
export function registerBackHandler(handler, id = Math.random().toString(36).slice(2)) {
    initBackNavigation();

    // Push dummy history entry so the browser's back action has something to pop
    window.history.pushState({ cheetchat_back_id: id }, '', window.location.href);

    const entry = { id, handler, poppedByPopstate: false };
    backStack.push(entry);

    return () => {
        const index = backStack.findIndex(e => e.id === id);
        if (index !== -1) {
            const [removed] = backStack.splice(index, 1);
            // If it was closed by UI (not consumed by popstate event), pop the dummy history entry
            if (!removed.poppedByPopstate) {
                programmaticPopCount++;
                window.history.back();
            }
        }
    };
}

/**
 * React hook to register a back handler whenever `active` is true.
 */
export function useBackHandler(active, onBack, id) {
    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;

    useEffect(() => {
        if (!active) return undefined;
        return registerBackHandler(() => {
            onBackRef.current?.();
        }, id);
    }, [active, id]);
}

/**
 * Programmatically trigger 1 step back (equivalent to hardware/browser back)
 */
export function stepBack() {
    if (typeof window !== 'undefined') {
        window.history.back();
    }
}
