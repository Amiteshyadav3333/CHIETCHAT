/**
 * mediaCompressor.js
 * WhatsApp-style media compression utilities
 * - Images: Canvas-based JPEG compression (max 1280px, quality 0.78)
 * - Videos: MediaRecorder re-encode at reduced bitrate
 * - Audio: Already compressed (WebM/OGG from MediaRecorder)
 */

/**
 * Compresses an image file using Canvas API
 * @param {File} file - Image file to compress
 * @param {Object} options
 * @param {number} options.maxWidth - Max width in pixels (default 1280)
 * @param {number} options.maxHeight - Max height in pixels (default 1280)
 * @param {number} options.quality - JPEG quality 0-1 (default 0.78)
 * @returns {Promise<File>} - Compressed image file
 */
export const compressImage = (file, options = {}) => {
    const {
        maxWidth = 1280,
        maxHeight = 1280,
        quality = 0.78
    } = options;

    return new Promise((resolve, reject) => {
        // Don't compress GIFs or SVGs
        if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
            resolve(file);
            return;
        }

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let { width, height } = img;

            // Scale down proportionally if needed
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            // If already small enough and already JPEG/WebP, skip compression
            if (img.width <= maxWidth && img.height <= maxHeight && file.size < 200 * 1024) {
                resolve(file);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            // Prefer WebP if supported, fallback to JPEG
            const outputMime = 'image/jpeg';
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file); // fallback to original
                        return;
                    }
                    // Only use compressed version if it's actually smaller
                    if (blob.size >= file.size) {
                        resolve(file);
                        return;
                    }
                    const ext = outputMime === 'image/webp' ? 'webp' : 'jpg';
                    const compressedFile = new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, `.${ext}`),
                        { type: outputMime, lastModified: Date.now() }
                    );
                    resolve(compressedFile);
                },
                outputMime,
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file); // fallback
        };

        img.src = objectUrl;
    });
};

/**
 * Compresses a video file using MediaRecorder API (re-encode at lower bitrate)
 * Falls back to original if browser doesn't support re-encoding
 * @param {File} file - Video file to compress
 * @param {Object} options
 * @param {number} options.videoBitsPerSecond - Target video bitrate (default 1.2 Mbps)
 * @param {function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<File>} - Compressed video file
 */
export const compressVideo = (file, options = {}) => {
    const {
        videoBitsPerSecond = 1200000, // 1.2 Mbps — good quality + small size
        onProgress = null
    } = options;

    return new Promise((resolve) => {
        // Check if MediaRecorder can record video
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));

        if (!supportedMime) {
            // Browser doesn't support re-encoding, return original
            resolve(file);
            return;
        }

        // Skip small videos (< 5MB)
        if (file.size < 5 * 1024 * 1024) {
            resolve(file);
            return;
        }

        const video = document.createElement('video');
        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = () => {
            // Skip if video is already short and small
            if (video.duration < 10 && file.size < 10 * 1024 * 1024) {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
                return;
            }

            const canvas = document.createElement('canvas');
            // Scale to max 1280x720 for compression
            const maxW = 1280, maxH = 720;
            let w = video.videoWidth || 1280;
            let h = video.videoHeight || 720;
            if (w > maxW || h > maxH) {
                const ratio = Math.min(maxW / w, maxH / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;

            const ctx = canvas.getContext('2d');
            const stream = canvas.captureStream(30);

            // Add audio track from video if available
            let mediaRecorder;
            try {
                mediaRecorder = new MediaRecorder(stream, {
                    mimeType: supportedMime,
                    videoBitsPerSecond
                });
            } catch {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
                return;
            }

            const chunks = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                URL.revokeObjectURL(objectUrl);
                const blob = new Blob(chunks, { type: supportedMime });
                // Only use compressed if smaller
                if (blob.size >= file.size) {
                    resolve(file);
                    return;
                }
                const compressed = new File(
                    [blob],
                    file.name.replace(/\.[^.]+$/, '.webm'),
                    { type: supportedMime, lastModified: Date.now() }
                );
                resolve(compressed);
            };

            let startTime = null;
            const duration = video.duration * 1000;

            const drawFrame = (timestamp) => {
                if (startTime === null) startTime = timestamp;
                const elapsed = timestamp - startTime;

                if (elapsed >= duration || video.ended || video.paused) {
                    mediaRecorder.stop();
                    return;
                }

                ctx.drawImage(video, 0, 0, w, h);
                if (onProgress) onProgress(Math.min((elapsed / duration) * 100, 99));
                requestAnimationFrame(drawFrame);
            };

            mediaRecorder.start(100);
            video.play().then(() => {
                requestAnimationFrame(drawFrame);
            }).catch(() => {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            });
        };

        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file);
        };
    });
};

/**
 * Get human-readable file size string
 * @param {number} bytes
 * @returns {string}
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Get file type category
 * @param {File} file
 * @returns {'image'|'video'|'audio'|'document'}
 */
export const getFileCategory = (file) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
};

/**
 * Get video duration from file
 * @param {File} file
 * @returns {Promise<number>} duration in seconds
 */
export const getVideoDuration = (file) => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(file);
        video.src = url;
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(video.duration || 0);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(0);
        };
    });
};

/**
 * Format duration in seconds to MM:SS
 * @param {number} seconds
 * @returns {string}
 */
export const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};
