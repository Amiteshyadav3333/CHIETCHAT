import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { receiveSnapVideoDirect, sendSnapVideoDirect } from './p2pSnapTransfer';
import { getEncryptedSnapMedia } from './snapMediaStore';

class MockDataChannel {
    binaryType = 'blob';
    bufferedAmount = 0;
    sent = [];
    close() {}
    send(value) {
        this.sent.push(value);
        if (value instanceof ArrayBuffer) {
            const metadata = JSON.parse(this.sent[0]);
            setTimeout(() => this.onmessage?.({ data: JSON.stringify({ kind: 'complete', transferId: metadata.transferId, size: metadata.size }) }), 0);
        }
    }
}

class MockPeerConnection {
    iceGatheringState = 'complete';
    connectionState = 'connected';
    localDescription = null;
    constructor() { this.channel = new MockDataChannel(); globalThis.lastSnapPeer = this; }
    createDataChannel() { return this.channel; }
    async createOffer() { return { type: 'offer', sdp: 'local-offer' }; }
    async setRemoteDescription() { setTimeout(() => this.channel.onopen?.(), 0); }
    async createAnswer() { return { type: 'answer', sdp: 'local-answer' }; }
    async setLocalDescription(description) {
        this.localDescription = description;
        setTimeout(() => this.ondatachannel?.({ channel: this.channel }), 0);
    }
    close() {}
}

describe('direct Snap transfer', () => {
    beforeEach(async () => {
        globalThis.RTCPeerConnection = MockPeerConnection;
        const localValues = new Map();
        globalThis.localStorage = {
            getItem: key => localValues.has(key) ? localValues.get(key) : null,
            setItem: (key, value) => localValues.set(key, String(value)),
            removeItem: key => localValues.delete(key),
        };
        await new Promise(resolve => {
            const request = indexedDB.deleteDatabase('cheetchat-snap-media');
            request.onsuccess = resolve;
            request.onerror = resolve;
            request.onblocked = resolve;
        });
    });
    afterEach(() => { delete globalThis.RTCPeerConnection; delete globalThis.lastSnapPeer; });

    it('receives and stores encrypted video chunks locally without an upload request', async () => {
        const transferId = crypto.randomUUID();
        const payload = {
            chatId: 4, transferId, fromUserId: 9,
            offer: { type: 'offer', sdp: 'remote-offer' },
            file: { size: 8, mime: 'video/webm', name: 'private.webm' },
            descriptor: { url: `p2p://${transferId}` },
        };
        const socket = {
            connected: true,
            emit: vi.fn((_event, _data, acknowledge) => acknowledge({ ok: true })),
        };
        const transfer = receiveSnapVideoDirect({ socket, payload });
        await new Promise(resolve => setTimeout(resolve, 10));
        const channel = globalThis.lastSnapPeer.channel;
        channel.onmessage({ data: JSON.stringify({ kind: 'file', size: 8 }) });
        channel.onmessage({ data: new TextEncoder().encode('cipher!!').buffer });
        await expect(transfer).resolves.toMatchObject({ transferId });
        expect(socket.emit).toHaveBeenCalledWith('snap_transfer_answer', expect.objectContaining({ transferId }), expect.any(Function));
        expect(await (await getEncryptedSnapMedia(transferId)).text()).toBe('cipher!!');
    });

    it('sends encrypted video bytes over the data channel and never fetches a media URL', async () => {
        const transferId = crypto.randomUUID();
        const signalHandlers = new Map();
        const socket = {
            connected: true,
            on: (event, handler) => signalHandlers.set(event, handler),
            off: event => signalHandlers.delete(event),
            emit: vi.fn((event, data, acknowledge) => {
                acknowledge({ ok: true });
                if (event === 'snap_transfer_offer') setTimeout(() => signalHandlers.get('snap_transfer_answer')?.({ transferId, answer: { type: 'answer', sdp: 'remote-answer' } }), 0);
            }),
        };
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        await sendSnapVideoDirect({
            socket, chatId: 4, toUserId: 9, transferId,
            ciphertext: new Blob(['encrypted-video'], { type: 'application/octet-stream' }),
            descriptor: { v: 1, type: 'cheetchat/e2ee-media' },
            file: { name: 'private.webm', type: 'video/webm' },
        });
        const channel = globalThis.lastSnapPeer.channel;
        expect(channel.sent[0]).toContain('"kind":"file"');
        expect(channel.sent.slice(1)).toEqual([expect.any(ArrayBuffer)]);
        expect(socket.emit).toHaveBeenCalledWith('snap_transfer_offer', expect.objectContaining({ transferId, toUserId: 9 }), expect.any(Function));
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(await (await getEncryptedSnapMedia(transferId)).text()).toBe('encrypted-video');
        fetchSpy.mockRestore();
    });
});
