// Custom Notification Sounds & Call Ringtones Engine for CHEETCHAT
// Supports built-in ~1s message sound presets, melodic call ringtone presets,
// and custom audio uploads stored safely in IndexedDB (avoiding localStorage 5MB quota).

export const MESSAGE_SOUND_PRESETS = [
    { id: 'default', name: 'App Default (Classic)', duration: '~0.25s' },
    { id: 'pop', name: 'Bubble Pop', duration: '~0.15s' },
    { id: 'chime', name: 'Crystal Chime', duration: '~0.6s' },
    { id: 'ping', name: 'Gentle Ping', duration: '~0.4s' },
    { id: 'tinkle', name: 'Starlight', duration: '~0.8s' },
    { id: 'blip', name: 'Digital Blip', duration: '~0.2s' },
];

export const CALL_RINGTONE_PRESETS = [
    { id: 'default', name: 'Classic Double Ring', tempo: 'Standard' },
    { id: 'marimba', name: 'Marimba Groove', tempo: 'Rhythmic' },
    { id: 'cyber', name: 'Cyber Pulse', tempo: 'Upbeat' },
    { id: 'zen', name: 'Zen Harmony', tempo: 'Calm' },
    { id: 'retro', name: 'Retro Phone', tempo: 'Vintage' },
];

// In-memory cache of custom audio data URLs for instantaneous playback
const audioMemoryCache = new Map();

const DB_NAME = 'CheetChatAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

function openAudioDB() {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            return reject(new Error('IndexedDB not supported'));
        }
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieve custom audio data URL for a given chat and type ('msg' or 'call')
 */
export async function getStoredAudioData(chatId, type) {
    if (!chatId) return null;
    const key = `${type}_${chatId}`;
    if (audioMemoryCache.has(key)) {
        return audioMemoryCache.get(key);
    }
    try {
        const db = await openAudioDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(key);
            getReq.onsuccess = () => {
                const data = getReq.result?.audioData || null;
                if (data) audioMemoryCache.set(key, data);
                resolve(data);
            };
            getReq.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Save custom audio file for a given chat and type ('msg' or 'call')
 */
export async function saveCustomAudioFile(chatId, type, file) {
    if (!chatId || !file) return null;
    const key = `${type}_${chatId}`;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const audioData = String(reader.result);
            audioMemoryCache.set(key, audioData);

            try {
                const db = await openAudioDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put({
                    key,
                    type,
                    chatId: String(chatId),
                    audioData,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    updatedAt: Date.now(),
                });
            } catch (err) {
                console.warn('Could not persist to IndexedDB, stored in memory cache only', err);
            }

            // Save metadata synchronously in localStorage
            setSoundMetadata(chatId, type, {
                hasCustomAudio: true,
                fileName: file.name,
                presetId: 'custom',
            });

            resolve({ success: true, fileName: file.name, audioData });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/**
 * Remove custom audio for a chat
 */
export async function removeCustomAudio(chatId, type) {
    if (!chatId) return;
    const key = `${type}_${chatId}`;
    audioMemoryCache.delete(key);

    try {
        const db = await openAudioDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
    } catch {
        // ignore
    }

    setSoundMetadata(chatId, type, {
        hasCustomAudio: false,
        fileName: '',
        presetId: 'default',
    });
}

/**
 * Set sound preset for a chat (e.g. 'pop', 'chime', 'marimba', etc.)
 */
export function setSoundPreset(chatId, type, presetId) {
    if (!chatId) return;
    const current = getSoundSetting(chatId, type);
    setSoundMetadata(chatId, type, {
        ...current,
        presetId: presetId || 'default',
    });
}

/**
 * Read current sound setting for a chat
 */
export function getSoundSetting(chatId, type) {
    if (!chatId) return { presetId: 'default', hasCustomAudio: false, fileName: '' };
    try {
        const raw = localStorage.getItem(`custom_sound_meta_${type}_${chatId}`);
        if (raw) return JSON.parse(raw);
    } catch {
        // ignore
    }
    return { presetId: 'default', hasCustomAudio: false, fileName: '' };
}

function setSoundMetadata(chatId, type, meta) {
    try {
        localStorage.setItem(`custom_sound_meta_${type}_${chatId}`, JSON.stringify(meta));
        window.dispatchEvent(new CustomEvent('cheetchat-sound-config-updated', {
            detail: { chatId, type, ...meta },
        }));
    } catch {
        // ignore
    }
}

// ---------------------------------------------------------------------------
// Synthesized Web Audio Tones (0 network overhead, instant & cross-browser)
// ---------------------------------------------------------------------------

function getAudioContext() {
    const AudioContextClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioContextClass) return null;
    try {
        return new AudioContextClass();
    } catch {
        return null;
    }
}

/**
 * Play a single Web Audio note with exponential decay
 */
function playNote(ctx, freq, startTime, duration, type = 'sine', peakGain = 0.15) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
}

/**
 * Synthesize built-in message notification tone (~0.15s to ~0.8s)
 */
export function synthesizeMessagePreset(presetId) {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t = ctx.currentTime;

    switch (presetId) {
        case 'pop': {
            // Bubble Pop: upward frequency glide ~0.15s
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(320, t);
            osc.frequency.exponentialRampToValueAtTime(960, t + 0.09);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.15);
            osc.onended = () => ctx.close().catch(() => {});
            break;
        }

        case 'chime': {
            // Crystal Chime: 3-note ascending triad (C6, E6, G6) ~0.6s
            playNote(ctx, 1046.5, t, 0.28, 'sine', 0.14);
            playNote(ctx, 1318.51, t + 0.08, 0.32, 'sine', 0.14);
            playNote(ctx, 1567.98, t + 0.16, 0.42, 'triangle', 0.18);
            setTimeout(() => ctx.close().catch(() => {}), 700);
            break;
        }

        case 'ping': {
            // Gentle Ping: warm marimba strike ~0.4s
            playNote(ctx, 880, t, 0.38, 'sine', 0.18);
            playNote(ctx, 1760, t, 0.15, 'triangle', 0.06);
            setTimeout(() => ctx.close().catch(() => {}), 500);
            break;
        }

        case 'tinkle': {
            // Starlight: sparkling 4-tone rapid arpeggio ~0.8s
            playNote(ctx, 1046.5, t, 0.22, 'sine', 0.1);
            playNote(ctx, 1318.5, t + 0.07, 0.24, 'sine', 0.11);
            playNote(ctx, 1568.0, t + 0.14, 0.26, 'sine', 0.12);
            playNote(ctx, 2093.0, t + 0.22, 0.5, 'triangle', 0.15);
            setTimeout(() => ctx.close().catch(() => {}), 900);
            break;
        }

        case 'blip': {
            // Digital Blip: snappy modern tech ping ~0.2s
            playNote(ctx, 1200, t, 0.08, 'triangle', 0.15);
            playNote(ctx, 1800, t + 0.04, 0.12, 'sine', 0.12);
            setTimeout(() => ctx.close().catch(() => {}), 300);
            break;
        }

        case 'default':
        default: {
            // Classic dual tone
            playNote(ctx, 740, t, 0.12, 'sine', 0.1);
            playNote(ctx, 880, t + 0.08, 0.16, 'sine', 0.12);
            setTimeout(() => ctx.close().catch(() => {}), 350);
            break;
        }
    }
}

/**
 * Synthesize looping call ringtone
 * Returns a controller: { stop: () => void }
 */
export function synthesizeCallPreset(presetId) {
    const ctx = getAudioContext();
    if (!ctx) return { stop: () => {} };

    let stopped = false;
    let timerId = null;

    const controller = {
        stop: () => {
            stopped = true;
            if (timerId) clearTimeout(timerId);
            ctx.close().catch(() => {});
        },
    };

    const ringLoop = async () => {
        if (stopped) return;
        try {
            if (ctx.state === 'suspended') await ctx.resume();
            const t = ctx.currentTime;

            switch (presetId) {
                case 'marimba': {
                    // Tropical Marimba melody loop
                    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99];
                    notes.forEach((freq, idx) => {
                        playNote(ctx, freq, t + idx * 0.15, 0.24, 'sine', 0.14);
                    });
                    timerId = setTimeout(ringLoop, 1500);
                    break;
                }

                case 'cyber': {
                    // Cyber Pulse synth arpeggio
                    const notes = [440, 554.37, 659.25, 880, 659.25, 880];
                    notes.forEach((freq, idx) => {
                        playNote(ctx, freq, t + idx * 0.11, 0.18, 'sawtooth', 0.07);
                    });
                    timerId = setTimeout(ringLoop, 1400);
                    break;
                }

                case 'zen': {
                    // Calming harmonic bells
                    playNote(ctx, 432, t, 0.5, 'sine', 0.15);
                    playNote(ctx, 540, t + 0.25, 0.5, 'sine', 0.13);
                    playNote(ctx, 648, t + 0.5, 0.7, 'triangle', 0.14);
                    timerId = setTimeout(ringLoop, 1900);
                    break;
                }

                case 'retro': {
                    // Vintage phone bell: double pulse of 440+480Hz
                    playNote(ctx, 440, t, 0.2, 'square', 0.06);
                    playNote(ctx, 480, t, 0.2, 'square', 0.06);
                    playNote(ctx, 440, t + 0.26, 0.2, 'square', 0.06);
                    playNote(ctx, 480, t + 0.26, 0.2, 'square', 0.06);
                    timerId = setTimeout(ringLoop, 1600);
                    break;
                }

                case 'default':
                default: {
                    // Standard alternating dual ring
                    playNote(ctx, 880, t, 0.22, 'sine', 0.16);
                    playNote(ctx, 1046.5, t + 0.26, 0.22, 'sine', 0.16);
                    timerId = setTimeout(ringLoop, 1400);
                    break;
                }
            }
        } catch {
            // Audio context failed or blocked
        }
    };

    ringLoop();
    return controller;
}

// ---------------------------------------------------------------------------
// High-Level Message & Call Audio Playback
// ---------------------------------------------------------------------------

/**
 * Play message notification sound for a chat (contact or group).
 * Respects:
 * 1. Muted chat status (if caller passes isMuted)
 * 2. Global message_sounds setting
 * 3. Per-chat custom audio uploaded file
 * 4. Per-chat custom sound preset
 * 5. Global custom_notification_audio or default sound
 */
export async function playMessageNotification(chatId, { isMuted = false } = {}) {
    if (isMuted) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('message_sounds') === '0') {
        return;
    }

    const setting = getSoundSetting(chatId, 'msg');

    // 1. Per-chat uploaded custom audio
    if (setting.hasCustomAudio) {
        const audioData = await getStoredAudioData(chatId, 'msg');
        if (audioData) {
            try {
                const audio = new Audio(audioData);
                await audio.play();
                return;
            } catch {
                // fall through to preset
            }
        }
    }

    // 2. Per-chat preset (if explicitly set and not 'default')
    if (setting.presetId && setting.presetId !== 'default' && setting.presetId !== 'custom') {
        synthesizeMessagePreset(setting.presetId);
        return;
    }

    // 3. Fallback to global custom audio if set in Settings
    const globalAudio = typeof localStorage !== 'undefined' ? localStorage.getItem('custom_notification_audio') : null;
    if (globalAudio) {
        try {
            const audio = new Audio(globalAudio);
            await audio.play();
            return;
        } catch {
            // fall through to default synth
        }
    }

    // 4. Default synth tone
    synthesizeMessagePreset('default');
}

/**
 * Start call ringtone for incoming call from a chat (contact or group).
 * Returns controller with .stop() method.
 */
export function startCallRingtone(chatId, { playSound = true } = {}) {
    if (!playSound || (typeof localStorage !== 'undefined' && localStorage.getItem('call_sounds') === '0')) {
        return { stop: () => {} };
    }

    const setting = getSoundSetting(chatId, 'call');
    let stopped = false;
    let activePlayer = null;

    const controller = {
        stop: () => {
            stopped = true;
            if (activePlayer) {
                if (typeof activePlayer.stop === 'function') {
                    activePlayer.stop();
                } else if (activePlayer instanceof HTMLAudioElement) {
                    activePlayer.pause();
                    activePlayer.currentTime = 0;
                }
            }
        },
    };

    // If custom audio file exists for this chat, play it looping
    if (setting.hasCustomAudio) {
        getStoredAudioData(chatId, 'call').then((audioData) => {
            if (stopped) return;
            if (audioData) {
                try {
                    const audio = new Audio(audioData);
                    audio.loop = true;
                    audio.play().catch(() => {
                        // Fallback to synth if audio play blocked
                        if (!stopped) activePlayer = synthesizeCallPreset(setting.presetId || 'default');
                    });
                    activePlayer = audio;
                    return;
                } catch {
                    // fall back
                }
            }
            if (!stopped) activePlayer = synthesizeCallPreset(setting.presetId || 'default');
        });
        return controller;
    }

    // Otherwise play synthesized call ringtone preset
    activePlayer = synthesizeCallPreset(setting.presetId || 'default');
    return controller;
}

/**
 * Preview sound helper for settings UI (preview message tone or preview call ringtone)
 */
export function previewSound(type, presetId, customAudioData = null) {
    if (customAudioData) {
        try {
            const audio = new Audio(customAudioData);
            audio.play().catch(() => {});
            return {
                stop: () => {
                    audio.pause();
                    audio.currentTime = 0;
                },
            };
        } catch {
            // fall back to preset
        }
    }

    if (type === 'call') {
        return synthesizeCallPreset(presetId || 'default');
    }

    synthesizeMessagePreset(presetId || 'default');
    return { stop: () => {} };
}
