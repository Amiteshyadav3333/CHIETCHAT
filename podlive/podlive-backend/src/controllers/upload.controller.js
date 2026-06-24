const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const subtitleService = require('../services/subtitle.service');
const hlsService = require('../services/hls.service');
const s3Service = require('../services/s3.service');

const safeUnlink = (filePath) => {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { }
};

exports.uploadVideo = async (req, res) => {
    let videoFilePath = null;
    let thumbnailFilePath = null;

    try {
        const { title, description, category, sessionId } = req.body;
        const host_user_id = req.user.id;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        if (!req.files || !req.files.video || req.files.video.length === 0) {
            return res.status(400).json({ error: 'Video file is required' });
        }

        const videoFile = req.files.video[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        videoFilePath = videoFile.path;
        thumbnailFilePath = thumbnailFile ? thumbnailFile.path : null;

        console.log(`[Upload] Starting upload: title="${title}", file="${videoFile.originalname}", size=${(videoFile.size / 1024 / 1024).toFixed(1)}MB`);

        const baseUrlForLocal = `${req.protocol}://${req.get('host')}`;

        // ── Upload video to S3, fallback to local ──
        let videoUrl;
        try {
            const videoS3Key = `videos/${Date.now()}-${videoFile.filename}`;
            videoUrl = await s3Service.uploadFileToS3(videoFilePath, videoS3Key, videoFile.mimetype || 'video/mp4');
            console.log(`[Upload] Video uploaded to S3: ${videoUrl}`);
        } catch (s3Err) {
            console.warn(`[Upload] S3 video upload failed (${s3Err.message}), using local fallback`);
            videoUrl = `${baseUrlForLocal}/uploads/${videoFile.filename}`;
        }

        // ── Upload thumbnail to S3, fallback to default ──
        let thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200';
        if (thumbnailFile) {
            try {
                const thumbS3Key = `thumbnails/${Date.now()}-${thumbnailFile.filename}`;
                thumbnailUrl = await s3Service.uploadFileToS3(thumbnailFilePath, thumbS3Key, thumbnailFile.mimetype || 'image/jpeg');
                safeUnlink(thumbnailFilePath);
                thumbnailFilePath = null;
                console.log(`[Upload] Thumbnail uploaded to S3: ${thumbnailUrl}`);
            } catch (s3Err) {
                console.warn(`[Upload] S3 thumbnail upload failed (${s3Err.message}), using local fallback`);
                thumbnailUrl = `${baseUrlForLocal}/uploads/${thumbnailFile.filename}`;
            }
        }

        // ── Save to DB ──
        let newVOD;
        if (sessionId) {
            const existingSession = await prisma.liveSession.findUnique({ where: { id: sessionId } });
            if (!existingSession || existingSession.host_user_id !== host_user_id) {
                return res.status(403).json({ error: 'Unauthorized or session not found' });
            }
            newVOD = await prisma.liveSession.update({
                where: { id: sessionId },
                data: {
                    title: title.trim(),
                    description: description?.trim() || null,
                    category: category || 'General',
                    recording_url: videoUrl,
                    thumbnail_url: thumbnailFile ? thumbnailUrl : existingSession.thumbnail_url,
                    is_processing: true,
                    status: 'ended'
                }
            });
        } else {
            newVOD = await prisma.liveSession.create({
                data: {
                    host_user_id,
                    title: title.trim(),
                    description: description?.trim() || null,
                    category: category || 'General',
                    status: 'ended',
                    viewer_count_peak: 0,
                    recording_url: videoUrl,
                    thumbnail_url: thumbnailUrl,
                    started_at: new Date(),
                    ended_at: new Date(),
                    is_processing: true
                }
            });
        }

        console.log(`[Upload] DB record created: ${newVOD.id}`);

        // ── Respond immediately (don't wait for HLS/subtitles) ──
        res.status(201).json({
            message: 'Video uploaded. Processing started in background.',
            video: newVOD
        });

        // ── Background processing ──
        // Subtitles
        subtitleService.processSubtitles(newVOD.id, videoFilePath, baseUrlForLocal).catch(err => {
            console.error('[Upload] Subtitle processing failed:', err.message);
        });

        // HLS transcoding
        hlsService.processHLS(newVOD.id, videoFilePath, baseUrlForLocal).catch(err => {
            console.error('[Upload] HLS processing failed:', err.message);
        });

    } catch (error) {
        console.error('[Upload] Controller error:', error.message, error.stack);
        // Cleanup temp files on error
        safeUnlink(videoFilePath);
        safeUnlink(thumbnailFilePath);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to upload video',
                details: error.message
            });
        }
    }
};
