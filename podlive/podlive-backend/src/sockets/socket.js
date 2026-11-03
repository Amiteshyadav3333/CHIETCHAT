const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
const activeUsers = new Map();    // userId -> Set<socketId>
const pendingDisconnects = new Map(); // userId -> timeoutId

const addActiveSocket = (userId, socketId) => {
    const sockets = activeUsers.get(userId) || new Set();
    sockets.add(socketId);
    activeUsers.set(userId, sockets);
};

const removeActiveSocket = (userId, socketId) => {
    const sockets = activeUsers.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size) return false;
    activeUsers.delete(userId);
    return true;
};

module.exports = (io) => {
    io.on('connection', (socket) => {
        const chatMessageTimes = [];
        const isLiveSessionHost = async (sessionId) => {
            if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 64) return false;
            const session = await prisma.liveSession.findUnique({
                where: { id: sessionId }, select: { host_user_id: true, status: true }
            });
            return session?.status === 'live' && session.host_user_id === socket.data.userId;
        };

        // ── Register user ──────────────────────────────────────
        socket.on('register_user', () => {
            const userId = socket.data.userId;
            if (!userId) return;
            addActiveSocket(userId, socket.id);
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

                const invite = await prisma.stageInvite.create({
                    data: { session_id: sessionId, host_id: authenticatedHostId, invitee_id: invitee.id, status: 'pending' }
                });

                // Emitting to a user room works locally and across the optional
                // Redis adapter; no process-local socket lookup is required.
                io.to(invitee.id).emit('receive_invite', {
                    sessionId, inviteId: invite.id, invite,
                    host: host && { id: host.id, display_name: host.display_name, unique_handle: host.unique_handle, avatar_url: host.avatar_url }
                });
                socket.emit('invite_status', { success: true, message: `Invite sent to ${handle}!` });
            } catch (err) {
                console.error('[Socket] send_invite error:', err.message);
                socket.emit('invite_status', { success: false, message: 'Server error sending invite.' });
            }
        });

        socket.on('accept_invite', async ({ inviteId }) => {
            try {
                const invite = await prisma.stageInvite.findUnique({ where: { id: inviteId } });
                if (!invite || invite.invitee_id !== socket.data.userId || invite.status !== 'pending') return;
                const session = await prisma.liveSession.findUnique({ where: { id: invite.session_id } });
                if (!session || session.status !== 'live' || session.host_user_id !== invite.host_id) return;
                const updated = await prisma.stageInvite.updateMany({
                    where: { id: invite.id, invitee_id: socket.data.userId, status: 'pending' },
                    data: { status: 'accepted', accepted_at: new Date() }
                });
                if (!updated.count) return;
                const invitee = await prisma.user.findUnique({ where: { id: socket.data.userId }, select: { unique_handle: true } });
                io.to(invite.host_id).emit('invite_accepted', { sessionId: invite.session_id, inviteeHandle: invitee?.unique_handle });
            } catch (err) {
                console.error('[Socket] accept_invite error:', err.message);
            }
        });

        socket.on('reject_invite', async ({ inviteId }) => {
            try {
                const invite = await prisma.stageInvite.findUnique({ where: { id: inviteId } });
                if (!invite || invite.invitee_id !== socket.data.userId || invite.status !== 'pending') return;
                const updated = await prisma.stageInvite.updateMany({
                    where: { id: invite.id, invitee_id: socket.data.userId, status: 'pending' },
                    data: { status: 'rejected' }
                });
                if (!updated.count) return;
                const invitee = await prisma.user.findUnique({ where: { id: socket.data.userId }, select: { unique_handle: true } });
                io.to(invite.host_id).emit('invite_rejected', { sessionId: invite.session_id, inviteeHandle: invitee?.unique_handle });
            } catch (err) {
                console.error('[Socket] reject_invite error:', err.message);
            }
        });

        // ── Host controls (mic / camera / kick) ────────────────
        socket.on('mute_guest', async ({ sessionId, guestId }) => {
            if (guestId && await isLiveSessionHost(sessionId)) io.to(guestId).emit('guest_muted', { sessionId });
        });

        socket.on('disable_camera_guest', async ({ sessionId, guestId }) => {
            if (guestId && await isLiveSessionHost(sessionId)) io.to(guestId).emit('guest_camera_disabled', { sessionId });
        });

        socket.on('remove_guest', async ({ sessionId, guestId }) => {
            if (guestId && await isLiveSessionHost(sessionId)) io.to(guestId).emit('guest_removed', { sessionId });
        });

        // ── Live chat ──────────────────────────────────────────
        socket.on('join_chat_room', async (sessionId) => {
            if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 64) return;
            const joinedRooms = socket.data.joinedLiveRooms || new Set();
            if (!joinedRooms.has(sessionId) && joinedRooms.size >= 20) return;
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { status: true } });
            if (!session || session.status !== 'live') return;
            joinedRooms.add(sessionId);
            socket.data.joinedLiveRooms = joinedRooms;
            await socket.join(sessionId);
            io.to(sessionId).emit('viewer_count_update', { viewerCount: io.sockets.adapter.rooms.get(sessionId)?.size || 0 });
        });

        socket.on('leave_chat_room', async (sessionId) => {
            if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 64) return;
            await socket.leave(sessionId);
            socket.data.joinedLiveRooms?.delete(sessionId);
            io.to(sessionId).emit('viewer_count_update', { viewerCount: io.sockets.adapter.rooms.get(sessionId)?.size || 0 });
        });

        socket.on('disconnecting', () => {
            for (const room of socket.rooms) {
                if (room !== socket.id) io.to(room).emit('viewer_count_update', { viewerCount: Math.max(0, (io.sockets.adapter.rooms.get(room)?.size || 1) - 1) });
            }
        });

        socket.on('send_chat_message', async ({ sessionId, message }) => {
            if (typeof sessionId !== 'string' || !socket.rooms.has(sessionId) || typeof message !== 'string') return;
            const cleanMessage = message.trim();
            if (!cleanMessage || cleanMessage.length > 1000) return;
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { status: true } });
            if (!session || session.status !== 'live') return;

            const now = Date.now();
            while (chatMessageTimes.length && chatMessageTimes[0] <= now - 10000) chatMessageTimes.shift();
            if (chatMessageTimes.length >= 20) return;
            chatMessageTimes.push(now);

            const senderId = socket.data.userId;
            if (!senderId) return;
            const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { unique_handle: true } });
            if (!sender) return;

            try {
                const saved = await prisma.chatMessage.create({
                    data: { session_id: sessionId, sender_handle: sender.unique_handle, message: cleanMessage }
                });
                io.to(sessionId).emit('receive_chat_message', {
                    senderHandle: sender.unique_handle, message: cleanMessage, created_at: saved.created_at
                });
            } catch (err) {
                console.error('[Socket] Chat save error:', err.message);
            }
        });

        // ── Disconnect ─────────────────────────────────────────
        socket.on('disconnect', async () => {
            const disconnectedUserId = socket.data.userId;
            if (!disconnectedUserId || !removeActiveSocket(disconnectedUserId, socket.id)) return;

            // Auto-end session if host disconnects and doesn't reconnect in 20s
            try {
                const activeSessions = await prisma.liveSession.findMany({
                    where: { host_user_id: disconnectedUserId, status: 'live' }
                });

                if (activeSessions.length > 0) {
                    const redisClient = io.redisClient;
                    const lockKey = `podlive:host-disconnect:${disconnectedUserId}`;
                    const lockValue = socket.id;
                    if (redisClient?.isReady) {
                        const claimed = await redisClient.set(lockKey, lockValue, { NX: true, EX: 45 });
                        if (!claimed) return;
                    }
                    console.log(`[Socket] Host ${disconnectedUserId} disconnected — 20s grace timer started`);

                    const timeoutId = setTimeout(async () => {
                        try {
                            // Query the shared Socket.IO adapter so a host connected to
                            // another instance is not disconnected from their live room.
                            let stillConnected;
                            if (redisClient && !redisClient.isReady) {
                                throw new Error('Shared realtime store unavailable; leaving the host live');
                            }
                            if (redisClient) {
                                const activeSockets = await io.in(disconnectedUserId).fetchSockets();
                                stillConnected = activeSockets.length > 0;
                            } else {
                                stillConnected = activeUsers.has(disconnectedUserId);
                            }
                            if (stillConnected) return;

                            for (const session of activeSessions) {
                                const ended = await prisma.liveSession.updateMany({
                                    where: { id: session.id, host_user_id: disconnectedUserId, status: 'live' },
                                    data: { status: 'ended', ended_at: new Date(), livekit_egress_id: null }
                                });
                                if (!ended.count) continue;
                                io.to(session.id).emit('podcast_ended');
                                io.emit('live_ended', { sessionId: session.id });
                                console.log(`[Socket] Auto-ended session ${session.id}`);
                            }
                        } catch (err) {
                            console.error('[Socket] Auto-end check failed:', err.message);
                        } finally {
                            pendingDisconnects.delete(disconnectedUserId);
                            if (redisClient?.isReady) {
                                await redisClient.eval(
                                    "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
                                    { keys: [lockKey], arguments: [lockValue] }
                                ).catch((err) => console.error('[Socket] Disconnect lock cleanup failed:', err.message));
                            }
                        }
                    }, 20000);

                    pendingDisconnects.set(disconnectedUserId, timeoutId);
                }
            } catch (err) {
                console.error('[Socket] Disconnect handler error:', err.message);
            }
        });
    });
};
