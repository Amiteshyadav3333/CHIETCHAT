import { useState, useEffect } from 'react';
import { generateKeys, importPublicKey, importPrivateKey } from '../utils/encryption';

export const useEncryption = (user) => {
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
                    // const importedPub = await importPublicKey(storedPub); 
                    // specific import not strongly needed for local verify but good for consistency

                    setPrivateKey(importedPriv);
                    setPublicKey(storedPub);
                    // console.log("Loaded keys from storage");
                    return;
                } catch (e) {
                    console.error("Failed to import stored keys", e);
                }
            }

            const keys = await generateKeys();

            localStorage.setItem(storageKeyPriv, keys.privateKeyString);
            localStorage.setItem(storageKeyPub, keys.publicKeyString);

            setPrivateKey(keys.privateKey);
            setPublicKey(keys.publicKeyString);
        };

        initKeys();
    }, [user]);

    return { privateKey, publicKey };
};
