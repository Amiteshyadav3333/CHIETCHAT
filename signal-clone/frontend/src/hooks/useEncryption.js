import { useState, useEffect, useRef, useContext } from 'react';
import { importPrivateKey, privateKeyMatchesPublicKey, restorePrivateKeyWithPassword } from '../utils/encryption';
import axios from 'axios';
import { loadDevicePrivateKey, saveDevicePrivateKey } from '../utils/secureKeyStore';
import { useRecoveryCodePrompt } from '../context/RecoveryCodePromptContext';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from '../utils/clientRouter';
import { createFreshDeviceEncryptionIdentity } from '../utils/deviceEncryptionSetup';

export const useEncryption = (user, token) => {
    const [privateKey, setPrivateKey] = useState(null);
    const [publicKey, setPublicKey] = useState(null);
    const recoveryPromptedRef = useRef(false);
    const updateUserRef = useRef(null);
    const { requestRecoveryCode } = useRecoveryCodePrompt();
    const { updateUser } = useContext(AuthContext);
    const navigate = useNavigate();
    updateUserRef.current = updateUser;

    useEffect(() => {
        const initKeys = async () => {
            if (!user) return;

            const storageKeyPub = `pubKey_${user.id}`;

            const storedPriv = await loadDevicePrivateKey(user.id);
            const storedPub = localStorage.getItem(storageKeyPub);

            if (storedPriv && storedPub && storedPub === user.publicKey) {
                try {
                    const importedPriv = await importPrivateKey(storedPriv);
                    setPrivateKey(importedPriv);
                    setPublicKey(storedPub);
                    return;
                } catch (e) {
                    console.error("Failed to import stored keys", e);
                }
            }

            if (user.publicKey) {
                setPublicKey(user.publicKey);
                if (recoveryPromptedRef.current) return;
                recoveryPromptedRef.current = true;
                try {
                    const response = await axios.get('/api/user/key-recovery', {
                        headers: token && token !== 'cookie-session' ? { Authorization: `Bearer ${token}` } : {},
                    });
                    const recoveryKeyBackup = response.data.recoveryKeyBackup;
                    const choice = await requestRecoveryCode({ hasRecoveryKey: Boolean(recoveryKeyBackup) });
                    if (typeof choice === 'string' && choice.trim() && recoveryKeyBackup) {
                        const restoredPrivateKey = await restorePrivateKeyWithPassword(recoveryKeyBackup, choice.trim());
                        if (!await privateKeyMatchesPublicKey(restoredPrivateKey, user.publicKey)) throw new Error('Recovery key does not match this account.');
                        const importedPrivateKey = await importPrivateKey(restoredPrivateKey);
                        await saveDevicePrivateKey(user.id, restoredPrivateKey);
                        localStorage.setItem(storageKeyPub, user.publicKey);
                        setPrivateKey(importedPrivateKey);
                        return;
                    }
                    if (choice?.action === 'continue-with-new-key') {
                        const freshIdentity = await createFreshDeviceEncryptionIdentity(user, token);
                        setPrivateKey(freshIdentity.keys.privateKey);
                        setPublicKey(freshIdentity.keys.publicKeyString);
                        updateUserRef.current?.(freshIdentity.user);
                        sessionStorage.setItem('recovery_code_once', freshIdentity.recoveryCode);
                        sessionStorage.setItem('recovery_code_optional', '1');
                        sessionStorage.setItem('pending_nav', '/recovery-code');
                        navigate('/recovery-code', { replace: true });
                    }
                } catch (error) {
                    console.warn('Encrypted chat key recovery was not completed.', error);
                    return;
                }
                return;
            }

            // Set up a secured first-device key for legacy accounts with no keys.
            try {
                const freshIdentity = await createFreshDeviceEncryptionIdentity(user, token);
                setPrivateKey(freshIdentity.keys.privateKey);
                setPublicKey(freshIdentity.keys.publicKeyString);
                updateUserRef.current?.(freshIdentity.user);
                sessionStorage.setItem('recovery_code_once', freshIdentity.recoveryCode);
                sessionStorage.setItem('recovery_code_optional', '0');
                sessionStorage.setItem('pending_nav', '/recovery-code');
                navigate('/recovery-code', { replace: true });
            } catch (err) {
                console.error("Encryption initialization failed:", err);
                if (err.message && err.message.includes('secure context')) {
                    alert(err.message);
                }
            }
        };

        initKeys();
    }, [user, token, requestRecoveryCode, navigate]);

    return { privateKey, publicKey };
};
