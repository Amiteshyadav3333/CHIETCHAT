import React, { useState, useEffect, useRef } from 'react';
import {
    SpeakerWaveIcon,
    MusicalNoteIcon,
    ArrowUpTrayIcon,
    PlayIcon,
    StopIcon,
    TrashIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import {
    MESSAGE_SOUND_PRESETS,
    CALL_RINGTONE_PRESETS,
    getSoundSetting,
    setSoundPreset,
    saveCustomAudioFile,
    removeCustomAudio,
    previewSound,
    getStoredAudioData,
} from '../utils/customNotificationSounds';

export default function ChatSoundPreferences({ chatId, chatTitle = '' }) {
    const [msgConfig, setMsgConfig] = useState(() => getSoundSetting(chatId, 'msg'));
    const [callConfig, setCallConfig] = useState(() => getSoundSetting(chatId, 'call'));
    const [previewing, setPreviewing] = useState(null); // 'msg' | 'call' | null
    const [statusMsg, setStatusMsg] = useState(null);

    const activePreviewControllerRef = useRef(null);
    const msgFileInputRef = useRef(null);
    const callFileInputRef = useRef(null);

    useEffect(() => {
        setMsgConfig(getSoundSetting(chatId, 'msg'));
        setCallConfig(getSoundSetting(chatId, 'call'));
    }, [chatId]);

    useEffect(() => {
        const handleUpdate = (e) => {
            if (e.detail?.chatId === String(chatId)) {
                if (e.detail.type === 'msg') setMsgConfig(getSoundSetting(chatId, 'msg'));
                if (e.detail.type === 'call') setCallConfig(getSoundSetting(chatId, 'call'));
            }
        };
        window.addEventListener('cheetchat-sound-config-updated', handleUpdate);
        return () => {
            window.removeEventListener('cheetchat-sound-config-updated', handleUpdate);
            stopCurrentPreview();
        };
    }, [chatId]);

    const stopCurrentPreview = () => {
        if (activePreviewControllerRef.current) {
            try {
                activePreviewControllerRef.current.stop();
            } catch {
                // ignore
            }
            activePreviewControllerRef.current = null;
        }
        setPreviewing(null);
    };

    const handlePreview = async (type) => {
        if (previewing === type) {
            stopCurrentPreview();
            return;
        }
        stopCurrentPreview();

        const config = type === 'msg' ? msgConfig : callConfig;
        let customAudio = null;
        if (config.hasCustomAudio) {
            customAudio = await getStoredAudioData(chatId, type);
        }

        const controller = previewSound(type, config.presetId, customAudio);
        activePreviewControllerRef.current = controller;
        setPreviewing(type);

        // Auto-stop preview indicator after realistic timeout
        const autoStopDuration = type === 'msg' ? 1200 : 7000;
        setTimeout(() => {
            if (previewing === type || activePreviewControllerRef.current === controller) {
                stopCurrentPreview();
            }
        }, autoStopDuration);
    };

    const handlePresetChange = (type, presetId) => {
        stopCurrentPreview();
        setSoundPreset(chatId, type, presetId);
        const updated = getSoundSetting(chatId, type);
        if (type === 'msg') setMsgConfig(updated);
        else setCallConfig(updated);

        // Quick audio feedback of chosen preset
        previewSound(type, presetId, null);
    };

    const handleFileUpload = async (type, event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name)) {
            setStatusMsg({ type: 'error', text: 'Please select a valid audio file.' });
            return;
        }

        try {
            stopCurrentPreview();
            await saveCustomAudioFile(chatId, type, file);
            const updated = getSoundSetting(chatId, type);
            if (type === 'msg') setMsgConfig(updated);
            else setCallConfig(updated);

            setStatusMsg({
                type: 'success',
                text: `${type === 'msg' ? 'Message tone' : 'Call ringtone'} updated to "${file.name}"!`,
            });
            setTimeout(() => setStatusMsg(null), 3500);
        } catch {
            setStatusMsg({ type: 'error', text: 'Failed to upload audio file. Try a smaller file.' });
        } finally {
            if (event.target) event.target.value = '';
        }
    };

    const handleReset = async (type) => {
        stopCurrentPreview();
        await removeCustomAudio(chatId, type);
        const updated = getSoundSetting(chatId, type);
        if (type === 'msg') setMsgConfig(updated);
        else setCallConfig(updated);

        setStatusMsg({
            type: 'success',
            text: `Reset ${type === 'msg' ? 'message tone' : 'call ringtone'} to default.`,
        });
        setTimeout(() => setStatusMsg(null), 2500);
    };

    return (
        <div className="space-y-4 rounded-2xl border border-gray-800 bg-[#16222a]/90 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
                <div className="flex items-center gap-2">
                    <SpeakerWaveIcon className="h-5 w-5 text-[#00a884]" />
                    <h4 className="text-sm font-bold text-white">Custom Tones & Ringtones</h4>
                </div>
                {chatTitle && (
                    <span className="max-w-[130px] truncate text-[11px] font-medium text-gray-400">
                        {chatTitle}
                    </span>
                )}
            </div>

            <p className="text-[11px] leading-relaxed text-gray-400">
                Identify who is messaging or calling without looking at the screen by setting custom tones for this chat.
            </p>

            {statusMsg && (
                <div
                    className={`flex items-center gap-2 rounded-xl p-2.5 text-xs ${
                        statusMsg.type === 'success'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                            : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                    }`}
                >
                    {statusMsg.type === 'success' ? (
                        <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                        <ExclamationCircleIcon className="h-4 w-4 shrink-0 text-rose-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{statusMsg.text}</span>
                </div>
            )}

            {/* 1. MESSAGE NOTIFICATION TONE */}
            <div className="rounded-xl border border-gray-800 bg-[#1f2c34] p-3.5 transition">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <SpeakerWaveIcon className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-semibold text-white">Message Sound</span>
                    </div>
                    {msgConfig.hasCustomAudio ? (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            Custom Audio
                        </span>
                    ) : (
                        <span className="rounded-md bg-gray-700/50 px-2 py-0.5 text-[10px] text-gray-300">
                            Inbuilt Preset
                        </span>
                    )}
                </div>

                {msgConfig.hasCustomAudio && (
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-black/25 px-2.5 py-1.5 text-xs text-gray-300">
                        <span className="truncate pr-2 font-mono text-[11px] text-emerald-300">
                            🎵 {msgConfig.fileName || 'Custom message sound'}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleReset('msg')}
                            className="text-gray-400 hover:text-rose-400 p-1"
                            title="Remove custom audio and use preset"
                        >
                            <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <select
                        value={msgConfig.hasCustomAudio ? 'custom' : msgConfig.presetId}
                        onChange={(e) => {
                            if (e.target.value === 'upload') {
                                msgFileInputRef.current?.click();
                            } else if (e.target.value !== 'custom') {
                                handlePresetChange('msg', e.target.value);
                            }
                        }}
                        className="rounded-lg border border-gray-700 bg-[#111b21] px-2.5 py-2 text-xs text-white outline-none focus:border-[#00a884]"
                    >
                        {MESSAGE_SOUND_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} ({p.duration})
                            </option>
                        ))}
                        {msgConfig.hasCustomAudio && (
                            <option value="custom">★ Custom: {msgConfig.fileName || 'Uploaded'}</option>
                        )}
                        <option value="upload">📁 Choose audio from device/gallery…</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => handlePreview('msg')}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            previewing === 'msg'
                                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                                : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                        }`}
                        title="Test sound preview"
                    >
                        {previewing === 'msg' ? (
                            <>
                                <StopIcon className="h-3.5 w-3.5" />
                                <span>Stop</span>
                            </>
                        ) : (
                            <>
                                <PlayIcon className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Play</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => msgFileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-700 bg-[#111b21] px-2.5 py-2 text-xs font-medium text-gray-300 hover:border-gray-600 hover:text-white"
                        title="Upload sound file from gallery or storage"
                    >
                        <ArrowUpTrayIcon className="h-3.5 w-3.5 text-[#00a884]" />
                        <span className="hidden sm:inline">Upload</span>
                    </button>
                    <input
                        ref={msgFileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('msg', e)}
                    />
                </div>
            </div>

            {/* 2. CALL RINGTONE */}
            <div className="rounded-xl border border-gray-800 bg-[#1f2c34] p-3.5 transition">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <MusicalNoteIcon className="h-4 w-4 text-cyan-400" />
                        <span className="text-xs font-semibold text-white">Call Ringtone</span>
                    </div>
                    {callConfig.hasCustomAudio ? (
                        <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                            Custom Song
                        </span>
                    ) : (
                        <span className="rounded-md bg-gray-700/50 px-2 py-0.5 text-[10px] text-gray-300">
                            Inbuilt Ringtone
                        </span>
                    )}
                </div>

                {callConfig.hasCustomAudio && (
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-black/25 px-2.5 py-1.5 text-xs text-gray-300">
                        <span className="truncate pr-2 font-mono text-[11px] text-cyan-300">
                            🎶 {callConfig.fileName || 'Custom call ringtone'}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleReset('call')}
                            className="text-gray-400 hover:text-rose-400 p-1"
                            title="Remove custom song and use preset ringtone"
                        >
                            <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <select
                        value={callConfig.hasCustomAudio ? 'custom' : callConfig.presetId}
                        onChange={(e) => {
                            if (e.target.value === 'upload') {
                                callFileInputRef.current?.click();
                            } else if (e.target.value !== 'custom') {
                                handlePresetChange('call', e.target.value);
                            }
                        }}
                        className="rounded-lg border border-gray-700 bg-[#111b21] px-2.5 py-2 text-xs text-white outline-none focus:border-[#3390ec]"
                    >
                        {CALL_RINGTONE_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} ({p.tempo})
                            </option>
                        ))}
                        {callConfig.hasCustomAudio && (
                            <option value="custom">★ Custom: {callConfig.fileName || 'Uploaded Song'}</option>
                        )}
                        <option value="upload">📁 Choose song from device/gallery…</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => handlePreview('call')}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            previewing === 'call'
                                ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                                : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                        }`}
                        title="Test ringtone preview"
                    >
                        {previewing === 'call' ? (
                            <>
                                <StopIcon className="h-3.5 w-3.5" />
                                <span>Stop</span>
                            </>
                        ) : (
                            <>
                                <PlayIcon className="h-3.5 w-3.5 text-cyan-400" />
                                <span>Play</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => callFileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-700 bg-[#111b21] px-2.5 py-2 text-xs font-medium text-gray-300 hover:border-gray-600 hover:text-white"
                        title="Upload song or ringtone from gallery or storage"
                    >
                        <ArrowUpTrayIcon className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="hidden sm:inline">Upload</span>
                    </button>
                    <input
                        ref={callFileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('call', e)}
                    />
                </div>
            </div>
        </div>
    );
}
