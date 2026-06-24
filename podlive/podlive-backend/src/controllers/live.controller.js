const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const fs = require('fs');
const path = require('path');
const livekitEgressService = require('../services/livekit-egress.service');

const createToken = async (roomName, participantName, isHost = false) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    const at = new AccessToken(apiKey, apiSecret, {
        identity: participantName,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: isHost, canSubscribe: true, canPublishData: true });

    return await at.toJwt();
};

exports.createLiveSession = async (req, res) => {
    try {
        const { title, description, category } = req.body;
        const host_user_id = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Title is required to go live.' });
        }

        const livekit_room_name = `room-${crypto.randomBytes(8).toString('hex')}`;

        let newSession = await prisma.liveSession.create({
            data: {
                host_user_id,
                title,
                description,
                category,
                status: 'live',
                livekit_room_name,
                started_at: new Date(),
            }
        });

        res.status(201).json({
            message: 'Live session created successfully',
            session: newSession
        });

    } catch (error) {
        console.error('Create Live Session Error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
            code: error.code || error.errorCode
        });
    }
};

exports.startHlsEgress = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to start HLS egress for this session' });
        }

        if (session.status !== 'live') {
            return res.status(409).json({ error: 'HLS egress can only be started for live sessions' });
        }

        if (!livekitEgressService.isHlsEgressEnabled()) {
            return res.status(202).json({ enabled: false, message: 'LiveKit HLS egress is disabled' });
        }

        if (session.livekit_egress_id) {
            return res.json({
                enabled: true,
                egressId: session.livekit_egress_id,
                hlsUrl: session.recording_url
            });
        }

        const egressInfo = await livekitEgressService.startRoomHlsEgress(session);
        const hlsUrl = livekitEgressService.getLiveHlsUrl(session.id);

        const updatedSession = await prisma.liveSession.update({
            where: { id: session.id },
            data: {
                livekit_egress_id: egressInfo.egressId,
                recording_url: hlsUrl
            }
        });

        res.status(201).json({
            enabled: true,
            egressId: egressInfo.egressId,
            hlsUrl,
            session: updatedSession
        });
    } catch (error) {
        console.error('Start HLS Egress Error:', error);
        res.status(500).json({ error: 'Failed to start HLS egress', details: error.message });
    }
};

exports.startLiveSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id }, include: { host: true } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to start this session' });
        }

        const token = await createToken(session.livekit_room_name, session.host.unique_handle, true);

        res.json({ token, roomName: session.livekit_room_name });
    } catch (error) {
        console.error('Start Live Session Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.endLiveSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to end this session' });
        }

        let recording_url = null;
        if (req.file) {
            const baseUrl = `http://${req.headers.host}`;
            recording_url = `${baseUrl}/uploads/${req.file.filename}`;
        }

        if (session.livekit_egress_id) {
            livekitEgressService.stopEgress(session.livekit_egress_id).catch((egressError) => {
                console.error('LiveKit egress stop failed:', egressError);
            });
        }

        const updatedSession = await prisma.liveSession.update({
            where: { id },
            data: {
                status: 'ended',
                ended_at: new Date(),
                ...(recording_url && { recording_url }),
                livekit_egress_id: null,
                viewer_count_peak: Math.floor(Math.random() * 50) + 12
            }
        });

        if (req.io) {
            req.io.to(id).emit('podcast_ended');
        }

        res.json({ message: 'Live session ended successfully', session: updatedSession });
    } catch (error) {
        console.error('End Live Session Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getViewerToken = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.status !== 'live') {
            return res.status(404).json({ error: 'Active live session not found' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const isHost = session.host_user_id === req.user.id;
        const token = await createToken(session.livekit_room_name, user.unique_handle, isHost);

        res.json({ token, roomName: session.livekit_room_name, isHost });
    } catch (error) {
        console.error('Get Viewer Token Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.upgradeViewerToken = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.status !== 'live') {
            return res.status(404).json({ error: 'Active live session not found' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const token = await createToken(session.livekit_room_name, user.unique_handle, true);

        res.json({ token, roomName: session.livekit_room_name });
    } catch (error) {
        console.error('Upgrade Viewer Token Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getActiveLives = async (req, res) => {
    try {
        const sessions = await prisma.liveSession.findMany({
            where: { status: 'live' },
            include: { host: true },
            orderBy: { started_at: 'desc' }
        });
        res.json(sessions);
    } catch (error) {
        console.error('Get Active Lives Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getSessionStats = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session) {
            return res.status(404).json({ error: 'Live session not found' });
        }

        res.json({
            viewer_count_peak: session.viewer_count_peak,
            status: session.status,
            started_at: session.started_at,
            ended_at: session.ended_at
        });
    } catch (error) {
        console.error('Get Session Stats Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRecordingDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({
            where: { id },
            include: {
                host: true,
                subtitles: true,
                chat_messages: {
                    orderBy: { created_at: 'asc' }
                }
            }
        });

        if (!session) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        // We can expose the details even if the session is not ended yet for future-proofing,
        // but it's typically for 'ended' status.
        // Also exclude sensitive host data
        const { host, ...sessionData } = session;
        const { password_hash, ...publicHost } = host;

        res.json({
            ...sessionData,
            host: publicHost
        });

    } catch (error) {
        console.error('Get Recording Details Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'Comment message is required' });
        }

        const newComment = await prisma.chatMessage.create({
            data: {
                session_id: id,
                sender_handle: user.unique_handle,
                message: message.trim(),
                created_at: new Date()
            }
        });

        res.status(201).json({
            message: 'Comment added successfully',
            comment: newComment
        });

    } catch (error) {
        console.error('Add Comment Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const session = await prisma.liveSession.findUnique({ where: { id } });
        if (!session) {
            return res.status(404).json({ error: 'Live session not found' });
        }

        const existingLike = await prisma.like.findUnique({
            where: {
                user_id_session_id: {
                    user_id,
                    session_id: id
                }
            }
        });

        if (existingLike) {
            // Unlike
            await prisma.like.delete({ where: { id: existingLike.id } });
            await prisma.liveSession.update({
                where: { id },
                data: { like_count: { decrement: 1 } }
            });
            res.json({ liked: false });
        } else {
            // Like
            await prisma.like.create({
                data: { user_id, session_id: id }
            });
            await prisma.liveSession.update({
                where: { id },
                data: { like_count: { increment: 1 } }
            });
            res.json({ liked: true });
        }
    } catch (error) {
        console.error("Toggle like error:", error);
        res.status(500).json({ error: 'Failed to toggle like status' });
    }
};

exports.getLikeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const existingLike = await prisma.like.findUnique({
            where: {
                user_id_session_id: {
                    user_id,
                    session_id: id
                }
            }
        });

        res.json({ liked: !!existingLike });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch like status' });
    }
};

exports.deleteRecording = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const session = await prisma.liveSession.findUnique({
            where: { id },
            include: { subtitles: true }
        });

        if (!session) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        if (session.host_user_id !== user_id) {
            return res.status(403).json({ error: 'You do not have permission to delete this recording' });
        }

        // Delete associated files
        try {
            // 1. Delete subtitle files
            if (session.subtitles && session.subtitles.length > 0) {
                session.subtitles.forEach(sub => {
                    if (sub.vtt_url) {
                        try {
                            const url = new URL(sub.vtt_url);
                            const fileName = path.basename(url.pathname);
                            const filePath = path.join(__dirname, '../../uploads', fileName);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (e) {
                            console.error('Failed to parse subtitle URL or delete file:', e);
                        }
                    }
                });
            }

            // 2. Delete HLS directory
            const hlsDir = path.join(__dirname, '../../uploads', `hls_${id}`);
            if (fs.existsSync(hlsDir)) {
                fs.rmSync(hlsDir, { recursive: true, force: true });
            }

            // 3. Delete local thumbnail
            if (session.thumbnail_url && session.thumbnail_url.includes('/uploads/')) {
                try {
                    const url = new URL(session.thumbnail_url);
                    const fileName = path.basename(url.pathname);
                    const filePath = path.join(__dirname, '../../uploads', fileName);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) { }
            }

            // 4. Delete original video file if recording_url points to a direct local file
            if (session.recording_url && session.recording_url.includes('/uploads/') && !session.recording_url.includes('hls_')) {
                try {
                    const url = new URL(session.recording_url);
                    const fileName = path.basename(url.pathname);
                    const filePath = path.join(__dirname, '../../uploads', fileName);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) { }
            }
        } catch (fileError) {
            console.error('Error deleting files associated with recording:', fileError);
            // We can choose to softly ignore file deletion errors to still clean up DB
        }

        // We must also delete nested relations manually or use cascade deletes, 
        // since sqlite in prisma might require explicit cascades or manual deletion.
        // Let's manually delete likes, comments, subtitles, and invites related to this session to avoid foreign key constraints
        await prisma.subtitle.deleteMany({ where: { session_id: id } });
        await prisma.like.deleteMany({ where: { session_id: id } });
        await prisma.chatMessage.deleteMany({ where: { session_id: id } });
        await prisma.stageInvite.deleteMany({ where: { session_id: id } });

        await prisma.liveSession.delete({
            where: { id }
        });

        res.json({ message: 'Recording deleted successfully' });
    } catch (error) {
        console.error("Delete recording error:", error);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
};

exports.getPublicVODs = async (req, res) => {
    try {
        const { category, sort = 'latest', limit = 24 } = req.query;
        const where = { status: 'ended', recording_url: { not: null } };
        if (category && category !== 'All') where.category = category;

        const orderBy = sort === 'popular'
            ? [{ views: 'desc' }, { ended_at: 'desc' }]
            : [{ ended_at: 'desc' }];

        const sessions = await prisma.liveSession.findMany({
            where,
            include: { host: { select: { id: true, unique_handle: true, display_name: true, avatar_url: true, is_verified: true } } },
            orderBy,
            take: parseInt(limit)
        });
        res.json(sessions);
    } catch (error) {
        console.error('Get Public VODs Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.incrementViewCount = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.update({
            where: { id },
            data: { views: { increment: 1 } }
        });

        res.json({ views: session.views });
    } catch (error) {
        console.error("Increment view error:", error);
        res.status(500).json({ error: 'Failed to increment view count' });
    }
};
