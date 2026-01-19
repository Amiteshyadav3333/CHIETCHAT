import { useState, useEffect } from 'react';
import { generateKeys, importPrivateKey } from '../utils/encryption';
import axios from 'axios';

export const useEncryption = (user, token) => {
    const [privateKey, setPrivateKey] = useState(null);
    const [publicKey, setPublicKey] = useState(null);

    useEffect(() => {
        const initKeys = async () => {
            if (!user) return;

            const storageKeyPriv = `privKey_${user.username}`;
            const storageKeyPub = `pubKey_${user.username}`;

            const storedPriv = localStorage.getItem(storageKeyPriv);
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

            // Generate new keys if missing (e.g. new device/browser)
            const keys = await generateKeys();

            localStorage.setItem(storageKeyPriv, keys.privateKeyString);
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
