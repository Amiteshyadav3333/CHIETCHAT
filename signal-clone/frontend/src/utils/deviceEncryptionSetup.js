import axios from 'axios';
import { generateKeys, generateRecoveryCode, protectPrivateKeyWithPassword } from './encryption';
import { saveDevicePrivateKey } from './secureKeyStore';

export const createFreshDeviceEncryptionIdentity = async (user, token) => {
    const keys = await generateKeys();
    const recoveryCode = generateRecoveryCode();
    const encryptedRecoveryKey = await protectPrivateKeyWithPassword(keys.privateKeyString, recoveryCode);
    const payload = {
        publicKey: keys.publicKeyString,
        encryptedRecoveryKey,
        ...(user?.publicKey ? { resetExisting: true } : {}),
    };
    const headers = token && token !== 'cookie-session'
        ? { Authorization: `Bearer ${token}` }
        : {};

    await axios.post('/api/user/key', payload, { headers });
    await saveDevicePrivateKey(user.id, keys.privateKeyString);
    localStorage.setItem(`pubKey_${user.id}`, keys.publicKeyString);

    return { keys, recoveryCode, user: { ...user, publicKey: keys.publicKeyString } };
};
