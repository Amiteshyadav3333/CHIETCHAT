import React from 'react';
import AvatarZoom from '../../../components/AvatarZoom';
import { ChatBubbleLeftRightIcon, ClockIcon, PhoneIcon, UserGroupIcon } from '@heroicons/react/24/outline';

export const HomeNavigationRail = ({
    navPeekOpen,
    setNavPeekOpen,
    appNavHidden,
    navItems,
    user,
    mobileHomeTab,
    setMobileHomeTab,
    totalUnreadMessages,
    setShowArchive,
}) => {
    return (
        <>
            {navPeekOpen && (
                <div
                    onClick={() => setNavPeekOpen(false)}
                    className="fixed inset-0 z-[60] bg-black/40"
                />
            )}

            {/* WhatsApp-style side navigation rail */}
            <aside className={navPeekOpen
                ? "reddit-nav fixed inset-y-0 left-0 z-[80] shadow-2xl flex w-[72px] md:w-[78px] xl:w-[250px] flex-col border-r border-gray-800 px-2 md:px-3 py-4 md:py-5 shrink-0"
                : `reddit-nav relative z-[40] hidden md:${!appNavHidden ? 'flex' : 'hidden'} md:w-[78px] xl:w-[250px] flex-col border-r border-gray-800 px-2 md:px-3 py-4 md:py-5 shrink-0`
            }>
                <div className="h-12 px-2 flex items-center">
                    <img src="/cheetchat-logo.png" alt="CHEETCHAT" className="h-9 w-9 rounded-xl object-cover" />
                    <span className="reddit-brand ml-2 hidden xl:block text-xl font-black tracking-tight">CHEETCHAT</span>
                </div>
                <nav className="reddit-nav-items mt-5 flex flex-col gap-1">
                    {navItems.map((item, index) => {
                        const Icon = item.icon;
                        const tourKey = item.tourId || (
                            item.label === 'New' ? 'new-chat' :
                            item.label === 'Notify' ? 'notify' :
                            item.label === 'AI' ? 'ai' :
                            item.label.toLowerCase()
                        );
                        return <React.Fragment key={item.label}>
                            {(index === 1 || index === 5) && <div className="reddit-nav-heading hidden px-3 pb-1 pt-5 xl:block">{index === 1 ? 'EXPLORE' : 'YOUR ACCOUNT'}</div>}
                            <button
                                data-tour={tourKey}
                                onClick={() => {
                                    item.action();
                                    setNavPeekOpen(false);
                                }}
                                className={`reddit-nav-link relative flex items-center justify-center xl:justify-start gap-4 rounded-full px-3 py-3 text-left transition-colors ${item.active ? 'reddit-nav-link-active' : ''}`}
                                title={item.label}
                            >
                                <span className="relative">
                                    <Icon className="w-7 h-7" />
                                    {item.badge > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-center font-bold text-white">
                                            {item.badge > 9 ? '9+' : item.badge}
                                        </span>
                                    )}
                                    {item.live && (
                                        <span className="absolute -right-6 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[8px] font-black leading-none text-white shadow-[0_0_10px_rgba(220,38,38,0.75)]">
                                            LIVE
                                        </span>
                                    )}
                                </span>
                                <span className="hidden xl:inline text-sm font-semibold">{item.label}</span>
                            </button>
                        </React.Fragment>;
                    })}
                </nav>
                <div className="reddit-nav-profile mt-auto flex items-center gap-3 rounded-2xl px-2 py-3">
                    <AvatarZoom src={user?.avatar} name={user?.username} size="w-10 h-10" />
                    <div className="hidden xl:block min-w-0">
                        <p className="text-sm font-bold truncate">{user?.username}</p>
                        <p className="text-xs text-green-500">Online</p>
                    </div>
                </div>
            </aside>
        </>
    );
};

export const MobileBottomNavigation = ({
    mobileHomeTab,
    setMobileHomeTab,
    totalUnreadMessages,
    setShowArchive,
}) => {
    const tabs = [
        { id: 'chats', label: 'Chats', Icon: ChatBubbleLeftRightIcon, badge: totalUnreadMessages },
        { id: 'stories', label: 'Stories', Icon: ClockIcon },
        { id: 'groups', label: 'Groups', Icon: UserGroupIcon },
        { id: 'calls', label: 'Calls', Icon: PhoneIcon },
    ];
    return (
        <nav className="reddit-mobile-nav md:hidden grid grid-cols-4 border-t px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1">
            {tabs.map(({ Icon, ...tab }) => (
                <button
                    key={tab.id}
                    type="button"
                    data-tour-mobile={tab.id}
                    onClick={() => { setMobileHomeTab(tab.id); if (setShowArchive) setShowArchive(false); }}
                    className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition ${
                        mobileHomeTab === tab.id ? 'reddit-mobile-nav-active' : ''
                    }`}
                >
                    <span className="relative py-1">
                        <Icon className="h-5 w-5" />
                        {tab.badge > 0 && (
                            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff4500] px-1 text-[9px] font-black text-white">
                                {tab.badge > 99 ? '99+' : tab.badge}
                            </span>
                        )}
                    </span>
                    {tab.label}
                </button>
            ))}
        </nav>
    );
};
