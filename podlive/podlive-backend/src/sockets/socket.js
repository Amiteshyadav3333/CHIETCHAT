const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
const activeUsers = new Map();    // userId -> socketId
const pendingDisconnects = new Map(); // userId -> timeoutId

module.exports = (io) => {
    io.on('connection', (socket) => {

        // ── Register user ──────────────────────────────────────
        socket.on('register_user', (userId) => {
            if (!userId) return;
            activeUsers.set(userId, socket.id);
            socket.join(userId);

            if (pendingDisconnects.has(userId)) {
                clearTimeout(pendingDisconnects.get(userId));
                pendingDisconnects.delete(userId);
                console.log(`[Socket] Host ${userId} reconnected — auto-end cancelled`);
            }
        });

        // ── Stage invites ──────────────────────────────────────
        socket.on('send_invite', async ({ sessionId, inviteeHandle, hostId }) => {
            try {
                let handle = (inviteeHandle || '').trim();
                if (!handle.startsWith('@')) handle = '@' + handle;

                const [invitee, host] = await Promise.all([
                    prisma.user.findUnique({ where: { unique_handle: handle } }),
                    prisma.user.findUnique({ where: { id: hostId } })
                ]);

                if (!invitee) {
                    return socket.emit('invite_status', { success: false, message: `User ${handle} not found.` });
                }

                const targetSocketId = activeUsers.get(invitee.id);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('receive_invite', { sessionId, host });
                    socket.emit('invite_status', { success: true, message: `Invite sent to ${handle}!` });
                } else {
                    socket.emit('invite_status', { success: false, message: `${handle} is currently offline.` });
                }
            } catch (err) {
                console.error('[Socket] send_invite error:', err.message);
                socket.emit('invite_status', { success: false, message: 'Server error sending invite.' });
            }
        });

        socket.on('accept_invite', ({ sessionId, hostId, inviteeHandle }) => {
            const hostSocket = activeUsers.get(hostId);
            if (hostSocket) io.to(hostSocket).emit('invite_accepted', { sessionId, inviteeHandle });
        });

        socket.on('reject_invite', ({ sessionId, hostId, inviteeHandle }) => {
            const hostSocket = activeUsers.get(hostId);
            if (hostSocket) io.to(hostSocket).emit('invite_rejected', { sessionId, inviteeHandle });
        });

        // ── Host controls (mic / camera / kick) ────────────────
        socket.on('mute_guest', ({ guestId }) => {
            const guestSocket = activeUsers.get(guestId);
            if (guestSocket) io.to(guestSocket).emit('guest_muted');
        });

        socket.on('disable_camera_guest', ({ guestId }) => {
            const guestSocket = activeUsers.get(guestId);
            if (guestSocket) io.to(guestSocket).emit('guest_camera_disabled');
        });

        socket.on('remove_guest', ({ guestId }) => {
            const guestSocket = activeUsers.get(guestId);
            if (guestSocket) io.to(guestSocket).emit('guest_removed');
        });

        // ── Live chat ──────────────────────────────────────────
        socket.on('join_chat_room', (sessionId) => {
            if (sessionId) socket.join(sessionId);
        });

        socket.on('leave_chat_room', (sessionId) => {
            if (sessionId) socket.leave(sessionId);
        });

        socket.on('send_chat_message', async ({ sessionId, senderHandle, message }) => {
            if (!sessionId || !message?.trim()) return;

            const payload = { senderHandle, message: message.trim(), created_at: new Date() };
            io.to(sessionId).emit('receive_chat_message', payload);

            // Persist to DB asynchronously
            prisma.chatMessage.create({
                data: { session_id: sessionId, sender_handle: senderHandle, message: message.trim() }
            }).catch(err => console.error('[Socket] Chat save error:', err.message));
        });

        // ── Follower count update ──────────────────────────────
        socket.on('follower_count_update', ({ userId, count }) => {
            io.to(userId).emit('follower_count_update', { count });
        });

        // ── Disconnect ─────────────────────────────────────────
        socket.on('disconnect', async () => {
            let disconnectedUserId = null;
            for (const [userId, socketId] of activeUsers.entries()) {
                if (socketId === socket.id) {
                    disconnectedUserId = userId;
                    activeUsers.delete(userId);
                    break;
                }
            }

            if (!disconnectedUserId) return;

            // Auto-end session if host disconnects and doesn't reconnect in 20s
            try {
                const activeSessions = await prisma.liveSession.findMany({
                    where: { host_user_id: disconnectedUserId, status: 'live' }
                });

                if (activeSessions.length > 0) {
                    console.log(`[Socket] Host ${disconnectedUserId} disconnected — 20s grace timer started`);

                    const timeoutId = setTimeout(async () => {
                        for (const session of activeSessions) {
                            try {
                                await prisma.liveSession.update({
                                    where: { id: session.id },
                                    data: { status: 'ended', ended_at: new Date(), livekit_egress_id: null }
                                });
                                io.to(session.id).emit('podcast_ended');
                                console.log(`[Socket] Auto-ended session ${session.id}`);
                            } catch (err) {
                                console.error(`[Socket] Auto-end failed for ${session.id}:`, err.message);
                            }
                        }
                        pendingDisconnects.delete(disconnectedUserId);
                    }, 20000);

                    pendingDisconnects.set(disconnectedUserId, timeoutId);
                }
            } catch (err) {
                console.error('[Socket] Disconnect handler error:', err.message);
            }
        });
    });
};
