const express = require('express');
const router = express.Router();
const liveController = require('../controllers/live.controller');
const authMiddleware = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, 'recording-' + uniqueSuffix + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

router.post('/create', authMiddleware, liveController.createLiveSession);
router.post('/:id/start', authMiddleware, liveController.startLiveSession);
router.post('/:id/hls/start', authMiddleware, liveController.startHlsEgress);
router.post('/:id/end', authMiddleware, upload.single('video'), liveController.endLiveSession);
router.get('/:id/token', authMiddleware, liveController.getViewerToken);
router.get('/:id/upgrade', authMiddleware, liveController.upgradeViewerToken);
router.get('/active', liveController.getActiveLives);
router.get('/vods', liveController.getPublicVODs);
router.get('/:id/stats', liveController.getSessionStats);
router.get('/:id/recording', liveController.getRecordingDetails);
router.post('/:id/comment', authMiddleware, liveController.addComment);
router.post('/:id/like', authMiddleware, liveController.toggleLike);
router.get('/:id/like-status', authMiddleware, liveController.getLikeStatus);
router.post('/:id/view', liveController.incrementViewCount);
router.delete('/:id', authMiddleware, liveController.deleteRecording);

module.exports = router;
