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

// Trust-on-first-use pinning prevents the service from silently replacing a
// contact's public key later to intercept future messages. A legitimate key
// reset must be explicitly resolved by the user/device recovery flow.
export const assertPinnedPublicKey = async (userId, publicKeyString) => {
    const digest = await window.crypto.subtle.digest("SHA-256", base64ToArrayBuffer(publicKeyString));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const storageKey = `e2ee_key_pin_${userId}`;
    const pinned = localStorage.getItem(storageKey);
    if (pinned && pinned !== fingerprint) {
        throw new Error("This contact's security key changed. Verify the contact before sending.");
    }
    if (!pinned) localStorage.setItem(storageKey, fingerprint);
    return fingerprint;
};

export const createSafetyNumber = async (firstPublicKey, secondPublicKey) => {
    if (!firstPublicKey || !secondPublicKey) throw new Error("Both encryption keys are required");
    const ordered = [firstPublicKey, secondPublicKey].sort();
    const joined = new TextEncoder().encode(`${ordered[0]}.${ordered[1]}`);
    const digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", joined));
    const digits = Array.from(digest, byte => byte.toString().padStart(3, "0")).join("").slice(0, 60);
    return {
        fingerprint: Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join(""),
        display: digits.match(/.{1,5}/g).join(" ")
    };
};

const MEDIA_ENVELOPE_TYPE = "cheetchat/e2ee-media";

// The storage provider receives only AES-GCM ciphertext. The file key is wrapped
// separately for every chat member and travels inside the already encrypted
// message envelope, so neither the API nor Cloudinary can render the upload.
export const encryptMediaForRecipients = async (recipientPublicKeys, file) => {
    const key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, key, await file.arrayBuffer()
    );
    const rawKey = await window.crypto.subtle.exportKey("raw", key);
    const recipients = {};
    for (const [userId, publicKeyString] of Object.entries(recipientPublicKeys)) {
        const publicKey = await importPublicKey(publicKeyString);
        recipients[userId] = arrayBufferToBase64(await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" }, publicKey, rawKey
        ));
    }
    return {
        ciphertext: new Blob([ciphertext], { type: "application/octet-stream" }),
        descriptor: {
            v: 1, type: MEDIA_ENVELOPE_TYPE, algorithm: "RSA-OAEP-256/AES-GCM",
            iv: arrayBufferToBase64(iv), recipients,
            name: String(file.name || "attachment").slice(0, 255),
            mime: String(file.type || "application/octet-stream").slice(0, 150),
            size: Number(file.size || 0)
        }
    };
};

export const isEncryptedMediaDescriptor = (value) => {
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return parsed?.type === MEDIA_ENVELOPE_TYPE && parsed?.v === 1 &&
            typeof parsed.url === "string" && parsed.url.length > 0 &&
            parsed.recipients && typeof parsed.recipients === "object";
    } catch {
        return false;
    }
};

export const decryptMediaDescriptor = async (privateKey, userId, value) => {
    const descriptor = typeof value === "string" ? JSON.parse(value) : value;
    if (!isEncryptedMediaDescriptor(descriptor)) throw new Error("Invalid encrypted media descriptor");
    const wrappedKey = descriptor.recipients[String(userId)];
    if (!wrappedKey) throw new Error("Media key is unavailable for this device");
    const rawKey = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" }, privateKey, base64ToArrayBuffer(wrappedKey)
    );
    const key = await window.crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const response = await fetch(descriptor.url, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Encrypted media download failed");
    const ciphertext = await response.arrayBuffer();
    const plaintext = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(descriptor.iv)) }, key, ciphertext
    );
    return URL.createObjectURL(new Blob([plaintext], { type: descriptor.mime || "application/octet-stream" }));
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
