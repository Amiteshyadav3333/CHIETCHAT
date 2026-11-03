const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');

const livekitHost = process.env.LIVEKIT_URL || 'http://127.0.0.1:7880';
const roomService = new RoomServiceClient(livekitHost, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);

const findUserByHandle = async (rawHandle) => {
    const clean = String(rawHandle || '').trim();
    if (!clean) return null;
    const withoutAt = clean.replace(/^@+/, '');
    return prisma.user.findFirst({
        where: { OR: [{ unique_handle: clean }, { unique_handle: withoutAt }, { unique_handle: `@${withoutAt}` }] }
    });
};

const createToken = async (roomName, participantName) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    const at = new AccessToken(apiKey, apiSecret, {
        identity: participantName,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });

    return await at.toJwt();
};

exports.inviteUser = async (req, res) => {
    try {
        const { sessionId, handle } = req.body;
        const host_id = req.user.id;

        const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
        if (!session || session.host_user_id !== host_id || session.status !== 'live') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const invitee = await findUserByHandle(handle);
        if (!invitee) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newInvite = await prisma.stageInvite.create({
            data: {
                session_id: sessionId,
                host_id,
                invitee_id: invitee.id,
                status: 'pending'
            }
        });

        const host = await prisma.user.findUnique({ where: { id: host_id } });
        req.io?.to(invitee.id).emit('receive_invite', {
            sessionId,
            inviteId: newInvite.id,
            invite: newInvite,
            host: host && { id: host.id, display_name: host.display_name, unique_handle: host.unique_handle, avatar_url: host.avatar_url }
        });
        res.status(201).json({
            message: 'Invite sent', invite: newInvite,
            invitee: { id: invitee.id, unique_handle: invitee.unique_handle, display_name: invitee.display_name, avatar_url: invitee.avatar_url }
        });
    } catch (error) {
        console.error('Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getPendingInvite = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const invite = await prisma.stageInvite.findFirst({
            where: {
                invitee_id: req.user.id,
                status: 'pending',
                session: { status: 'live' }
            },
            include: { host: true, session: true },
            orderBy: { invited_at: 'desc' }
        });

        if (!invite) return res.json({ invite: null });
        return res.json({
            invite: {
                inviteId: invite.id,
                sessionId: invite.session_id,
                host: {
                    id: invite.host.id,
                    display_name: invite.host.display_name,
                    unique_handle: invite.host.unique_handle,
                    avatar_url: invite.host.avatar_url
                }
            }
        });
    } catch (error) {
        console.error('Pending Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.acceptInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const invite = await prisma.stageInvite.findUnique({ where: { id }, include: { session: true, invitee: true } });

        if (!invite || invite.invitee_id !== req.user.id || invite.session.status !== 'live') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        if (invite.status !== 'accepted') {
            if (invite.status !== 'pending') return res.status(409).json({ error: 'Invite is no longer active' });
            const updated = await prisma.stageInvite.updateMany({
                where: { id, invitee_id: req.user.id, status: 'pending' },
                data: { status: 'accepted', accepted_at: new Date() }
            });
            if (!updated.count) return res.status(409).json({ error: 'Invite is no longer active' });
        }

        // Generate token for the stage participant
        const token = await createToken(invite.session.livekit_room_name, invite.invitee.unique_handle);

        req.io?.to(invite.host_id).emit('invite_accepted', { sessionId: invite.session_id, inviteeHandle: invite.invitee.unique_handle });
        res.set('Cache-Control', 'no-store');
        res.json({ message: 'Invite accepted', token, roomName: invite.session.livekit_room_name, livekitUrl: process.env.LIVEKIT_URL });
    } catch (error) {
        console.error('Accept Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.rejectInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const invite = await prisma.stageInvite.findUnique({ where: { id } });

        if (!invite || invite.invitee_id !== req.user.id || invite.status !== 'pending') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const updated = await prisma.stageInvite.updateMany({
            where: { id, invitee_id: req.user.id, status: 'pending' },
            data: { status: 'rejected' }
        });
        if (!updated.count) return res.status(409).json({ error: 'Invite is no longer active' });
        const invitee = await prisma.user.findUnique({ where: { id: req.user.id }, select: { unique_handle: true } });
        req.io?.to(invite.host_id).emit('invite_rejected', { sessionId: invite.session_id, inviteeHandle: invitee?.unique_handle });

        res.json({ message: 'Invite rejected' });
    } catch (error) {
        console.error('Reject Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.removeGuest = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;

        const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
        if (!session || session.host_user_id !== host_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        try {
            await roomService.removeParticipant(session.livekit_room_name, guestUser.unique_handle);
        } catch (e) {
            console.log("Error removing from LiveKit room (maybe already left):", e.message);
        }

        await prisma.stageInvite.updateMany({
            where: { session_id: sessionId, invitee_id: userId, status: 'accepted' },
            data: { status: 'ended', left_at: new Date() }
        });

        res.json({ message: 'Guest removed' });
    } catch (error) {
        console.error('Remove Guest Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.muteGuestMic = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;

        const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
        if (!session || session.host_user_id !== host_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        try {
            const participant = await roomService.getParticipant(session.livekit_room_name, guestUser.unique_handle);
            if (participant && participant.tracks) {
                for (const track of participant.tracks) {
                    if (track.source === TrackSource.MICROPHONE) {
                        await roomService.mutePublishedTrack(session.livekit_room_name, guestUser.unique_handle, track.sid, true);
                    }
                }
            }
        } catch (e) {
            console.log("Error muting guest mic:", e.message);
        }

        res.json({ message: 'Guest mic muted' });
    } catch (error) {
        console.error('Mute Guest Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.disableGuestCamera = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;

        const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
        if (!session || session.host_user_id !== host_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        try {
            const participant = await roomService.getParticipant(session.livekit_room_name, guestUser.unique_handle);
            if (participant && participant.tracks) {
                for (const track of participant.tracks) {
                    if (track.source === TrackSource.CAMERA) {
                        await roomService.mutePublishedTrack(session.livekit_room_name, guestUser.unique_handle, track.sid, true);
                    }
                }
            }
        } catch (e) {
            console.log("Error disabling guest camera:", e.message);
        }

        res.json({ message: 'Guest camera disabled' });
    } catch (error) {
        console.error('Disable Guest Camera Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


exports.getGuests = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { host_user_id: true } });
        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const guests = await prisma.stageInvite.findMany({
            where: { session_id: sessionId, status: 'accepted' },
            select: {
                id: true, session_id: true, host_id: true, invitee_id: true, status: true,
                invited_at: true, accepted_at: true, left_at: true,
                invitee: { select: { id: true, unique_handle: true, display_name: true, avatar_url: true } }
            }
        });

        res.json(guests);
    } catch (error) {
        console.error('Get Guests Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
