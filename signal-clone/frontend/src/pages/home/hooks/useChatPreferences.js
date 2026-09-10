import { useState, useEffect, useCallback } from 'react';

export const useChatPreferences = (user) => {
    const [archivedChats, setArchivedChats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('archived_chats') || '[]'); } catch { return []; }
    });
    const [mutedChats, setMutedChats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('muted_chats') || '[]'); } catch { return []; }
    });
    const [pinnedChats, setPinnedChats] = useState(() => {
        try { return JSON.parse(localStorage.getItem('pinned_chats') || '[]'); } catch { return []; }
    });
    const [nicknames, setNicknames] = useState(() => {
        try { return JSON.parse(localStorage.getItem('chat_nicknames') || '{}'); } catch { return {}; }
    });
    const [showArchive, setShowArchive] = useState(false);
    const [editNicknameChat, setEditNicknameChat] = useState(null);
    const [nicknameInput, setNicknameInput] = useState('');
    const [showTranslateEnabled, setShowTranslateEnabled] = useState(() => localStorage.getItem('translate_btn_enabled') !== 'false');
    const [theme, setTheme] = useState(() => localStorage.getItem('chat_theme') || 'dark');
    const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('chat_wallpaper') || 'white');

    const toggleArchive = useCallback((chatId) => {
        setArchivedChats(prev => {
            const next = prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId];
            localStorage.setItem('archived_chats', JSON.stringify(next));
            return next;
        });
    }, []);

    const toggleMute = useCallback((chatId) => {
        setMutedChats(prev => {
            const next = prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId];
            localStorage.setItem('muted_chats', JSON.stringify(next));
            return next;
        });
    }, []);

    const togglePinChat = useCallback((chatId) => {
        setPinnedChats(prev => {
            const next = prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId];
            localStorage.setItem('pinned_chats', JSON.stringify(next));
            return next;
        });
    }, []);

    const saveNickname = useCallback((chatId, name) => {
        setNicknames(prev => {
            const next = { ...prev, [chatId]: name };
            localStorage.setItem('chat_nicknames', JSON.stringify(next));
            return next;
        });
    }, []);

    const getChatDisplayName = useCallback((chat) => nicknames[chat.id] || chat.name, [nicknames]);

    useEffect(() => { localStorage.setItem('chat_theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('chat_wallpaper', wallpaper); }, [wallpaper]);

    useEffect(() => {
        const saved = user?.uiPreferences;
        if (!saved) return;
        if (saved.theme) setTheme(saved.theme);
        if (saved.wallpaper) setWallpaper(saved.wallpaper);
        const storageMap = {
            fontSize: 'chat_font_size', customFont: 'chat_custom_font', bubbleColor: 'chat_bubble_color',
            animatedTheme: 'animated_theme', snapModeDefault: 'snap_mode_default', messageSounds: 'message_sounds',
            callSounds: 'call_sounds', mediaAutoDownload: 'media_auto_download', dataSaver: 'data_saver',
            hdMedia: 'hd_media', screenshotAlerts: 'screenshot_alerts', spamDetection: 'spam_detection',
            incognitoKeyboard: 'incognito_keyboard', reelsDefaultFeed: 'reels_default_feed',
            reelsInterests: 'reels_interests',
            reelsAutoplay: 'reels_autoplay', reelsMuted: 'reels_muted', reelsDataSaver: 'reels_data_saver',
            socialDefaultFeed: 'social_default_feed', socialAutoplayVideos: 'social_autoplay_videos',
            socialMutedVideos: 'social_muted_videos', podliveAllowCamera: 'podlive_allow_camera',
            podliveAllowMicrophone: 'podlive_allow_microphone', podliveAutoplay: 'podlive_autoplay'
        };
        Object.entries(storageMap).forEach(([key, storageKey]) => {
            if (saved[key] !== undefined) localStorage.setItem(storageKey, typeof saved[key] === 'boolean' ? (saved[key] ? '1' : '0') : String(saved[key]));
        });
        window.dispatchEvent(new Event('cheetchat-colour-updated'));
    }, [user?.uiPreferences]);

    return {
        archivedChats, setArchivedChats,
        mutedChats, setMutedChats,
        pinnedChats, setPinnedChats,
        nicknames, setNicknames,
        showArchive, setShowArchive,
        editNicknameChat, setEditNicknameChat,
        nicknameInput, setNicknameInput,
        showTranslateEnabled, setShowTranslateEnabled,
        theme, setTheme,
        wallpaper, setWallpaper,
        toggleArchive,
        toggleMute,
        togglePinChat,
        saveNickname,
        getChatDisplayName,
    };
};
