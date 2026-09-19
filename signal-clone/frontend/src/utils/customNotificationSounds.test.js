// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
    MESSAGE_SOUND_PRESETS,
    CALL_RINGTONE_PRESETS,
    getSoundSetting,
    setSoundPreset,
    playMessageNotification,
    startCallRingtone,
    removeCustomAudio,
} from './customNotificationSounds';

let storageMap;

beforeEach(() => {
    storageMap = new Map();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
            setItem: (key, val) => storageMap.set(key, String(val)),
            removeItem: (key) => storageMap.delete(key),
            clear: () => storageMap.clear(),
            get length() { return storageMap.size; },
        },
    });
    vi.clearAllMocks();
});

describe('customNotificationSounds', () => {
    it('exposes built-in message presets and call ringtone presets', () => {
        expect(MESSAGE_SOUND_PRESETS.length).toBeGreaterThanOrEqual(5);
        expect(CALL_RINGTONE_PRESETS.length).toBeGreaterThanOrEqual(5);
        expect(MESSAGE_SOUND_PRESETS.some(p => p.id === 'pop')).toBe(true);
        expect(MESSAGE_SOUND_PRESETS.some(p => p.id === 'chime')).toBe(true);
        expect(CALL_RINGTONE_PRESETS.some(p => p.id === 'marimba')).toBe(true);
    });

    it('returns default config when no custom settings exist for a chat', () => {
        const msgConfig = getSoundSetting('chat_101', 'msg');
        expect(msgConfig.presetId).toBe('default');
        expect(msgConfig.hasCustomAudio).toBe(false);
        expect(msgConfig.fileName).toBe('');

        const callConfig = getSoundSetting('chat_101', 'call');
        expect(callConfig.presetId).toBe('default');
        expect(callConfig.hasCustomAudio).toBe(false);
    });

    it('saves and reads sound preset per chat', () => {
        setSoundPreset('chat_user_1', 'msg', 'chime');
        setSoundPreset('chat_user_1', 'call', 'marimba');

        const msgConfig = getSoundSetting('chat_user_1', 'msg');
        expect(msgConfig.presetId).toBe('chime');

        const callConfig = getSoundSetting('chat_user_1', 'call');
        expect(callConfig.presetId).toBe('marimba');

        // Other chats remain independent
        const otherMsgConfig = getSoundSetting('chat_user_2', 'msg');
        expect(otherMsgConfig.presetId).toBe('default');
    });

    it('does not play sound when chat is muted or global message_sounds is 0', async () => {
        window.localStorage.setItem('message_sounds', '0');
        await expect(playMessageNotification('chat_101', { isMuted: false })).resolves.toBeUndefined();

        window.localStorage.setItem('message_sounds', '1');
        await expect(playMessageNotification('chat_101', { isMuted: true })).resolves.toBeUndefined();
    });

    it('returns a callable controller when starting call ringtone', () => {
        const controller = startCallRingtone('chat_group_99', { playSound: true });
        expect(controller).toBeDefined();
        expect(typeof controller.stop).toBe('function');
        expect(() => controller.stop()).not.toThrow();
    });

    it('resets custom audio and reverts to default preset', async () => {
        setSoundPreset('chat_reset_test', 'msg', 'pop');
        await removeCustomAudio('chat_reset_test', 'msg');

        const setting = getSoundSetting('chat_reset_test', 'msg');
        expect(setting.presetId).toBe('default');
        expect(setting.hasCustomAudio).toBe(false);
    });

    it('supports global sound settings and presets', () => {
        const { getGlobalSoundSetting, setGlobalSoundPreset } = require('./customNotificationSounds');
        const initial = getGlobalSoundSetting('msg');
        expect(initial.presetId).toBe('default');

        setGlobalSoundPreset('msg', 'chime');
        const updated = getGlobalSoundSetting('msg');
        expect(updated.presetId).toBe('chime');

        setGlobalSoundPreset('call', 'zen');
        const callUpdated = getGlobalSoundSetting('call');
        expect(callUpdated.presetId).toBe('zen');
    });
});
