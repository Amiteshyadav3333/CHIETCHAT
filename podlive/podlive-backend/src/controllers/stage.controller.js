const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');

const livekitHost = process.env.LIVEKIT_URL || 'http://127.0.0.1:7880';
const roomService = new RoomServiceClient(livekitHost, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);

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
        if (!session || session.host_user_id !== host_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const invitee = await prisma.user.findUnique({ where: { unique_handle: handle } });
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

        // The real-time notification will be handled by Socket.IO separately in the route or frontend
        res.status(201).json({ message: 'Invite sent', invite: newInvite, invitee });
    } catch (error) {
        console.error('Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.acceptInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const invite = await prisma.stageInvite.findUnique({ where: { id }, include: { session: true, invitee: true } });

        if (!invite || invite.invitee_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const updatedInvite = await prisma.stageInvite.update({
            where: { id },
            data: { status: 'accepted', accepted_at: new Date() }
        });

        // Generate token for the stage participant
        const token = await createToken(invite.session.livekit_room_name, invite.invitee.unique_handle);

        res.json({ message: 'Invite accepted', token, roomName: invite.session.livekit_room_name });
    } catch (error) {
        console.error('Accept Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.rejectInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const invite = await prisma.stageInvite.findUnique({ where: { id } });

        if (!invite || invite.invitee_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await prisma.stageInvite.update({
            where: { id },
            data: { status: 'rejected' }
        });

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
        const guests = await prisma.stageInvite.findMany({
            where: { session_id: sessionId, status: 'accepted' },
            include: { invitee: true }
        });

        res.json(guests);
    } catch (error) {
        console.error('Get Guests Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
