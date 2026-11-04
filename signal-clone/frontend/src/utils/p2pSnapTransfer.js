import { saveEncryptedSnapMedia, deleteEncryptedSnapMedia } from './snapMediaStore';

const MAX_CIPHERTEXT_SIZE = 100 * 1024 * 1024;
const CHUNK_SIZE = 32 * 1024;
const STUN_URL = import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302';

const createPeer = () => new RTCPeerConnection({
    // STUN is used only to discover a direct network path. There is no TURN
    // relay, media server, or cloud upload fallback: file bytes stay peer-to-peer.
    iceServers: [{ urls: STUN_URL }],
});

const waitForIce = peer => new Promise((resolve, reject) => {
    if (peer.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(() => reject(new Error('Could not establish a direct connection. Try again on a different network.')), 12000);
    const check = () => {
        if (peer.iceGatheringState !== 'complete') return;
        clearTimeout(timer);
        peer.removeEventListener('icegatheringstatechange', check);
        resolve();
    };
    peer.addEventListener('icegatheringstatechange', check);
});

const waitForChannelOpen = channel => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The other person is offline or a direct connection could not be made.')), 45000);
    channel.onopen = () => { clearTimeout(timer); resolve(); };
    channel.onerror = () => { clearTimeout(timer); reject(new Error('Direct video connection failed.')) };
    channel.onclose = () => { clearTimeout(timer); reject(new Error('Direct video connection closed.')) };
});

const waitForDrain = channel => new Promise(resolve => {
    if (channel.bufferedAmount <= 512 * 1024) return resolve();
    channel.bufferedAmountLowThreshold = 512 * 1024;
    channel.addEventListener('bufferedamountlow', resolve, { once: true });
});

const socketRequest = (socket, event, payload) => new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Chat connection is offline.'));
    socket.emit(event, payload, result => result?.ok
        ? resolve(result)
        : reject(new Error(result?.error || 'Could not start direct video transfer.')));
});

const waitForAnswer = (socket, transferId, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('snap_transfer_answer', onAnswer); reject(new Error('The other person did not accept the direct connection.')); }, timeoutMs);
    const onAnswer = payload => {
        if (payload?.transferId !== transferId) return;
        clearTimeout(timer);
        socket.off('snap_transfer_answer', onAnswer);
        resolve(payload.answer);
    };
    socket.on('snap_transfer_answer', onAnswer);
});

export const sendSnapVideoDirect = async ({ socket, chatId, toUserId, transferId, ciphertext, descriptor, file, onProgress }) => {
    if (!(ciphertext instanceof Blob) || ciphertext.size < 1 || ciphertext.size > MAX_CIPHERTEXT_SIZE) throw new Error('Direct Snap videos must be smaller than 100 MB after encryption.');
    if (!file?.type?.startsWith('video/')) throw new Error('Direct Snap transfer supports video files only.');
    const peer = createPeer();
    const channel = peer.createDataChannel('snap-video', { ordered: true });
    channel.binaryType = 'arraybuffer';
    let transferComplete = false;
    try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await waitForIce(peer);
        const answerPromise = waitForAnswer(socket, transferId);
        await socketRequest(socket, 'snap_transfer_offer', {
            chatId, toUserId, transferId, offer: peer.localDescription,
            file: { size: ciphertext.size, mime: file.type, name: String(file.name || 'snap-video').slice(0, 160) },
            descriptor: { ...descriptor, url: `p2p://${transferId}` },
        });
        await peer.setRemoteDescription(await answerPromise);
        await waitForChannelOpen(channel);
        await saveEncryptedSnapMedia(transferId, ciphertext, { chatId, kind: 'video' });
        const completionPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('The other person did not finish receiving the video.')), 30000);
            channel.onmessage = event => {
                if (typeof event.data !== 'string') return;
                let result;
                try { result = JSON.parse(event.data); } catch { return; }
                if (result.kind === 'complete' && result.transferId === transferId) {
                    clearTimeout(timer);
                    resolve(result);
                }
            };
        });
        channel.send(JSON.stringify({ kind: 'file', transferId, size: ciphertext.size }));
        const bytes = await ciphertext.arrayBuffer();
        for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) {
            await waitForDrain(channel);
            channel.send(bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.byteLength)));
            onProgress?.(Math.min(99, Math.round(((offset + CHUNK_SIZE) / bytes.byteLength) * 100)));
        }
        const completion = await completionPromise;
        if (completion.size !== ciphertext.size) throw new Error('Direct video transfer did not finish correctly.');
        transferComplete = true;
        onProgress?.(100);
    } finally {
        channel.close();
        peer.close();
        if (!transferComplete) await deleteEncryptedSnapMedia(transferId).catch(() => {});
    }
};

export const receiveSnapVideoDirect = async ({ socket, payload, onProgress }) => {
    const { chatId, transferId, fromUserId, offer, file, descriptor } = payload || {};
    if (!chatId || !transferId || !fromUserId || !file || file.size < 1 || file.size > MAX_CIPHERTEXT_SIZE
            || !file?.mime?.startsWith('video/') || descriptor?.url !== `p2p://${transferId}`) {
        throw new Error('Invalid direct Snap transfer request.');
    }
    const peer = createPeer();
    try {
        const incomingChannel = new Promise((resolve, reject) => {
            peer.ondatachannel = event => resolve(event.channel);
            peer.onerror = () => reject(new Error('Direct video connection failed.'));
        });
        await peer.setRemoteDescription(offer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await waitForIce(peer);
        await socketRequest(socket, 'snap_transfer_answer', {
            chatId, toUserId: fromUserId, transferId, answer: peer.localDescription,
        });
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Direct Snap video transfer timed out.')), 120000);
            let expectedSize = null;
            let receivedSize = 0;
            const chunks = [];
            incomingChannel.then(channel => {
                channel.binaryType = 'arraybuffer';
                channel.onmessage = async message => {
                    if (typeof message.data === 'string') {
                        let control;
                        try { control = JSON.parse(message.data); } catch { return; }
                        if (control.kind === 'file' && Number.isInteger(control.size) && control.size === file.size) {
                            expectedSize = control.size;
                        }
                        return;
                    }
                    if (expectedSize === null) { clearTimeout(timer); reject(new Error('Missing direct video metadata.')); return; }
                    const chunk = message.data instanceof ArrayBuffer ? message.data : await message.data.arrayBuffer();
                    receivedSize += chunk.byteLength;
                    if (receivedSize > expectedSize) { clearTimeout(timer); reject(new Error('Direct video size exceeded its limit.')); return; }
                    chunks.push(chunk);
                    onProgress?.(Math.min(99, Math.round((receivedSize / expectedSize) * 100)));
                    if (receivedSize !== expectedSize) return;
                    try {
                        const encryptedBlob = new Blob(chunks, { type: 'application/octet-stream' });
                        await saveEncryptedSnapMedia(transferId, encryptedBlob, { chatId, kind: 'video' });
                        channel.send(JSON.stringify({ kind: 'complete', transferId, size: receivedSize }));
                        clearTimeout(timer);
                        onProgress?.(100);
                        resolve({ transferId, descriptor });
                    } catch (error) { clearTimeout(timer); reject(error); }
                };
                channel.onerror = () => { clearTimeout(timer); reject(new Error('Direct video connection failed.')); };
            }).catch(error => { clearTimeout(timer); reject(error); });
            peer.onconnectionstatechange = () => {
                if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
                    clearTimeout(timer);
                    reject(new Error('Direct video connection was interrupted.'));
                }
            };
        });
    } finally { peer.close(); }
};
