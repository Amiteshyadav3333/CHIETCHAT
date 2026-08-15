const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const usedSsoTickets = new Map();

const generateTokens = (userId) => {
    const accessToken = jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
    return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
    try {
        const { email, password, unique_handle, display_name } = req.body;

        // Validation
        if (!email || !password || !unique_handle || !display_name) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Check if user exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ email }, { unique_handle }]
            }
        });

        if (existingUser) {
            return res.status(409).json({ error: 'User with this email or handle already exists.' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 12);

        // Create user
        const newUser = await prisma.user.create({
            data: {
                email,
                password_hash,
                unique_handle,
                display_name
            }
        });

        const tokens = generateTokens(newUser.id);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                unique_handle: newUser.unique_handle,
                email: newUser.email,
                display_name: newUser.display_name
            },
            ...tokens
        });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Update last seen
        await prisma.user.update({
            where: { id: user.id },
            data: { last_seen: new Date() }
        });

        const tokens = generateTokens(user.id);

        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                unique_handle: user.unique_handle,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
            },
            ...tokens
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

exports.checkHandle = async (req, res) => {
    try {
        const { handle } = req.params;
        const user = await prisma.user.findUnique({ where: { unique_handle: handle } });

        if (user) {
            return res.status(200).json({ available: false });
        }

        return res.status(200).json({ available: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

exports.cheetchatSso = async (req, res) => {
    let claimedTicketId = null;
    try {
        const secret = process.env.PODLIVE_SSO_SECRET || '';
        if (secret.length < 32) return res.status(503).json({ error: 'Single sign-on is not configured.' });
        const { ticket } = req.body || {};
        if (!ticket) return res.status(400).json({ error: 'SSO ticket is required.' });
        const identity = jwt.verify(ticket, secret, {
            algorithms: ['HS256'], issuer: 'cheetchat', audience: 'podlive', maxAge: '60s'
        });
        if (identity.purpose !== 'podlive_sso' || !identity.jti || !identity.sub || !identity.email) {
            return res.status(401).json({ error: 'Invalid SSO ticket.' });
        }
        const now = Date.now();
        for (const [jti, expiresAt] of usedSsoTickets) if (expiresAt <= now) usedSsoTickets.delete(jti);
        if (usedSsoTickets.has(identity.jti)) return res.status(409).json({ error: 'SSO ticket was already used.' });
        usedSsoTickets.set(identity.jti, now + 65000);
        claimedTicketId = identity.jti;

        let user = await prisma.user.findFirst({
            where: { OR: [{ cheetchat_user_id: String(identity.sub) }, { email: String(identity.email).toLowerCase() }] }
        });
        if (user && user.cheetchat_user_id && user.cheetchat_user_id !== String(identity.sub)) {
            return res.status(409).json({ error: 'This PodLive account is linked to another CHEETCHAT account.' });
        }
        if (user) {
            user = await prisma.user.update({
                where: { id: user.id }, data: {
                    cheetchat_user_id: String(identity.sub), display_name: String(identity.name || user.display_name).slice(0, 100),
                    avatar_url: String(identity.avatar || user.avatar_url || '').slice(0, 500) || null, last_seen: new Date()
                }
            });
        } else {
            const baseHandle = String(identity.handle || `cheetchat_${identity.sub}`).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || `cheetchat_${identity.sub}`;
            let uniqueHandle = baseHandle;
            let suffix = 0;
            while (await prisma.user.findUnique({ where: { unique_handle: uniqueHandle } })) {
                suffix += 1; uniqueHandle = `${baseHandle.slice(0, 24)}_${suffix}`;
            }
            user = await prisma.user.create({ data: {
                cheetchat_user_id: String(identity.sub), email: String(identity.email).toLowerCase(),
                unique_handle: uniqueHandle, display_name: String(identity.name || uniqueHandle).slice(0, 100),
                avatar_url: String(identity.avatar || '').slice(0, 500) || null,
                password_hash: await bcrypt.hash(require('crypto').randomBytes(48).toString('hex'), 12), is_verified: true
            }});
        }
        const tokens = generateTokens(user.id);
        return res.json({ user: { id: user.id, unique_handle: user.unique_handle, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url }, ...tokens });
    } catch (error) {
        if (claimedTicketId) usedSsoTickets.delete(claimedTicketId);
        if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') return res.status(401).json({ error: 'SSO ticket is invalid or expired.' });
        console.error('CHEETCHAT SSO Error:', error);
        return res.status(500).json({ error: 'Could not complete single sign-on.' });
    }
};
