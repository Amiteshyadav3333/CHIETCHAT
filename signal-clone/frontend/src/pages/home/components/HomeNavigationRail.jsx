import React from 'react';
import AvatarZoom from '../../../components/AvatarZoom';
import { ChatBubbleLeftRightIcon, ClockIcon, PhoneIcon, UserGroupIcon, PlusIcon, BellIcon, ChevronDownIcon, UserCircleIcon, PencilSquareIcon, DocumentTextIcon, CurrencyRupeeIcon, SparklesIcon, ComputerDesktopIcon, Cog6ToothIcon, XMarkIcon, PlayIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import { GlobalSearchBar } from './GlobalSearchBar';

const accountActions = [
    ['profile', 'View profile', UserCircleIcon], ['avatar', 'Edit avatar', PencilSquareIcon],
    ['drafts', 'Drafts', DocumentTextIcon], ['earn', 'Earn', CurrencyRupeeIcon],
    ['premium', 'Premium', SparklesIcon], ['display', 'Display mode', ComputerDesktopIcon],
    ['settings', 'App settings', Cog6ToothIcon],
];

export const AppTopBar = ({ user, token, chats, onMenu, onCreate, onNotifications, onProfile, onChat, onReels, onPodlive, onAI, onSelectSearchResult, onMessageUser, unreadCount }) => {
    const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
    const [draftsOpen, setDraftsOpen] = React.useState(false);
    const [draftText, setDraftText] = React.useState('');
    const [drafts, setDrafts] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('ducor_social_drafts') || '[]'); } catch { return []; }
    });
    const saveDrafts = next => { setDrafts(next); localStorage.setItem('ducor_social_drafts', JSON.stringify(next)); };
    return (
    <header className="reddit-topbar relative z-[55] flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
        <button type="button" onClick={onMenu} className="reddit-topbar-icon rounded-xl p-1.5" aria-label="Open app functions" title="Open app functions">
            <img src="/lion-logo.png" alt="Ducor app functions" className="h-9 w-9 rounded-xl object-cover" />
        </button>
        <GlobalSearchBar token={token} chats={chats} onSelectResult={onSelectSearchResult} onMessageUser={onMessageUser} />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <button type="button" onClick={onCreate} className="reddit-topbar-action flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold"><PlusIcon className="h-5 w-5" /><span className="hidden lg:inline">Publish</span></button>
            <button type="button" onClick={onChat} className="reddit-topbar-icon flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-semibold" aria-label="Open chats" title="Open chats"><ChatBubbleLeftRightIcon className="h-5 w-5" /><span className="hidden 2xl:inline">Chat</span></button>
            <button type="button" onClick={onReels} className="reddit-topbar-icon flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-semibold" aria-label="Open Reels" title="Reels"><PlayIcon className="h-5 w-5" /><span className="hidden 2xl:inline">Reels</span></button>
            <button type="button" onClick={onPodlive} className="reddit-topbar-icon flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-semibold" aria-label="Open PodLive" title="PodLive"><MicrophoneIcon className="h-5 w-5" /><span className="hidden 2xl:inline">PodLive</span></button>
            <button type="button" onClick={onAI} className="reddit-topbar-icon flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-semibold" aria-label="Open AI" title="AI"><SparklesIcon className="h-5 w-5" /><span className="hidden 2xl:inline">AI</span></button>
            <button type="button" onClick={onNotifications} className="reddit-topbar-icon relative rounded-full p-2.5" aria-label="Notifications"><BellIcon className="h-5 w-5" />{unreadCount > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#ff6533] ring-2 ring-[#11171b]" />}</button>
            <div className="relative">
                <button type="button" onClick={() => setAccountMenuOpen(value => !value)} className="flex items-center gap-2 rounded-full p-1.5 hover:bg-white/10" aria-label={`Open user menu for ${user?.username || 'user'}`} aria-expanded={accountMenuOpen}>
                    <AvatarZoom src={user?.avatar} name={user?.username} size="w-8 h-8" />
                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                </button>
                {accountMenuOpen && <>
                    <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close user menu" onClick={() => setAccountMenuOpen(false)} />
                    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#111b23] p-2 shadow-2xl">
                        <div className="mb-1 flex items-center gap-3 border-b border-white/10 px-3 py-3">
                            <AvatarZoom src={user?.avatar} name={user?.username} size="w-10 h-10" />
                            <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user?.username || 'Your account'}</p><p className="text-xs text-gray-400">Account and app</p></div>
                            <button type="button" className="ml-auto rounded-full p-1 text-gray-400 hover:bg-white/10" onClick={() => setAccountMenuOpen(false)} aria-label="Close menu"><XMarkIcon className="h-4 w-4" /></button>
                        </div>
                        {accountActions.map(([action, label, Icon]) => <button key={action} type="button" onClick={() => { setAccountMenuOpen(false); if (action === 'drafts') setDraftsOpen(true); else onProfile?.(action); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-200 hover:bg-white/[.07] hover:text-white"><Icon className="h-5 w-5 text-gray-400" />{label}</button>)}
                    </div>
                </>}
            </div>
        </div>
        {draftsOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setDraftsOpen(false); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="account-drafts-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#111b23] shadow-2xl">
                <header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 id="account-drafts-title" className="text-lg font-bold text-white">Drafts</h2><p className="text-xs text-gray-400">Saved on this device</p></div><button type="button" onClick={() => setDraftsOpen(false)} className="rounded-full p-2 text-gray-400 hover:bg-white/10" aria-label="Close drafts"><XMarkIcon className="h-5 w-5" /></button></header>
                <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
                    <textarea value={draftText} onChange={event => setDraftText(event.target.value)} rows={3} maxLength={5000} placeholder="Write a post draft…" className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#ff6533]" />
                    <div className="flex justify-end"><button type="button" disabled={!draftText.trim()} onClick={() => { saveDrafts([{ id: `${Date.now()}`, text: draftText.trim(), savedAt: new Date().toISOString() }, ...drafts]); setDraftText(''); }} className="rounded-full bg-[#ff6533] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Save draft</button></div>
                    {drafts.length ? drafts.map(draft => <article key={draft.id} className="rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="whitespace-pre-wrap break-words text-sm text-gray-200">{draft.text}</p><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-gray-500">{new Date(draft.savedAt).toLocaleDateString()}</span><div className="flex gap-2"><button type="button" onClick={() => { setDraftsOpen(false); onProfile?.('draft', draft.text); }} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15">Continue editing</button><button type="button" onClick={() => saveDrafts(drafts.filter(item => item.id !== draft.id))} className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">Delete</button></div></div></article>) : <p className="py-4 text-center text-sm text-gray-500">Your saved drafts will appear here.</p>}
                </div>
            </section>
        </div>}
    </header>
    );
};

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
                    <img src="/lion-logo.png" alt="Ducor" className="h-9 w-9 rounded-xl object-cover" />
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
