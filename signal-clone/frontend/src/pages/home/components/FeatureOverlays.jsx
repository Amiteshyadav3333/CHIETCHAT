import React from 'react';
import axios from 'axios';

const Reels = React.lazy(() => import('../../Reels'));
const socialModulePromise = import('../../Social');
const Social = React.lazy(() => socialModulePromise);
const AiChat = React.lazy(() => import('../../../components/AiChat'));
const AiSmartSpace = React.lazy(() => import('../../../components/AiSmartSpace'));
const SaskatAI = React.lazy(() => import('../../SaskatAI/SaskatAI'));
const PodLiveView = React.lazy(() => import('../../PodLiveView'));
import PodLiveInviteBridge from '../../../features/podlive/PodLiveInviteBridge';
const SettingsModal = React.lazy(() => import('../../../components/SettingsModal'));
const NotificationPanel = React.lazy(() => import('../../../components/NotificationPanel'));

export const FeatureLoader = () => (
    <div className="flex h-full w-full items-center justify-center bg-[#111b21] text-sm font-semibold text-[#00a884]">
        Loading...
    </div>
);

export const FeatureOverlays = ({
    showReels,
    setShowReels,
    shareReelToChat,
    showSocial,
    setShowSocial,
    socialDeepLink,
    setSocialDeepLink,
    shareSocialPostToChat,
    openSocialDirectMessage,
    showSaskatAI,
    setShowSaskatAI,
    showSettings,
    setShowSettings,
    user,
    token,
    logout,
    updateUser,
    theme,
    wallpaper,
    setTheme,
    setWallpaper,
    setShowSmartSpace,
    smartSpaceButtonEnabled,
    setSmartSpaceButtonEnabled,
    showAiChat,
    setShowAiChat,
    chats,
    getOtherParticipant,
    startCallForChat,
    fetchChats,
    showSmartSpace,
    setActiveChat,
    showNotifications,
    setShowNotifications,
    notifications,
    handleMarkSingleRead,
    handleMarkAllRead,
    handleNotificationNavigate,
    handleBirthdayWish,
    incomingCall,
    showCallModal,
    showPodlive,
    setShowPodlive,
    podliveInvite,
    setPodliveInvite,
    receivePodliveInvite,
    updatePodliveLiveCount,
}) => {
    return (
        <>
            {/* Reels Overlay */}
            {showReels && (
                <div className="fixed inset-0 z-50 bg-black">
                    <React.Suspense fallback={<FeatureLoader />}>
                        <Reels
                            active={showReels && !incomingCall && !showCallModal}
                            onBack={() => setShowReels(false)} 
                            onShareToChat={shareReelToChat}
                        />
                    </React.Suspense>
                </div>
            )}

            {/* Social Overlay */}
            {showSocial && (
                <div className="fixed inset-0 z-50 bg-[#0b0f14]">
                    <React.Suspense fallback={<FeatureLoader />}>
                        <Social
                            active={showSocial && !incomingCall && !showCallModal}
                            onBack={() => { setShowSocial(false); setSocialDeepLink(null); }}
                            deepLink={socialDeepLink}
                            onDeepLinkConsumed={() => setSocialDeepLink(null)}
                            onShareToChat={shareSocialPostToChat}
                            onDirectMessage={openSocialDirectMessage}
                        />
                    </React.Suspense>
                </div>
            )}

            {/* Saskat AI Overlay */}
            {showSaskatAI && (
                <div className="fixed inset-0 z-50 bg-[#0a0e27]">
                    <React.Suspense fallback={<FeatureLoader />}>
                        <SaskatAI onClose={() => setShowSaskatAI(false)} />
                    </React.Suspense>
                </div>
            )}

            {/* PodLive Invite Bridge */}
            <PodLiveInviteBridge
                active={Boolean(token)}
                onInvite={receivePodliveInvite}
                onLiveStatus={updatePodliveLiveCount}
            />

            {/* PodLive Overlay */}
            {showPodlive && (
                <div className="fixed inset-0 z-50 bg-[#070b12]">
                    <React.Suspense fallback={<FeatureLoader />}>
                        <PodLiveView
                            active={showPodlive && !incomingCall && !showCallModal}
                            onBack={() => setShowPodlive(false)}
                            incomingInvite={podliveInvite}
                            onInviteConsumed={() => setPodliveInvite(null)}
                            token={token}
                        />
                    </React.Suspense>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && (
                <React.Suspense fallback={<FeatureLoader />}>
                    <SettingsModal
                        user={user}
                        token={token}
                        onClose={() => setShowSettings(false)}
                        onLogout={logout}
                        onUserUpdate={updateUser}
                        theme={theme}
                        wallpaper={wallpaper}
                        onThemeChange={setTheme}
                        onWallpaperChange={setWallpaper}
                        onOpenSmartSpace={() => { setShowSettings(false); setShowSmartSpace(true); }}
                        smartSpaceButtonEnabled={smartSpaceButtonEnabled}
                        onSmartSpaceButtonChange={(enabled) => {
                            setSmartSpaceButtonEnabled(enabled);
                            localStorage.setItem('smart_space_button_enabled', enabled ? '1' : '0');
                        }}
                    />
                </React.Suspense>
            )}

            {/* AI Chat Overlay */}
            <div className={`fixed inset-0 z-50 bg-[#0b141a] transition-opacity duration-200 ${showAiChat ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                {showAiChat && (
                    <React.Suspense fallback={<FeatureLoader />}>
                        <AiChat
                            onBack={() => setShowAiChat(false)}
                            onClose={() => setShowAiChat(false)}
                            onActionCall={async (contactName) => {
                                let targetChat = chats.find(c => {
                                    if (c.isGroup) {
                                        return c.name && c.name.toLowerCase().includes(contactName.toLowerCase());
                                    } else {
                                        const other = getOtherParticipant(c);
                                        return other && (
                                            other.username.toLowerCase().includes(contactName.toLowerCase()) ||
                                            (other.platform_id && other.platform_id.toLowerCase().includes(contactName.toLowerCase()))
                                        );
                                    }
                                });

                                if (targetChat) {
                                    setShowAiChat(false);
                                    startCallForChat(targetChat, 'video');
                                    return;
                                }

                                try {
                                    const res = await axios.post('/api/user/search', { query: contactName }, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    if (res.data && res.data.id) {
                                        const searchedUserObj = res.data;
                                        const createRes = await axios.post('/api/chats/create', {
                                            participants: [user.id, searchedUserObj.id],
                                            isGroup: false
                                        }, {
                                            headers: { Authorization: `Bearer ${token}` }
                                        });

                                        const updatedChats = await fetchChats();
                                        const newChat = updatedChats.find(chat => chat.id === createRes.data.id);
                                        if (newChat) {
                                            setShowAiChat(false);
                                            startCallForChat(newChat, 'video');
                                        } else {
                                            alert(`Could not start call with ${contactName}.`);
                                        }
                                    } else {
                                        alert(`Contact "${contactName}" not found.`);
                                    }
                                } catch (err) {
                                    console.error("AI trigger call search error:", err);
                                    alert(`Contact "${contactName}" not found.`);
                                }
                            }}
                        />
                    </React.Suspense>
                )}
            </div>

            {/* AI Smart Space Overlay */}
            <div className={`fixed inset-0 z-50 bg-[#07110f] transition-opacity duration-200 ${showSmartSpace ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                {showSmartSpace && (
                    <React.Suspense fallback={<FeatureLoader />}>
                        <AiSmartSpace
                            chats={chats}
                            token={token}
                            onClose={() => setShowSmartSpace(false)}
                            onOpenChat={(chat) => { setActiveChat(chat); setShowSmartSpace(false); }}
                        />
                    </React.Suspense>
                )}
            </div>

            {/* Notifications Panel */}
            {showNotifications && (
                <React.Suspense fallback={<FeatureLoader />}>
                    <NotificationPanel
                        notifications={notifications}
                        onClose={() => setShowNotifications(false)}
                        onMarkRead={handleMarkSingleRead}
                        onMarkAllRead={handleMarkAllRead}
                        onNavigate={handleNotificationNavigate}
                        onBirthdayWish={handleBirthdayWish}
                    />
                </React.Suspense>
            )}
        </>
    );
};
