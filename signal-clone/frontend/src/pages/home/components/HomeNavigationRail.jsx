import React from 'react';
import AvatarZoom from '../../../components/AvatarZoom';
import { ChatBubbleLeftRightIcon, ClockIcon, PhoneIcon, UserGroupIcon, Bars3Icon, PlusIcon, BellIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { GlobalSearchBar } from './GlobalSearchBar';

export const AppTopBar = ({ user, token, chats, onMenu, onCreate, onNotifications, onProfile, onSelectSearchResult, onMessageUser, unreadCount }) => (
    <header className="reddit-topbar relative z-[55] flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
        <button type="button" onClick={onMenu} className="reddit-topbar-icon rounded-full p-2.5" aria-label="Toggle navigation"><Bars3Icon className="h-5 w-5" /></button>
        <button type="button" onClick={onMenu} className="flex shrink-0 items-center gap-2" aria-label="Open navigation">
            <img src="/ducor-mark.svg" alt="" className="h-8 w-8 rounded-xl object-cover" />
            <span className="reddit-brand hidden text-lg font-black tracking-tight sm:inline">Ducor</span>
        </button>
        <GlobalSearchBar token={token} chats={chats} onSelectResult={onSelectSearchResult} onMessageUser={onMessageUser} />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <button type="button" onClick={onCreate} className="reddit-topbar-action flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold"><PlusIcon className="h-5 w-5" /><span className="hidden lg:inline">Publish</span></button>
            <button type="button" onClick={onNotifications} className="reddit-topbar-icon relative rounded-full p-2.5" aria-label="Notifications"><BellIcon className="h-5 w-5" />{unreadCount > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#ff6533] ring-2 ring-[#11171b]" />}</button>
            <button type="button" onClick={onProfile} className="hidden items-center gap-2 rounded-full p-1.5 sm:flex" aria-label={`Open settings for ${user?.username || 'user'}`}><AvatarZoom src={user?.avatar} name={user?.username} size="w-8 h-8" /><ChevronDownIcon className="h-4 w-4 text-gray-400" /></button>
        </div>
    </header>
);

export const HomeNavigationRail = ({
    navPeekOpen,
    setNavPeekOpen,
    navItems,
    user,
    navCollapsed = false,
}) => {
    return (
        <>
            {navPeekOpen && (
                <div
                    onClick={() => setNavPeekOpen(false)}
                    className="fixed inset-x-0 bottom-0 top-16 z-[60] bg-black/55 backdrop-blur-[2px]"
                />
            )}

            {/* WhatsApp-style side navigation rail */}
            <aside className={navPeekOpen
                ? "reddit-nav fixed inset-y-16 left-0 z-[80] flex w-[min(290px,86vw)] flex-col border-r border-gray-800 px-3 py-4 shadow-2xl"
                : `reddit-nav relative z-[40] hidden md:flex ${navCollapsed ? 'w-[76px]' : 'w-[220px] xl:w-[250px]'} shrink-0 flex-col border-r px-2 py-4 transition-[width] duration-200`
            }>
                <div className={`h-10 px-2 flex items-center ${navCollapsed && !navPeekOpen ? 'justify-center' : ''}`}>
                    <img src="/ducor-mark.svg" alt="Ducor" className="h-9 w-9 rounded-xl object-cover" />
                    <span className={`reddit-brand ml-2 text-xl font-black tracking-tight ${navCollapsed && !navPeekOpen ? 'hidden' : 'inline'}`}>Ducor</span>
                </div>
                <nav className="reddit-nav-items mt-5 flex flex-col gap-1 overflow-y-auto">
                    {navItems.map((item, index) => {
                        const Icon = item.icon;
                        const tourKey = item.tourId || (
                            item.label === 'New' ? 'new-chat' :
                            item.label === 'Notify' ? 'notify' :
                            item.label === 'AI' ? 'ai' :
                            item.label.toLowerCase()
                        );
                        return <React.Fragment key={item.label}>
                            {(index === 1 || index === 5) && <div className={`reddit-nav-heading px-3 pb-1 pt-5 ${navCollapsed && !navPeekOpen ? 'hidden' : ''}`}>{index === 1 ? 'DISCOVER' : 'YOUR SPACE'}</div>}
                            <button
                                data-tour={tourKey}
                                onClick={() => {
                                    item.action();
                                    setNavPeekOpen(false);
                                }}
                                className={`reddit-nav-link relative flex items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors ${navCollapsed && !navPeekOpen ? 'justify-center px-2' : ''} ${item.active ? 'reddit-nav-link-active' : ''}`}
                                title={item.label}
                            >
                                <span className="relative">
                                    <Icon className="h-6 w-6 shrink-0" />
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
                                <span className={`${navCollapsed && !navPeekOpen ? 'hidden' : ''} text-sm font-semibold`}>{item.label}</span>
                            </button>
                        </React.Fragment>;
                    })}
                </nav>
                <div className={`reddit-nav-profile mt-auto flex items-center gap-3 rounded-2xl px-2 py-3 ${navCollapsed && !navPeekOpen ? 'justify-center' : ''}`}>
                    <AvatarZoom src={user?.avatar} name={user?.username} size="w-10 h-10" />
                    <div className={`${navCollapsed && !navPeekOpen ? 'hidden' : ''} min-w-0`}>
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
