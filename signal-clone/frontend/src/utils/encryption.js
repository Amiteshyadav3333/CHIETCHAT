// Basic simulation of E2EE using Web Crypto API or similar logic
// In a real app, use the Web Crypto API for ECDH + AES-GCM

// For this prototype, we'll use a simplified RSA approach or just simulate functions 
// to ensure the app flow works first, as implementing full robust E2EE from scratch 
// in one go is complex and error-prone without specific libraries installed via npm.
// However, I will implement a basic version using the built-in window.crypto.subtle if possible
// or just placeholder encryption that actually scrambles text to demonstrate the concept.

// Let's use a simple XOR or Base64 rotation for "demonstration" of encryption 
// if we want to avoid heavy libraries, BUT the prompt asked for "cryptography lib".
// I'll assume we can use standard WebCrypto APIs available in browsers.

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
