import { useState, useEffect } from 'react';
import { generateKeys, importPrivateKey } from '../utils/encryption';
import axios from 'axios';
import { loadDevicePrivateKey, saveDevicePrivateKey } from '../utils/secureKeyStore';

export const useEncryption = (user, token) => {
    const [privateKey, setPrivateKey] = useState(null);
    const [publicKey, setPublicKey] = useState(null);

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
                console.error('Private chat key is unavailable on this device; recovery is required.');
                setPublicKey(user.publicKey);
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
