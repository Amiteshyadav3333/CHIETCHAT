// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecoveryCodePromptProvider, useRecoveryCodePrompt } from './RecoveryCodePromptContext';

let container;
let root;
let recoveryCodePromise;

const PromptHarness = () => {
    const { requestRecoveryCode } = useRecoveryCodePrompt();
    return <button type="button" onClick={() => { recoveryCodePromise = requestRecoveryCode(); }}>Request recovery code</button>;
};

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    recoveryCodePromise = null;
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('recovery code prompt', () => {
    it('collects the code in an in-app dialog and resolves it to login', async () => {
        act(() => root.render(<RecoveryCodePromptProvider><PromptHarness /></RecoveryCodePromptProvider>));
        act(() => container.querySelector('button').click());
        expect(container.querySelector('[role="dialog"]')).not.toBeNull();

        const input = container.querySelector('#ducor-recovery-code');
        act(() => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            valueSetter.call(input, 'TEST-RECOVERY-CODE');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

        await expect(recoveryCodePromise).resolves.toBe('TEST-RECOVERY-CODE');
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('resolves cancel without exposing or changing the recovery key', async () => {
        act(() => root.render(<RecoveryCodePromptProvider><PromptHarness /></RecoveryCodePromptProvider>));
        act(() => container.querySelector('button').click());
        act(() => container.querySelector('[role="dialog"] button[type="button"]').click());
        await expect(recoveryCodePromise).resolves.toBeNull();
    });
});
