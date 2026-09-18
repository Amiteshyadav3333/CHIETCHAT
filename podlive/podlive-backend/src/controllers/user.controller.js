const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get Host Settings
exports.getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

// Update Host Settings
exports.updateProfile = async (req, res) => {
    try {
        const { display_name, bio } = req.body;
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { display_name, bio }
        });
        res.json({ message: 'Profile updated', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

// Get Audience Stats
exports.getAudienceStats = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { hosted_sessions: true }
        });

        // Calculate stats
        const totalLives = user.hosted_sessions.length;
        const totalViews = user.hosted_sessions.reduce((acc, curr) => acc + curr.viewer_count_peak, 0);

        res.json({
            followers: user.follower_count,
            totalLives,
            totalViews
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audience stats' });
    }
};

// Get Past Recordings
exports.getRecordings = async (req, res) => {
    try {
        const sessions = await prisma.liveSession.findMany({
            where: {
                host_user_id: req.user.id,
                status: 'ended'
            },
            orderBy: { created_at: 'desc' }
        });
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
};

// Get Creator Public Profile
exports.getCreatorProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const creator = await prisma.user.findUnique({
            where: { id },
            include: {
                hosted_sessions: {
                    orderBy: { created_at: 'desc' }
                }
            }
        });

        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        const totalLives = creator.hosted_sessions.length;
        const totalViews = creator.hosted_sessions.reduce((acc, curr) => acc + curr.viewer_count_peak, 0);
        const recordings = creator.hosted_sessions.filter(s => s.status === 'ended');

        // We don't want to expose the password hash
        const { password_hash, ...publicProfile } = creator;

        res.json({
            ...publicProfile,
            totalLives,
            totalViews,
            recordings
        });
    } catch (error) {
        console.error("Error fetching creator profile:", error);
        res.status(500).json({ error: 'Failed to fetch creator profile' });
    }
};

// Toggle Follow/Unfollow
exports.toggleFollow = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.body.creatorId;

        if (followerId === followingId) {
            return res.status(400).json({ error: "You cannot follow yourself" });
        }

        const existingFollow = await prisma.follows.findUnique({
            where: {
                follower_id_following_id: {
                    follower_id: followerId,
                    following_id: followingId
                }
            }
        });

        if (existingFollow) {
            // Unfollow
            await prisma.follows.delete({
                where: { id: existingFollow.id }
            });
            const updatedProfile = await prisma.user.update({
                where: { id: followingId },
                data: { follower_count: { decrement: 1 } }
            });
            await prisma.user.update({
                where: { id: followerId },
                data: { following_count: { decrement: 1 } }
            });

            // Update followers in REAL-TIME via Socket Room (userId room)
            if (req.io) {
                req.io.to(followingId).emit('follower_count_update', { count: updatedProfile.follower_count });
            }

            res.json({ following: false, follower_count: updatedProfile.follower_count });
        } else {
            // Follow
            await prisma.follows.create({
                data: {
                    follower_id: followerId,
                    following_id: followingId
                }
            });
            const updatedProfile = await prisma.user.update({
                where: { id: followingId },
                data: { follower_count: { increment: 1 } }
            });
            await prisma.user.update({
                where: { id: followerId },
                data: { following_count: { increment: 1 } }
            });

            // Update followers in REAL-TIME via Socket Room (userId room)
            if (req.io) {
                req.io.to(followingId).emit('follower_count_update', { count: updatedProfile.follower_count });
            }

            res.json({ following: true, follower_count: updatedProfile.follower_count });
        }
    } catch (error) {
        console.error("Toggle follow error:", error);
        res.status(500).json({ error: 'Failed to toggle follow status' });
    }
};

// Get Follow Status
exports.getFollowStatus = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.params.creatorId;

        const existingFollow = await prisma.follows.findUnique({
            where: {
                follower_id_following_id: {
                    follower_id: followerId,
                    following_id: followingId
                }
            }
        });

        res.json({ following: !!existingFollow });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch follow status' });
    }
};
