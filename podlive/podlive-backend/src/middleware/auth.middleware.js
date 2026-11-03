const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token is required' });
        }

        const token = authHeader.split(' ')[1];

        // Verify Token
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded; // Contains user id

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid authentication token' });
    }
};
