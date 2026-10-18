import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, usePathname } from '../../../utils/clientRouter';

const pathToView = {
    '/': 'social', '/chats': 'chats', '/social': 'social', '/reels': 'reels',
    '/podlive': 'podlive', '/smart-space': 'smart-space', '/settings': 'settings',
    '/ai-chat': 'ai-chat', '/saskat-ai': 'saskat-ai',
};
const viewToPath = Object.fromEntries(Object.entries(pathToView).map(([path, view]) => [view, path]));
const readSocialDeepLink = pathname => {
    const match = pathname.match(/^\/(posts|profile)\/([^/]+)\/?$/);
    if (match) return { type: match[1] === 'posts' ? 'post' : 'profile', id: decodeURIComponent(match[2]) };
    if (pathname === '/') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('post')) return { type: 'post', id: params.get('post') };
        if (params.get('profile')) return { type: 'profile', id: params.get('profile') };
    }
    return null;
};

export const useHomeNavigation = () => {
    const pathname = usePathname();
    const navigate = useNavigate();
    const currentView = pathToView[pathname] || 'social';
    const routeSyncPending = useRef(false);
    const [showReels, setShowReels] = useState(() => currentView === 'reels');
    const [showSocial, setShowSocial] = useState(() => currentView === 'social');
    const [showAiChat, setShowAiChat] = useState(() => currentView === 'ai-chat');
    const [showSmartSpace, setShowSmartSpace] = useState(() => currentView === 'smart-space');
    const [smartSpaceButtonEnabled, setSmartSpaceButtonEnabled] = useState(() => localStorage.getItem('smart_space_button_enabled') === '1');
    const [showPodlive, setShowPodlive] = useState(() => currentView === 'podlive');
    const [podliveInvite, setPodliveInvite] = useState(null);
    const [podliveLiveCount, setPodliveLiveCount] = useState(0);
    const [showSaskatAI, setShowSaskatAI] = useState(() => currentView === 'saskat-ai');
    const [socialDeepLink, setSocialDeepLink] = useState(() => readSocialDeepLink(pathname));
    const [showSettings, setShowSettings] = useState(() => currentView === 'settings');
    const [navPeekOpen, setNavPeekOpen] = useState(false);
    const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('app_nav_collapsed') === '1');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobileHomeTab, setMobileHomeTab] = useState('chats');

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const setCurrentView = useCallback((view) => {
        setShowReels(view === 'reels');
        setShowSocial(view === 'social');
        setShowPodlive(view === 'podlive');
        setShowSmartSpace(view === 'smart-space');
        setShowSettings(view === 'settings');
        setShowAiChat(view === 'ai-chat');
        setShowSaskatAI(view === 'saskat-ai');
    }, []);

    // A direct URL or browser back/forward restores the matching app section.
    useEffect(() => {
        routeSyncPending.current = true;
        const deepLink = readSocialDeepLink(pathname);
        if (deepLink) setSocialDeepLink(deepLink);
        else setSocialDeepLink(null);
        setCurrentView(pathToView[pathname] || 'social');
    }, [pathname, setCurrentView]);

    // Keep section changes in browser history so the back button works naturally.
    useEffect(() => {
        if (routeSyncPending.current) {
            routeSyncPending.current = false;
            return;
        }
        const view = showReels ? 'reels' : showSocial ? 'social' : showPodlive ? 'podlive' : showSmartSpace ? 'smart-space' : showSettings ? 'settings' : showAiChat ? 'ai-chat' : showSaskatAI ? 'saskat-ai' : 'chats';
        const target = viewToPath[view];
        if (target && target !== pathname) navigate(target);
        localStorage.setItem('activeView', view);
    }, [showReels, showSocial, showPodlive, showSmartSpace, showSettings, showAiChat, showSaskatAI, pathname, navigate]);

    const hideAppNavForFeature = useCallback(() => {
        setNavPeekOpen(false);
    }, []);

    const handleNotificationNavigate = useCallback((notification, setShowNotifications) => {
        if (setShowNotifications) setShowNotifications(false);
        setShowReels(false);
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

    const receivePodliveInvite = useCallback((invite) => {
        setPodliveInvite(invite);
        setShowPodlive(true);
    }, []);

    const updatePodliveLiveCount = useCallback((count) => {
        setPodliveLiveCount(Number(count || 0));
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
        navCollapsed, setNavCollapsed,
        isMobile, setIsMobile,
        mobileHomeTab, setMobileHomeTab,
        hideAppNavForFeature,
        handleNotificationNavigate,
    };
};
