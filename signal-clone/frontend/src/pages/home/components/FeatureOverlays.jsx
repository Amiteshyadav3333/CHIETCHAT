import React from 'react';
import axios from 'axios';

const Reels = React.lazy(() => import('../../Reels'));
const socialModulePromise = import('../../Social');
const Social = React.lazy(() => socialModulePromise);
const AiChat = React.lazy(() => import('../../../components/AiChat'));
const AiSmartSpace = React.lazy(() => import('../../../components/AiSmartSpace'));
const SaskatAI = React.lazy(() => import('../../SaskatAI/SaskatAI'));
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
