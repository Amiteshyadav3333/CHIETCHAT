const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
