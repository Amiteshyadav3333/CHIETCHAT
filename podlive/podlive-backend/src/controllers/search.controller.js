const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.searchAll = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.json({ users: [], sessions: [] });
        }

        const searchQuery = q.trim();

        // Search Users
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { display_name: { contains: searchQuery } },
                    { unique_handle: { contains: searchQuery } }
                ]
            },
            select: {
                id: true,
                display_name: true,
                unique_handle: true,
                avatar_url: true,
                follower_count: true,
                is_verified: true
            },
            take: 10
        });

        // Search Sessions (Live or Recorded)
        const sessions = await prisma.liveSession.findMany({
            where: {
                OR: [
                    { title: { contains: searchQuery } },
                    { description: { contains: searchQuery } },
                    { category: { contains: searchQuery } }
                ]
            },
            include: {
                host: {
                    select: {
                        id: true,
                        display_name: true,
                        unique_handle: true,
                        avatar_url: true
                    }
                }
            },
            take: 20,
            orderBy: {
                created_at: 'desc'
            }
        });

        res.json({ users, sessions });
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
