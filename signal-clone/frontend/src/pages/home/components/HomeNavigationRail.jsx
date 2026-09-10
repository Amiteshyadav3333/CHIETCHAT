import React from 'react';
import AvatarZoom from '../../../components/AvatarZoom';

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
                ? "fixed inset-y-0 left-0 z-[80] shadow-2xl flex w-[68px] md:w-[78px] xl:w-[236px] flex-col border-r border-gray-800 bg-[#080808] px-2 md:px-3 py-4 md:py-5 shrink-0"
                : `hidden md:${!appNavHidden ? 'flex' : 'hidden'} md:relative w-[68px] md:w-[78px] xl:w-[236px] flex-col border-r border-gray-800 bg-[#080808] px-2 md:px-3 py-4 md:py-5 shrink-0`
            }>
                <div className="h-12 px-2 flex items-center">
                    <img src="/cheetchat-logo.png" alt="CHEETCHAT" className="h-9 w-9 rounded-xl object-cover" />
                    <span className="ml-2 hidden xl:block text-xl font-black tracking-tight">CHEETCHAT</span>
                </div>
                <nav className="mt-7 flex flex-col gap-1">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.label}
                                onClick={() => {
                                    item.action();
                                    setNavPeekOpen(false);
                                }}
                                className={`relative flex items-center justify-center xl:justify-start gap-4 rounded-xl px-3 py-3 text-left transition-colors ${item.active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
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
                        );
                    })}
                </nav>
                <div className="mt-auto flex items-center gap-3 rounded-xl px-2 py-3">
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
    return (
        <nav className="md:hidden grid grid-cols-4 border-t border-white/10 bg-[#111b21] px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1">
            {[
                { id: 'chats', label: 'Chats', icon: '◉', badge: totalUnreadMessages },
                { id: 'stories', label: 'Stories', icon: '◎' },
                { id: 'groups', label: 'Groups', icon: '👥' },
                { id: 'calls', label: 'Calls', icon: '☎' }
            ].map(tab => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setMobileHomeTab(tab.id); if (setShowArchive) setShowArchive(false); }}
                    className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition ${
                        mobileHomeTab === tab.id ? 'text-[#25d366]' : 'text-gray-400'
                    }`}
                >
                    <span className={`relative text-xl leading-5 ${mobileHomeTab === tab.id ? 'rounded-full bg-[#25d366]/15 px-4 py-1' : 'py-1'}`}>
                        {tab.icon}
                        {tab.badge > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[9px] font-black text-[#07150f]">
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
