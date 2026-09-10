import { useState, useEffect, useCallback } from 'react';

export const useHomeNavigation = () => {
    const [showReels, setShowReels] = useState(false);
    const [showSocial, setShowSocial] = useState(true);
    const [showAiChat, setShowAiChat] = useState(false);
    const [showSmartSpace, setShowSmartSpace] = useState(false);
    const [smartSpaceButtonEnabled, setSmartSpaceButtonEnabled] = useState(() => localStorage.getItem('smart_space_button_enabled') === '1');
    const [showPodlive, setShowPodlive] = useState(false);
    const [podliveInvite, setPodliveInvite] = useState(null);
    const [podliveLiveCount, setPodliveLiveCount] = useState(0);
    const [showSaskatAI, setShowSaskatAI] = useState(false);
    const [socialDeepLink, setSocialDeepLink] = useState(null); // { type: 'post'|'profile', id }
    const [showSettings, setShowSettings] = useState(false);
    const [navPeekOpen, setNavPeekOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobileHomeTab, setMobileHomeTab] = useState('chats');

    const updatePodliveLiveCount = useCallback((count) => {
        setPodliveLiveCount(Math.max(0, Number(count) || 0));
    }, []);

    const receivePodliveInvite = useCallback((invite) => {
        setPodliveInvite(invite);
        setShowPodlive(true);
    }, []);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).has('podlive')) {
            setShowPodlive(true);
        }
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        localStorage.removeItem('activeChatId');
        localStorage.setItem('activeView', 'social');
    }, []);

    // Persist active view for refresh survival
    useEffect(() => {
        const view = showReels ? 'reels' : showSocial ? 'social' : showPodlive ? 'podlive' : showSmartSpace ? 'smart-space' : showSettings ? 'settings' : 'chats';
        localStorage.setItem('activeView', view);
    }, [showReels, showSocial, showPodlive, showSmartSpace, showSettings]);

    const hideAppNavForFeature = useCallback(() => {
        setNavPeekOpen(false);
    }, []);

    const handleNotificationNavigate = useCallback((notification, setShowNotifications) => {
        if (setShowNotifications) setShowNotifications(false);
        setShowReels(false);
        setShowPodlive(false);
        const { type, targetId } = notification;

        if (['like', 'comment', 'comment_reply', 'retweet', 'share'].includes(type)) {
            setSocialDeepLink({ type: 'post', id: targetId });
            setShowSocial(true);
        } else if (type === 'follow') {
            setSocialDeepLink({ type: 'profile', id: notification.sender?.id || targetId });
            setShowSocial(true);
        } else if (type === 'channel_request') {
            setSocialDeepLink({ type: 'channel', id: targetId });
            setShowSocial(true);
        } else {
            setShowSocial(true);
        }
    }, []);

    return {
        showReels, setShowReels,
        showSocial, setShowSocial,
        showAiChat, setShowAiChat,
        showSmartSpace, setShowSmartSpace,
        smartSpaceButtonEnabled, setSmartSpaceButtonEnabled,
        showPodlive, setShowPodlive,
        podliveInvite, setPodliveInvite,
        podliveLiveCount, updatePodliveLiveCount,
        receivePodliveInvite,
        showSaskatAI, setShowSaskatAI,
        socialDeepLink, setSocialDeepLink,
        showSettings, setShowSettings,
        navPeekOpen, setNavPeekOpen,
        isMobile, setIsMobile,
        mobileHomeTab, setMobileHomeTab,
        hideAppNavForFeature,
        handleNotificationNavigate,
    };
};
