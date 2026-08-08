import { describe, expect, it, vi } from 'vitest';
import { emitWithAcknowledgement } from './socketAcknowledgement';

const createSocket = callback => {
    const emit = vi.fn((_event, _payload, ack) => callback(ack));
    return { connected: true, timeout: vi.fn(() => ({ emit })) };
};

describe('emitWithAcknowledgement', () => {
    it('resolves only after a successful server acknowledgement', async () => {
        const socket = createSocket(ack => ack(null, { ok: true, messageId: 42 }));
        await expect(emitWithAcknowledgement(socket, 'send_message', { content: 'ciphertext' }))
            .resolves.toEqual({ ok: true, messageId: 42 });
    });

    it('marks an explicit server rejection as non-retryable', async () => {
        const socket = createSocket(ack => ack(null, { ok: false, error: 'Message blocked' }));
        const error = await emitWithAcknowledgement(socket, 'send_message', {}).catch(value => value);
        expect(error.message).toBe('Message blocked');
        expect(error.retryable).toBe(false);
    });

    it('keeps network timeout failures retryable', async () => {
        const socket = createSocket(ack => ack(new Error('operation timed out')));
        const error = await emitWithAcknowledgement(socket, 'send_message', {}).catch(value => value);
        expect(error.message).toBe('operation timed out');
        expect(error.retryable).not.toBe(false);
    });

    it('rejects immediately while disconnected', async () => {
        await expect(emitWithAcknowledgement({ connected: false }, 'send_message', {}))
            .rejects.toThrow('Socket is not connected');
    });
});
