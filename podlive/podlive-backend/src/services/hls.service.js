const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const prisma = new PrismaClient();

// Configure the resolutions and bitrates we want for HLS streaming
const resolutions = [
    { name: '1080p', size: '1920x1080', bitrate: '5000k' },
    { name: '720p', size: '1280x720', bitrate: '2500k' },
    { name: '480p', size: '854x480', bitrate: '1000k' },
    { name: '360p', size: '640x360', bitrate: '600k' }
];

const os = require('os');
exports.processHLS = async (sessionId, inputPath, baseUrl) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`[HLS Engine] Started HLS processing for session: ${sessionId}`);

            const outputDir = path.join(os.tmpdir(), `hls_${sessionId}`);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const masterPlaylistName = 'master.m3u8';
            const masterPlaylistPath = path.join(outputDir, masterPlaylistName);
            let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n';

            let command = ffmpeg(inputPath);
            let outputOptions = [];

            // Add audio stream copy (simplification: assume all sub-streams use 1 audio track)
            command.outputOptions([
                '-preset fast',
                '-g 48', // keyframe every 48 frames
                '-sc_threshold 0'
            ]);

            for (let i = 0; i < resolutions.length; i++) {
                const res = resolutions[i];
                const variantName = `${res.name}.m3u8`;
                const segmentName = `${res.name}_%03d.ts`;

                // Add mapping for this variant
                outputOptions.push(
                    '-map', '0:v:0',
                    '-map', '0:a:0', // assume audio exists
                    `-filter:v:${i}`, `scale=${res.size.split('x')[0]}:${res.size.split('x')[1]}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
                    `-b:v:${i}`, res.bitrate,
                    `-maxrate:v:${i}`, `${parseInt(res.bitrate) * 1.2}k`,
                    `-bufsize:v:${i}`, `${parseInt(res.bitrate) * 2}k`,
                    `-profile:v:${i}`, 'main',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ar', '44100' // default audio rate
                );

                // Add to master playlist manifest content dynamically
                const bandwidthInfo = parseInt(res.bitrate) * 1000;
                let resolutionStr = res.size;
                masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidthInfo},RESOLUTION=${resolutionStr}\n${variantName}\n`;
            }

            // Write Master M3U8 string to file immediately
            fs.writeFileSync(masterPlaylistPath, masterContent);

            // Using var_stream_map to configure output directories for multiple playlist generations
            let streamMap = '';
            for (let i = 0; i < resolutions.length; i++) {
                streamMap += `v:${i},a:${i} `;
            }
            outputOptions.push('-var_stream_map', streamMap.trim());
            outputOptions.push('-master_pl_name', 'master.m3u8');
            outputOptions.push('-f', 'hls');
            outputOptions.push('-hls_time', '10');
            outputOptions.push('-hls_list_size', '0');
            outputOptions.push('-hls_segment_filename', path.join(outputDir, '%v_%03d.ts'));

            const variantPlaylistPath = path.join(outputDir, '%v.m3u8');

            command
                .outputOptions(outputOptions)
                .output(variantPlaylistPath)
                .on('stderr', (stderrLine) => {
                    console.log(`[FFmpeg STDERR]: ${stderrLine}`);
                })
                .on('end', async () => {
                    console.log(`[HLS Engine] Finished HLS processing for session: ${sessionId}. Starting S3 upload...`);

                    try {
                        const s3Service = require('./s3.service');
                        const files = fs.readdirSync(outputDir);
                        const uploadPromises = files.map(file => {
                            const filePath = path.join(outputDir, file);
                            const s3Key = `hls_${sessionId}/${file}`;
                            let contentType = 'video/MP2T';
                            if (file.endsWith('.m3u8')) contentType = 'application/vnd.apple.mpegurl';
                            return s3Service.uploadFileToS3(filePath, s3Key, contentType);
                        });

                        await Promise.all(uploadPromises);
                        console.log(`[HLS Engine] Successfully uploaded all HLS files to S3 for session: ${sessionId}`);

                        const final_hls_url = `${process.env.S3_PUBLIC_URL}/hls_${sessionId}/master.m3u8`;

                        // Update database
                        await prisma.liveSession.update({
                            where: { id: sessionId },
                            data: {
                                is_processing: false,
                                recording_url: final_hls_url
                            }
                        });

                        // Clean up local directories and video
                        fs.rmSync(outputDir, { recursive: true, force: true });
                        try { fs.unlinkSync(inputPath); } catch (e) { }

                        resolve(final_hls_url);
                    } catch (s3Error) {
                        console.error('[HLS Engine] S3 Upload Error:', s3Error);

                        // Mark failed processing status
                        await prisma.liveSession.update({
                            where: { id: sessionId },
                            data: { is_processing: false }
                        });

                        reject(s3Error);
                    }
                })
                .on('error', async (err) => {
                    console.error('[HLS Engine] FFmpeg Error:', err.message);

                    // Mark failed processing status
                    await prisma.liveSession.update({
                        where: { id: sessionId },
                        data: { is_processing: false }
                    });

                    reject(err);
                })
                .run();

        } catch (error) {
            console.error("[HLS Engine] Error setup processing:", error);
            reject(error);
        }
    });
};
