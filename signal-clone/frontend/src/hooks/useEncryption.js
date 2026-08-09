import { useState, useEffect, useRef } from 'react';
import { generateKeys, generateRecoveryCode, importPrivateKey, protectPrivateKeyWithPassword, restorePrivateKeyWithPassword } from '../utils/encryption';
import axios from 'axios';
import { loadDevicePrivateKey, saveDevicePrivateKey } from '../utils/secureKeyStore';

export const useEncryption = (user, token) => {
    const [privateKey, setPrivateKey] = useState(null);
    const [publicKey, setPublicKey] = useState(null);
    const recoveryPromptedRef = useRef(false);

    useEffect(() => {
        const initKeys = async () => {
            if (!user) return;

            const storageKeyPub = `pubKey_${user.id}`;

            const storedPriv = await loadDevicePrivateKey(user.id);
            const storedPub = localStorage.getItem(storageKeyPub);

            if (storedPriv && storedPub) {
                try {
                    const importedPriv = await importPrivateKey(storedPriv);
                    setPrivateKey(importedPriv);
                    setPublicKey(storedPub);
                    return;
                } catch (e) {
                    console.error("Failed to import stored keys", e);
                }
            }

            // Never silently replace an existing account key. Doing so would make
            // historical encrypted messages unreadable on every other device.
            if (user.publicKey) {
                setPublicKey(user.publicKey);
                if (recoveryPromptedRef.current) return;
                recoveryPromptedRef.current = true;
                try {
                    const response = await axios.get('/api/user/key-recovery', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (response.data.recoveryKeyBackup) {
                        const recoveryCode = window.prompt('Enter your CHEETCHAT recovery code to restore encrypted chats on this device:');
                        if (recoveryCode?.trim()) {
                            const restoredPrivateKey = await restorePrivateKeyWithPassword(response.data.recoveryKeyBackup, recoveryCode.trim());
                            await saveDevicePrivateKey(user.id, restoredPrivateKey);
                            localStorage.setItem(storageKeyPub, user.publicKey);
                            setPrivateKey(await importPrivateKey(restoredPrivateKey));
                            return;
                        }
                    }
                } catch (error) {
                    console.warn('Encrypted chat key recovery was not completed.', error);
                }
                const resetApproved = window.confirm('This device cannot recover your chat key. Reset encryption so new messages work? Old encrypted messages may remain unreadable.');
                if (!resetApproved) return;
                const replacementKeys = await generateKeys();
                const recoveryCode = generateRecoveryCode();
                const encryptedRecoveryKey = await protectPrivateKeyWithPassword(replacementKeys.privateKeyString, recoveryCode);
                await axios.post('/api/user/key', {
                    publicKey: replacementKeys.publicKeyString,
                    encryptedRecoveryKey,
                    resetExisting: true,
                }, { headers: { Authorization: `Bearer ${token}` } });
                await saveDevicePrivateKey(user.id, replacementKeys.privateKeyString);
                localStorage.setItem(storageKeyPub, replacementKeys.publicKeyString);
                setPrivateKey(replacementKeys.privateKey);
                setPublicKey(replacementKeys.publicKeyString);
                sessionStorage.setItem('recovery_code_once', recoveryCode);
                window.location.assign('/recovery-code');
                return;
            }

            // First-device setup for legacy accounts that do not have a key yet.
            const keys = await generateKeys();

            await saveDevicePrivateKey(user.id, keys.privateKeyString);
            localStorage.setItem(storageKeyPub, keys.publicKeyString);

            setPrivateKey(keys.privateKey);
            setPublicKey(keys.publicKeyString);

            // Sync public key with server
            if (token) {
                try {
                    await axios.post('/api/user/key',
                        { publicKey: keys.publicKeyString },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    console.log("Synced new public key with server");
                } catch (e) {
                    console.error("Failed to sync key", e);
                }
            }
        };

        initKeys();
    }, [user, token]);

    return { privateKey, publicKey };
};
