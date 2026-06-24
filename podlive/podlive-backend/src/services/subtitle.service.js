const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const s3Service = require('./s3.service');

// Helper to format seconds to VTT timestamp HH:MM:SS.mmm
function formatVttTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

// Generates Mock Subtitle for local testing
function generateMockVTT(language) {
    let vtt = 'WEBVTT\n\n';

    const messages = {
        en: [
            "Welcome to this podcast stream.",
            "Today we are discussing some very interesting topics.",
            "I hope you all are having a great time listening.",
            "Let's dive right into our first segment.",
            "This technology is going to change the world.",
            "Thank you everyone for tuning in today!"
        ],
        hi: [
            "Is podcast stream mein aapka swagat hai.",
            "Aaj hum kuch bahut hi dilchasp vishayon par charcha kar rahe hain.",
            "Mujhe umeed hai ki aap sabhi ko sunne mein maza aa raha hoga.",
            "To chaliye, seedhe apne pehle segment ki taraf badhte hain.",
            "Ye technique is duniya ko badalne wali hai.",
            "Aaj jude rehne ke liye aap sabhi ka dhanyawad!"
        ],
        es: [
            "Bienvenido a esta transmisión de podcast.",
            "Hoy estamos discutiendo algunos temas muy interesantes.",
            "Espero que todos la estén pasando genial escuchando.",
            "Vamos a sumergirnos directamente en nuestro primer segmento.",
            "Esta tecnología va a cambiar el mundo.",
            "¡Gracias a todos por sintonizar hoy!"
        ]
    };

    const lines = messages[language] || messages.en;

    for (let i = 0; i < lines.length; i++) {
        const startSec = i * 5;
        const endSec = (i + 1) * 5;
        vtt += `${formatVttTime(startSec)} --> ${formatVttTime(endSec)}\n${lines[i]}\n\n`;
    }

    return vtt;
}

exports.processSubtitles = async (sessionId, videoPath, baseUrl) => {
    try {
        console.log(`[AI Engine] Started Subtitle generation for session: ${sessionId}`);

        // In a production app, we would:
        // 1. Run 'ffmpeg' on videoPath to extract audio to .mp3
        // 2. Call OpenAI Whisper API or Deepgram to transcribe to English (or auto-detect)
        // 3. Call OpenAI GPT/Translator API to translate to Hindi and Spanish
        // 4. Save results to .vtt files

        // Simulating processing time (AI Transcription delay)
        await new Promise(resolve => setTimeout(resolve, 3000));

        const languages = [
            { code: 'en', label: 'English' },
            { code: 'hi', label: 'Hindi' },
            { code: 'es', label: 'Spanish' }
        ];

        for (const lang of languages) {
            const vttContent = generateMockVTT(lang.code);
            const fileName = `subtitle-${sessionId}-${lang.code}-${crypto.randomBytes(4).toString('hex')}.vtt`;
            const s3Key = `subtitles/${fileName}`;

            try {
                // Upload directly to S3 from buffer
                const vtt_url = await s3Service.uploadBufferToS3(Buffer.from(vttContent, 'utf-8'), s3Key, 'text/vtt');

                await prisma.subtitle.create({
                    data: {
                        session_id: sessionId,
                        language: lang.code,
                        label: lang.label,
                        vtt_url: vtt_url
                    }
                });
                console.log(`[AI Engine] Generated ${lang.label} subtitle for ${sessionId}`);
            } catch (subErr) {
                console.warn(`[AI Engine] Skipping ${lang.label} subtitle (S3 failed): ${subErr.message}`);
            }
        }
        console.log(`[AI Engine] Finished all subtitles for session: ${sessionId}`);

    } catch (error) {
        console.error("[AI Engine] Error processing subtitles:", error);
    }
};
