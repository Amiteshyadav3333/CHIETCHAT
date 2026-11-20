import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const RecoveryCodePromptContext = createContext(null);

export const useRecoveryCodePrompt = () => {
    const context = useContext(RecoveryCodePromptContext);
    if (!context) throw new Error('useRecoveryCodePrompt must be used inside RecoveryCodePromptProvider');
    return context;
};

export const RecoveryCodePromptProvider = ({ children }) => {
    const [open, setOpen] = useState(false);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [hasRecoveryKey, setHasRecoveryKey] = useState(true);
    const resolverRef = useRef(null);

    const requestRecoveryCode = useCallback(({ hasRecoveryKey: recoveryAvailable = true } = {}) => new Promise(resolve => {
        resolverRef.current?.(null);
        resolverRef.current = resolve;
        setRecoveryCode('');
        setHasRecoveryKey(recoveryAvailable);
        setOpen(true);
    }), []);

    const finishPrompt = value => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setOpen(false);
        setRecoveryCode('');
        resolve?.(value);
    };

    return (
        <RecoveryCodePromptContext.Provider value={{ requestRecoveryCode }}>
            {children}
            {open && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <form
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="recovery-code-title"
                        onSubmit={event => {
                            event.preventDefault();
                            finishPrompt(recoveryCode.trim());
                        }}
                        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111820] p-6 text-white shadow-2xl"
                    >
                        <h2 id="recovery-code-title" className="text-xl font-bold">Open your encrypted chats</h2>
                        <p className="mt-2 text-sm leading-6 text-gray-400">{hasRecoveryKey ? 'Enter your recovery code to restore this device’s chat key. If you have lost it, you can still sign in and start with a new key; old encrypted chats will stay locked.' : 'This device has no saved chat key or recovery backup. You can still sign in and start with a new key; old encrypted chats will stay locked.'}</p>
                        {hasRecoveryKey && <>
                            <label htmlFor="ducor-recovery-code" className="mt-5 block text-sm font-semibold">Recovery code</label>
                            <input
                                id="ducor-recovery-code"
                                type="password"
                                autoComplete="off"
                                autoFocus
                                value={recoveryCode}
                                onChange={event => setRecoveryCode(event.target.value)}
                                className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-white outline-none focus:border-sky-400"
                            />
                        </>}
                        <div className="mt-5 flex justify-end gap-3">
                            <button type="button" onClick={() => finishPrompt(null)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5">Cancel</button>
                            <button type="button" onClick={() => finishPrompt({ action: 'continue-with-new-key' })} className="rounded-lg border border-amber-300/30 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/10">Continue without old chats</button>
                            {hasRecoveryKey && <button type="submit" disabled={!recoveryCode.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50">Restore chats</button>}
                        </div>
                    </form>
                </div>
            )}
        </RecoveryCodePromptContext.Provider>
    );
};
