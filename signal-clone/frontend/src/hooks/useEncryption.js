import { useState, useEffect, useRef } from 'react';
import { generateKeys, importPrivateKey, restorePrivateKeyWithPassword } from '../utils/encryption';
import axios from 'axios';
import { loadDevicePrivateKey, saveDevicePrivateKey } from '../utils/secureKeyStore';
import { useRecoveryCodePrompt } from '../context/RecoveryCodePromptContext';

export const useEncryption = (user, token) => {
    const [privateKey, setPrivateKey] = useState(null);
    const [publicKey, setPublicKey] = useState(null);
    const recoveryPromptedRef = useRef(false);
    const { requestRecoveryCode } = useRecoveryCodePrompt();

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
                        const recoveryCode = await requestRecoveryCode();
                        if (recoveryCode?.trim()) {
                            const restoredPrivateKey = await restorePrivateKeyWithPassword(response.data.recoveryKeyBackup, recoveryCode.trim());
                            await saveDevicePrivateKey(user.id, restoredPrivateKey);
                            localStorage.setItem(storageKeyPub, user.publicKey);
                            setPrivateKey(await importPrivateKey(restoredPrivateKey));
                            return;
                        }
                        return;
                    }
                } catch (error) {
                    console.warn('Encrypted chat key recovery was not completed.', error);
                    return;
                }
                return;
            }

            // First-device setup for legacy accounts that do not have a key yet.
            try {
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
            } catch (err) {
                console.error("Encryption initialization failed:", err);
                if (err.message && err.message.includes('secure context')) {
                    alert(err.message);
                }
            }
        };

        initKeys();
    }, [user, token, requestRecoveryCode]);

    return { privateKey, publicKey };
};
