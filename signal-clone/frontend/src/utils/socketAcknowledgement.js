export const emitWithAcknowledgement = (socket, event, payload, timeoutMs = 10000) => (
    new Promise((resolve, reject) => {
        if (!socket?.connected) {
            reject(new Error('Socket is not connected'));
            return;
        }

        socket.timeout(timeoutMs).emit(event, payload, (timeoutError, acknowledgement) => {
            if (timeoutError) {
                reject(timeoutError);
                return;
            }
            if (!acknowledgement?.ok) {
                const rejected = new Error(acknowledgement?.error || 'Request was rejected');
                rejected.retryable = acknowledgement?.retryable === true;
                rejected.retryAfter = Number(acknowledgement?.retryAfter || 0);
                reject(rejected);
                return;
            }
            resolve(acknowledgement);
        });
    })
);
