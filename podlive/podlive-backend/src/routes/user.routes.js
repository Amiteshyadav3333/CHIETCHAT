const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/profile', authMiddleware, userController.getProfile);
router.put('/profile', authMiddleware, userController.updateProfile);
router.get('/audience', authMiddleware, userController.getAudienceStats);
router.get('/recordings', authMiddleware, userController.getRecordings);

// Public route to view creator profile
router.get('/creator/:id', userController.getCreatorProfile);

// Follow / Unfollow logic
router.post('/follow', authMiddleware, userController.toggleFollow);
router.get('/follow-status/:creatorId', authMiddleware, userController.getFollowStatus);

module.exports = router;
