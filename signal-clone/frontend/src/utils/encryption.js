// Hybrid message encryption: a fresh AES-GCM key protects each message envelope;
// RSA-OAEP wraps that key independently for every authorized recipient.

export const generateKeys = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );

    // Export public key to send to server
    const exportedPublicKey = await window.crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey
    );

    const exportedPrivateKey = await window.crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey
    );

    return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        publicKeyString: arrayBufferToBase64(exportedPublicKey),
        privateKeyString: arrayBufferToBase64(exportedPrivateKey)
    };
};

export const generateRecoveryCode = () => {
    const bytes = window.crypto.getRandomValues(new Uint8Array(24));
    const encoded = arrayBufferToBase64(bytes)
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return encoded.match(/.{1,6}/g).join('-');
};

export const importPublicKey = async (pem) => {
    // pem is base64 string
    const binaryDer = base64ToArrayBuffer(pem);
    return await window.crypto.subtle.importKey(
        "spki",
        binaryDer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        true,
        ["encrypt"]
    );
};

export const importPrivateKey = async (pem) => {
    // pem is base64 string
    const binaryDer = base64ToArrayBuffer(pem);
    return await window.crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        true,
        ["decrypt"]
    );
};

export const protectPrivateKeyWithPassword = async (privateKeyString, password) => {
    const encoder = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const material = await window.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
        material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(privateKeyString));
    return JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 250000, salt: arrayBufferToBase64(salt), iv: arrayBufferToBase64(iv), data: arrayBufferToBase64(encrypted) });
};

export const restorePrivateKeyWithPassword = async (backup, password) => {
    const envelope = typeof backup === 'string' ? JSON.parse(backup) : backup;
    const iterations = Number(envelope?.iterations);
    if (
        envelope?.v !== 1 || envelope?.kdf !== 'PBKDF2-SHA256' ||
        !envelope?.salt || !envelope?.iv || !envelope?.data ||
        !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000 ||
        envelope.salt.length > 128 || envelope.iv.length > 64 || envelope.data.length > 20000
    ) throw new Error('Invalid key backup');
    const encoder = new TextEncoder();
    const material = await window.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: new Uint8Array(base64ToArrayBuffer(envelope.salt)), iterations, hash: 'SHA-256' },
        material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(envelope.iv)) }, key, base64ToArrayBuffer(envelope.data)
    );
    return new TextDecoder().decode(decrypted);
};

export const encryptMessage = async (publicKey, message) => {
    const encoded = new TextEncoder().encode(message);
    const encrypted = await window.crypto.subtle.encrypt(
        {
            name: "RSA-OAEP"
        },
        publicKey,
        encoded
    );
    return arrayBufferToBase64(encrypted);
};

export const decryptMessage = async (privateKey, encryptedMessage) => {
    try {
        const encryptedData = base64ToArrayBuffer(encryptedMessage);
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            privateKey,
            encryptedData
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption failed", e);
        return "⚠️ Decryption error";
    }
};

export const encryptForRecipients = async (recipientPublicKeys, message) => {
    const aesKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = new TextEncoder().encode(message);
    const encryptedMessage = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encodedMessage
    );

    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const recipients = {};

    for (const [userId, publicKeyString] of Object.entries(recipientPublicKeys)) {
        const publicKey = await importPublicKey(publicKeyString);
        const encryptedKey = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            rawAesKey
        );

        recipients[userId] = arrayBufferToBase64(encryptedKey);
    }

    return JSON.stringify({
        v: 1,
        encrypted: true,
        algorithm: "RSA-OAEP-256/AES-GCM",
        iv: arrayBufferToBase64(iv),
        data: arrayBufferToBase64(encryptedMessage),
        recipients
    });
};

export const decryptEnvelope = async (privateKey, userId, encryptedPayload) => {
    let envelope;

    try {
        envelope = JSON.parse(encryptedPayload);
    } catch {
        return encryptedPayload;
    }

    if (!envelope?.encrypted || !envelope.recipients) {
        return encryptedPayload;
    }

    const encryptedKey = envelope.recipients[String(userId)];
    if (!encryptedKey) return "🔒 Encrypted message";
    if (!privateKey) return "🔒 Encrypted message";

    try {
        const rawAesKey = await window.crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            privateKey,
            base64ToArrayBuffer(encryptedKey)
        );

        const aesKey = await window.crypto.subtle.importKey(
            "raw",
            rawAesKey,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(envelope.iv)) },
            aesKey,
            base64ToArrayBuffer(envelope.data)
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        // Silently fallback — expected when keys rotate (logout/login cycles)
        return "🔒 Message";
    }
};

export const isEncryptedPayload = (payload) => {
    try {
        const parsed = JSON.parse(payload);
        return Boolean(parsed?.encrypted && parsed?.recipients);
    } catch {
        return false;
    }
};

// Helpers
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
