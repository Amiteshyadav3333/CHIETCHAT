const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
const activeUsers = new Map();    // userId -> socketId
const pendingDisconnects = new Map(); // userId -> timeoutId

module.exports = (io) => {
    io.on('connection', (socket) => {

        // ── Register user ──────────────────────────────────────
        socket.on('register_user', () => {
            const userId = socket.data.userId;
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
                let handle = (inviteeHandle || '').trim().toLowerCase();
                if (!handle.startsWith('@')) handle = '@' + handle;

                const withoutAt = handle.replace(/^@+/, '');
                const authenticatedHostId = socket.data.userId;
                const [invitee, host, session] = await Promise.all([
                    prisma.user.findFirst({ where: { OR: [{ unique_handle: handle }, { unique_handle: withoutAt }, { unique_handle: `@${withoutAt}` }] } }),
                    prisma.user.findUnique({ where: { id: authenticatedHostId } }),
                    prisma.liveSession.findUnique({ where: { id: sessionId }, select: { host_user_id: true, status: true } })
                ]);

                if (!session || session.host_user_id !== authenticatedHostId || session.status !== 'live') {
                    return socket.emit('invite_status', { success: false, message: 'Only the active host can send stage invites.' });
                }

                if (!invitee) {
                    return socket.emit('invite_status', { success: false, message: `User ${handle} not found.` });
                }

                // Emitting to a user room works locally and across the optional
                // Redis adapter; no process-local socket lookup is required.
                io.to(invitee.id).emit('receive_invite', { sessionId, host });
                socket.emit('invite_status', { success: true, message: `Invite sent to ${handle}!` });
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
        socket.on('join_chat_room', async (sessionId) => {
            if (!sessionId) return;
            await socket.join(sessionId);
            io.to(sessionId).emit('viewer_count_update', { viewerCount: io.sockets.adapter.rooms.get(sessionId)?.size || 0 });
        });

        socket.on('leave_chat_room', async (sessionId) => {
            if (!sessionId) return;
            await socket.leave(sessionId);
            io.to(sessionId).emit('viewer_count_update', { viewerCount: io.sockets.adapter.rooms.get(sessionId)?.size || 0 });
        });

        socket.on('disconnecting', () => {
            for (const room of socket.rooms) {
                if (room !== socket.id) io.to(room).emit('viewer_count_update', { viewerCount: Math.max(0, (io.sockets.adapter.rooms.get(room)?.size || 1) - 1) });
            }
        });

        socket.on('send_chat_message', async ({ sessionId, message }) => {
            if (!sessionId || !message?.trim()) return;

            const senderId = socket.data.userId;
            if (!senderId) return;
            const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { unique_handle: true } });
            if (!sender) return;

            const payload = { senderHandle: sender.unique_handle, message: message.trim(), created_at: new Date() };
            io.to(sessionId).emit('receive_chat_message', payload);

            // Persist to DB asynchronously
            prisma.chatMessage.create({
                data: { session_id: sessionId, sender_handle: sender.unique_handle, message: message.trim() }
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
