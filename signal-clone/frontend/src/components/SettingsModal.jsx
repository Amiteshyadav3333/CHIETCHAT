import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    ArrowLeftIcon, ArrowRightOnRectangleIcon, BellIcon, ChartBarIcon,
    ChatBubbleBottomCenterTextIcon, CheckBadgeIcon, ChevronRightIcon,
    ComputerDesktopIcon, ExclamationTriangleIcon, EyeSlashIcon, KeyIcon,
    LifebuoyIcon, LockClosedIcon, QuestionMarkCircleIcon, ShieldCheckIcon,
    ShoppingBagIcon, TrashIcon, UserCircleIcon, XMarkIcon, NoSymbolIcon,
    HeartIcon, ChatBubbleOvalLeftIcon, FilmIcon, PhotoIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';

const TITLES = {
    settings: 'Settings', profile: 'Profile', account: 'Account', privacy: 'Privacy',
    chats: 'Chats', notifications: 'Notifications', storage: 'Storage and data',
    business: 'Business tools', help: 'Help center', password: 'Change password',
    delete: 'Delete account', activity: 'Your Activity', sessions: 'Active Sessions',
    twofactor_setup: 'Enable 2FA', twofactor_disable: 'Disable 2FA'
};

const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const SettingsModal = ({ user, token, onClose, onLogout, onUserUpdate, theme, wallpaper, onThemeChange, onWallpaperChange }) => {
    const [screen, setScreen] = useState('settings');
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    const [businessTitle, setBusinessTitle] = useState('Business tools');
    const [profile, setProfile] = useState({ username: user?.username || '', bio: user?.bio || '', websiteUrl: user?.websiteUrl || '', platformId: user?.platformId || '' });
    const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    
    // Sessions and 2FA states
    const [sessionsList, setSessionsList] = useState([]);
    const [twoFactorSetupData, setTwoFactorSetupData] = useState(null);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorDisablePassword, setTwoFactorDisablePassword] = useState('');

    // Activity state
    const [activityTab, setActivityTab] = useState('blocked');
    const [activityLoading, setActivityLoading] = useState(false);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [activityData, setActivityData] = useState({ likedReels: [], likedPosts: [], reelComments: [], postComments: [] });
    const [deletion, setDeletion] = useState({ password: '', confirmation: '' });
    const [prefs, setPrefs] = useState(() => ({
        hideLastSeen: user?.hideLastSeen || false,
        hideOnlineStatus: user?.hideOnlineStatus || false,
        readReceipts: user?.readReceipts !== false,
        incognitoKeyboard: localStorage.getItem('incognito_keyboard') === '1',
        messageSounds: localStorage.getItem('message_sounds') !== '0',
        desktopAlerts: localStorage.getItem('desktop_alerts') !== '0',
        callSounds: localStorage.getItem('call_sounds') !== '0',
        mediaAutoDownload: localStorage.getItem('media_auto_download') !== '0',
        dataSaver: localStorage.getItem('data_saver') === '1',
        autoReply: localStorage.getItem('business_auto_reply') === '1',
        showCatalog: localStorage.getItem('business_catalog') === '1',
    }));

    const go = (next) => {
        setMessage(null);
        setScreen(next);
    };

    const togglePref = (name, storageKey) => {
        setPrefs(current => {
            const next = !current[name];
            localStorage.setItem(storageKey, next ? '1' : '0');
            return { ...current, [name]: next };
        });
    };

    const handleTogglePrivacy = async (field, value) => {
        setPrefs(prev => ({ ...prev, [field]: value }));
        localStorage.setItem(
            field === 'hideLastSeen' ? 'hide_last_seen' 
            : field === 'hideOnlineStatus' ? 'hide_online_status' 
            : 'read_receipts', 
            value ? '1' : '0'
        );
        try {
            const payload = {};
            if (field === 'hideLastSeen') payload.hideLastSeen = value;
            if (field === 'hideOnlineStatus') payload.hideOnlineStatus = value;
            if (field === 'readReceipts') payload.readReceipts = value;
            
            const res = await axios.put('/api/user/privacy', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            onUserUpdate?.(res.data);
        } catch (err) {
            console.error("Failed to update privacy on server:", err);
        }
    };

    const fetchSessions = async () => {
        try {
            const res = await axios.get('/api/auth/sessions', { headers: { Authorization: `Bearer ${token}` } });
            setSessionsList(res.data);
        } catch (err) { console.error("Error fetching sessions:", err); }
    };

    const handleRevokeSession = async (sessionId) => {
        try {
            await axios.delete(`/api/auth/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
            setSessionsList(prev => prev.filter(s => s.id !== sessionId));
        } catch (err) {
            alert(err.response?.data?.error || 'Unable to revoke session');
        }
    };

    const handleSetup2FA = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const res = await axios.post('/api/auth/2fa/setup', {}, { headers: { Authorization: `Bearer ${token}` } });
            setTwoFactorSetupData(res.data);
            setTwoFactorCode('');
            go('twofactor_setup');
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to start 2FA setup' });
        } finally {
            setBusy(false);
        }
    };

    const handleEnable2FA = async (e) => {
        e.preventDefault();
        if (!twoFactorSetupData || !twoFactorCode) return;
        setBusy(true);
        setMessage(null);
        try {
            const res = await axios.post('/api/auth/2fa/enable', {
                secret: twoFactorSetupData.secret,
                token: twoFactorCode
            }, { headers: { Authorization: `Bearer ${token}` } });
            onUserUpdate?.(res.data.user);
            setMessage({ type: 'success', text: res.data.message });
            go('account');
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Verification failed' });
        } finally {
            setBusy(false);
        }
    };

    const handleDisable2FA = async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const res = await axios.post('/api/auth/2fa/disable', {
                password: twoFactorDisablePassword
            }, { headers: { Authorization: `Bearer ${token}` } });
            onUserUpdate?.(res.data.user);
            setTwoFactorDisablePassword('');
            setMessage({ type: 'success', text: res.data.message });
            go('account');
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to disable 2FA' });
        } finally {
            setBusy(false);
        }
    };

    const openBusiness = (title) => {
        setBusinessTitle(title);
        go('business');
    };

    const fetchActivity = async () => {
        setActivityLoading(true);
        try {
            const [blockedRes, activityRes] = await Promise.all([
                axios.get('/api/user/blocked-details', { headers: { Authorization: `Bearer ${token}` } }),
                axios.get('/api/user/activity', { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setBlockedUsers(blockedRes.data);
            setActivityData(activityRes.data);
        } catch (err) { console.error(err); }
        finally { setActivityLoading(false); }
    };

    const handleUnblockFromActivity = async (userId) => {
        try {
            await axios.post('/api/user/unblock', { userId }, { headers: { Authorization: `Bearer ${token}` } });
            setBlockedUsers(prev => prev.filter(b => b.user.id !== userId));
        } catch (err) { console.error(err); }
    };

    const submitProfile = async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const res = await axios.post('/api/users/profile', profile, { headers: { Authorization: `Bearer ${token}` } });
            onUserUpdate?.(res.data);
            setMessage({ type: 'success', text: 'Profile updated successfully.' });
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to update profile.' });
        } finally {
            setBusy(false);
        }
    };

    const changePassword = async (event) => {
        event.preventDefault();
        if (passwords.newPassword !== passwords.confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match.' });
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            const res = await axios.post('/api/account/change-password', {
                currentPassword: passwords.currentPassword,
                newPassword: passwords.newPassword,
            }, { headers: { Authorization: `Bearer ${token}` } });
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setMessage({ type: 'success', text: res.data.message });
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to change password.' });
        } finally {
            setBusy(false);
        }
    };

    const deleteAccount = async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            await axios.delete('/api/account', {
                headers: { Authorization: `Bearer ${token}` },
                data: deletion,
            });
            onLogout();
            onClose();
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to delete account.' });
            setBusy(false);
        }
    };

    const openLegal = (path) => window.open(path, '_blank', 'noopener,noreferrer');

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-4">
            <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[#111b21] shadow-2xl sm:h-[88vh] sm:rounded-xl sm:border sm:border-gray-800">
                <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 bg-[#202c33] px-4">
                    {screen !== 'settings' && (
                        <button 
                            onClick={() => {
                                if (['password', 'delete', 'sessions', 'twofactor_setup', 'twofactor_disable'].includes(screen)) {
                                    go('account');
                                } else if (screen === 'activity') {
                                    go('settings');
                                } else {
                                    go('settings');
                                }
                            }} 
                            title="Back" 
                            className="rounded-full p-2 text-gray-300 hover:bg-white/10"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-semibold text-white">{screen === 'business' ? businessTitle : TITLES[screen]}</h2>
                        {screen === 'help' && <p className="text-xs text-gray-400">Account support and security</p>}
                    </div>
                    <button onClick={onClose} title="Close settings" className="rounded-full p-2 text-gray-300 hover:bg-white/10">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto bg-[#111b21]">
                    {message && <Notice type={message.type}>{message.text}</Notice>}

                    {screen === 'settings' && (
                        <>
                            <button onClick={() => go('profile')} className="flex w-full items-center gap-4 border-b border-gray-800 px-5 py-5 text-left hover:bg-white/5">
                                <img src={user?.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="truncate text-lg font-semibold text-white">{user?.username}</h3>
                                        <CheckBadgeIcon className="h-5 w-5 text-[#53bdeb]" />
                                    </div>
                                    {user?.platformId && (
                                        <p className="text-xs font-medium text-violet-400">@{user.platformId}</p>
                                    )}
                                    <p className="truncate text-sm text-gray-400">{user?.bio || 'Hey there! I am using CHEETCHAT.'}</p>
                                </div>
                                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                            </button>
                            <SettingsGroup>
                                <SettingsRow icon={<KeyIcon />} title="Account" subtitle="Password, security and account controls" onClick={() => go('account')} />
                                <SettingsRow icon={<LockClosedIcon />} title="Privacy" subtitle="Last seen and privacy controls" onClick={() => go('privacy')} />
                                <SettingsRow icon={<ChatBubbleBottomCenterTextIcon />} title="Chats" subtitle="Theme and wallpapers" onClick={() => go('chats')} />
                                <SettingsRow icon={<BellIcon />} title="Notifications" subtitle="Messages, calls and desktop alerts" onClick={() => go('notifications')} />
                                <SettingsRow icon={<ComputerDesktopIcon />} title="Storage and data" subtitle="Auto-download and data saver" onClick={() => go('storage')} />
                                <SettingsRow icon={<ChartBarIcon />} title="Your Activity" subtitle="Likes, comments, blocked accounts" onClick={() => { go('activity'); fetchActivity(); }} />
                            </SettingsGroup>
                            <SectionLabel>Business tools</SectionLabel>
                            <SettingsGroup>
                                <SettingsRow icon={<UserCircleIcon />} title="Business profile" subtitle="Professional account details" onClick={() => openBusiness('Business profile')} />
                                <SettingsRow icon={<ShoppingBagIcon />} title="Catalog / Products" subtitle="Control catalog visibility" onClick={() => openBusiness('Catalog / Products')} />
                                <SettingsRow icon={<ChatBubbleBottomCenterTextIcon />} title="Auto reply / Chatbot" subtitle="Welcome and away messages" onClick={() => openBusiness('Auto reply / Chatbot')} />
                                <SettingsRow icon={<ChartBarIcon />} title="Analytics dashboard" subtitle="Account activity overview" onClick={() => openBusiness('Analytics dashboard')} />
                            </SettingsGroup>
                            <SectionLabel>Help</SectionLabel>
                            <SettingsGroup>
                                <SettingsRow icon={<QuestionMarkCircleIcon />} title="Help center" subtitle="Password, deletion and support" onClick={() => go('help')} />
                                <SettingsRow icon={<ShieldCheckIcon />} title="Terms and Conditions" subtitle="Open in a new tab" onClick={() => openLegal('/terms')} />
                                <SettingsRow icon={<ShieldCheckIcon />} title="Privacy Policy" subtitle="Open in a new tab" onClick={() => openLegal('/privacy')} />
                            </SettingsGroup>
                            <button onClick={onLogout} className="mx-5 my-6 flex w-[calc(100%-2.5rem)] items-center justify-center gap-3 rounded-lg border border-red-500/25 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/10">
                                <ArrowRightOnRectangleIcon className="h-5 w-5" /> Log out
                            </button>
                        </>
                    )}

                    {screen === 'profile' && (
                        <SettingsForm onSubmit={submitProfile}>
                            <Hero icon={<UserCircleIcon />} title="Edit your profile" text="Keep your public profile accurate and professional." />
                            <Field label="Username" value={profile.username} onChange={value => setProfile({ ...profile, username: value })} required />
                            <div>
                                <label className="block">
                                    <span className="mb-2 block text-sm font-medium text-gray-200">Platform Handle (@ID)</span>
                                    <div className="relative">
                                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">@</span>
                                        <input
                                            type="text"
                                            value={profile.platformId}
                                            onChange={e => setProfile({ ...profile, platformId: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 30) })}
                                            placeholder="yourhandle"
                                            className="w-full rounded-lg border border-gray-700 bg-[#202c33] py-3 pl-7 pr-4 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-500"
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">3–30 chars, letters/numbers/underscores. Others can find you with @handle.</p>
                                </label>
                            </div>
                            <Field label="Bio" value={profile.bio} onChange={value => setProfile({ ...profile, bio: value })} />
                            <Field label="Website" value={profile.websiteUrl} onChange={value => setProfile({ ...profile, websiteUrl: value })} placeholder="https://example.com" />
                            <PrimaryButton busy={busy}>Save profile</PrimaryButton>
                        </SettingsForm>
                    )}

                    {screen === 'account' && (
                        <>
                            <Hero icon={<ShieldCheckIcon />} title="Account security" text="Manage your sign-in password, sessions, and two-factor authentication." />
                            <SettingsGroup>
                                <SettingsRow icon={<KeyIcon />} title="Change password" subtitle="Verify your current password first" onClick={() => go('password')} />
                                <SettingsRow icon={<TrashIcon />} title="Delete account" subtitle="Permanently remove your account and data" onClick={() => go('delete')} danger />
                            </SettingsGroup>
                            <SectionLabel>Advanced security</SectionLabel>
                            <SettingsGroup>
                                <SettingsRow 
                                    icon={<KeyIcon />} 
                                    title="Two-factor authentication (2FA)" 
                                    subtitle={user?.twoFactorEnabled ? "Enabled (Secure)" : "Disabled (Set up now)"} 
                                    onClick={user?.twoFactorEnabled ? () => go('twofactor_disable') : handleSetup2FA} 
                                />
                                <SettingsRow 
                                    icon={<ComputerDesktopIcon />} 
                                    title="Active device sessions" 
                                    subtitle="View and manage other logged-in devices" 
                                    onClick={() => { fetchSessions(); go('sessions'); }} 
                                />
                                <InfoRow title="Email verified" text="Your registered email is verified and can be used for account recovery." />
                            </SettingsGroup>
                        </>
                    )}

                    {screen === 'privacy' && (
                        <>
                            <SectionLabel>Who can see my personal info</SectionLabel>
                            <SettingsGroup>
                                <SettingsToggle 
                                    icon={<EyeSlashIcon />} 
                                    title="Hide last seen" 
                                    subtitle="Your last seen time will not be shared" 
                                    value={user?.hideLastSeen || false} 
                                    onClick={() => handleTogglePrivacy('hideLastSeen', !(user?.hideLastSeen))} 
                                />
                                <SettingsToggle 
                                    icon={<EyeSlashIcon />} 
                                    title="Hide online status" 
                                    subtitle="Your online badge will not be shown to others" 
                                    value={user?.hideOnlineStatus || false} 
                                    onClick={() => handleTogglePrivacy('hideOnlineStatus', !(user?.hideOnlineStatus))} 
                                />
                                <SettingsToggle 
                                    icon={<ShieldCheckIcon />} 
                                    title="Read receipts (Blue tick)" 
                                    subtitle="Send and receive read confirmation checkmarks" 
                                    value={user?.readReceipts !== false} 
                                    onClick={() => handleTogglePrivacy('readReceipts', !(user?.readReceipts))} 
                                />
                            </SettingsGroup>
                            
                            <SectionLabel>Profile photo visibility</SectionLabel>
                            <SettingsGroup>
                                <ChoiceRow 
                                    title="Who can see my profile photo" 
                                    value={user?.profilePhotoPrivacy || 'everyone'} 
                                    onChange={async (val) => {
                                        try {
                                            const res = await axios.put('/api/user/privacy', { profilePhotoPrivacy: val }, {
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            onUserUpdate?.(res.data);
                                        } catch (err) { console.error(err); }
                                    }}
                                    options={[['everyone', 'Everyone'], ['contacts', 'My Contacts'], ['nobody', 'Nobody']]} 
                                />
                            </SettingsGroup>
                            
                            <SectionLabel>Security</SectionLabel>
                            <SettingsGroup>
                                <InfoRow title="End-to-end encryption" text="Messages and calls are secured between participants using RSA-256 and AES-GCM envelopes." />
                                <InfoRow title="Blocked contacts" text="Block or unblock a user from that contact's chat info." />
                            </SettingsGroup>
                        </>
                    )}

                    {screen === 'sessions' && (
                        <div className="p-5 space-y-4">
                            <Hero icon={<ComputerDesktopIcon />} title="Active Sessions" text="These devices are currently logged in to your account. You can log out of any session to revoke its access." />
                            <div className="space-y-3">
                                {sessionsList.map(s => (
                                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#111b21] p-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-white truncate">{s.userAgent || 'Unknown Device'}</p>
                                            <p className="mt-1 text-xs text-gray-500">IP: {s.ipAddress || 'Unknown'} • Logged in: {timeAgo(s.createdAt)}</p>
                                            {s.isCurrent && (
                                                <span className="mt-2 inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                                                    Current Device
                                                </span>
                                            )}
                                        </div>
                                        {!s.isCurrent && (
                                            <button 
                                                onClick={() => handleRevokeSession(s.id)}
                                                className="ml-4 rounded-lg bg-red-500/10 hover:bg-red-500/20 p-2 text-red-400 border border-red-500/20 active:scale-[0.98] transition-all"
                                                title="Revoke access"
                                            >
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {sessionsList.length === 0 && (
                                    <p className="text-center text-sm text-gray-500 py-10">No active sessions found.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {screen === 'twofactor_setup' && (
                        <SettingsForm onSubmit={handleEnable2FA}>
                            <Hero icon={<ShieldCheckIcon />} title="Scan QR Code" text="Use your Google Authenticator or any TOTP application to scan the QR code below, or manually type the secret key." />
                            {twoFactorSetupData && (
                                <div className="flex flex-col items-center gap-4 bg-[#202c33] rounded-xl p-5 border border-gray-800">
                                    <img src={twoFactorSetupData.qrCodeUrl} alt="2FA QR Code" className="w-44 h-44 rounded-lg bg-white p-2 border border-gray-700" />
                                    <div className="text-center">
                                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Secret Key</p>
                                        <p className="text-sm font-mono text-violet-400 mt-1 select-all">{twoFactorSetupData.secret}</p>
                                    </div>
                                </div>
                            )}
                            <Field 
                                label="6-Digit Verification Code" 
                                placeholder="000000" 
                                maxLength={6} 
                                value={twoFactorCode} 
                                onChange={setTwoFactorCode} 
                                required 
                            />
                            <PrimaryButton busy={busy}>Verify and Enable 2FA</PrimaryButton>
                        </SettingsForm>
                    )}

                    {screen === 'twofactor_disable' && (
                        <SettingsForm onSubmit={handleDisable2FA}>
                            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-5">
                                <ExclamationTriangleIcon className="mb-3 h-8 w-8 text-red-400" />
                                <h3 className="font-semibold text-white">Disable Two-factor Authentication</h3>
                                <p className="mt-2 text-sm leading-6 text-gray-300">This will lower your account security. You will no longer be asked for a verification code when signing in on new devices.</p>
                            </div>
                            <Field 
                                label="Confirm Password" 
                                type="password" 
                                placeholder="Enter password to confirm" 
                                value={twoFactorDisablePassword} 
                                onChange={setTwoFactorDisablePassword} 
                                required 
                            />
                            <button 
                                type="submit" 
                                disabled={busy || !twoFactorDisablePassword} 
                                className="w-full rounded-lg bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {busy ? 'Disabling 2FA...' : 'Disable 2FA'}
                            </button>
                        </SettingsForm>
                    )}

                    {screen === 'chats' && (
                        <>
                            <SectionLabel>Display</SectionLabel>
                            <SettingsGroup>
                                <ChoiceRow title="App theme" value={theme} onChange={onThemeChange} options={[['dark', 'Dark'], ['midnight', 'Midnight'], ['business', 'Business']]} />
                                <ChoiceRow title="Default chat wallpaper" value={wallpaper} onChange={onWallpaperChange} options={[['white', 'White'], ['gradient', 'Dark'], ['dots', 'Dots'], ['emerald', 'Emerald']]} />
                            </SettingsGroup>
                            <div className="m-5 h-44 overflow-hidden rounded-xl border border-gray-700 bg-white p-3"><div className="ml-auto mt-5 max-w-[70%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow">Wallpaper preview <span className="ml-2 text-[10px] text-gray-500">10:30</span></div></div>
                        </>
                    )}

                    {screen === 'notifications' && (
                        <SettingsGroup>
                            <SettingsToggle icon={<BellIcon />} title="Message sounds" subtitle="Play sounds for new messages" value={prefs.messageSounds} onClick={() => togglePref('messageSounds', 'message_sounds')} />
                            <SettingsToggle icon={<ComputerDesktopIcon />} title="Desktop alerts" subtitle="Show notifications while using the app" value={prefs.desktopAlerts} onClick={() => togglePref('desktopAlerts', 'desktop_alerts')} />
                            <SettingsToggle icon={<BellIcon />} title="Call sounds" subtitle="Play a ringtone for incoming calls" value={prefs.callSounds} onClick={() => togglePref('callSounds', 'call_sounds')} />
                        </SettingsGroup>
                    )}

                    {screen === 'storage' && (
                        <>
                            <Hero icon={<ComputerDesktopIcon />} title="Storage and network" text="Choose how CHEETCHAT uses bandwidth on this device." />
                            <SettingsGroup>
                                <SettingsToggle icon={<ComputerDesktopIcon />} title="Media auto-download" subtitle="Automatically download received media" value={prefs.mediaAutoDownload} onClick={() => togglePref('mediaAutoDownload', 'media_auto_download')} />
                                <SettingsToggle icon={<ChartBarIcon />} title="Data saver" subtitle="Reduce media quality on limited networks" value={prefs.dataSaver} onClick={() => togglePref('dataSaver', 'data_saver')} />
                            </SettingsGroup>
                        </>
                    )}

                    {screen === 'business' && (
                        <>
                            <Hero icon={<ChartBarIcon />} title={businessTitle} text="Business tools are saved on this device and can be changed anytime." />
                            {businessTitle === 'Analytics dashboard' ? (
                                <div className="grid grid-cols-2 gap-3 p-5"><Stat label="Profile status" value="Active" /><Stat label="Account type" value="Business" /><Stat label="Catalog" value={prefs.showCatalog ? 'Visible' : 'Hidden'} /><Stat label="Auto reply" value={prefs.autoReply ? 'On' : 'Off'} /></div>
                            ) : (
                                <SettingsGroup>
                                    <SettingsToggle icon={<ShoppingBagIcon />} title="Show product catalog" subtitle="Display your catalog on your business profile" value={prefs.showCatalog} onClick={() => togglePref('showCatalog', 'business_catalog')} />
                                    <SettingsToggle icon={<ChatBubbleBottomCenterTextIcon />} title="Instant welcome reply" subtitle="Send a welcome message to new contacts" value={prefs.autoReply} onClick={() => togglePref('autoReply', 'business_auto_reply')} />
                                    <SettingsRow icon={<UserCircleIcon />} title="Edit business details" subtitle="Update name, bio and website" onClick={() => go('profile')} />
                                </SettingsGroup>
                            )}
                        </>
                    )}

                    {screen === 'activity' && (
                        <ActivityScreen
                            token={token}
                            activityTab={activityTab}
                            setActivityTab={setActivityTab}
                            activityLoading={activityLoading}
                            blockedUsers={blockedUsers}
                            setBlockedUsers={setBlockedUsers}
                            activityData={activityData}
                            onUnblock={handleUnblockFromActivity}
                        />
                    )}

                    {screen === 'help' && (
                        <>
                            <Hero icon={<LifebuoyIcon />} title="How can we help?" text="Manage account access and sensitive account actions from one secure place." />
                            <SectionLabel>Account management</SectionLabel>
                            <SettingsGroup>
                                <SettingsRow icon={<KeyIcon />} title="Change your password" subtitle="Update your password securely" onClick={() => go('password')} />
                                <SettingsRow icon={<TrashIcon />} title="Delete your account" subtitle="Understand and permanently delete your account" onClick={() => go('delete')} danger />
                            </SettingsGroup>
                            <SectionLabel>Popular help</SectionLabel>
                            <SettingsGroup>
                                <InfoRow title="Account recovery" text="Use Forgot password on the login screen to receive a secure recovery link." />
                                <InfoRow title="Privacy and safety" text="Use Privacy settings to control last seen, keyboard privacy, and verification." />
                                <InfoRow title="About account deletion" text="Deletion is permanent. Your profile, messages, posts, reels, status updates, and account relationships are removed." />
                            </SettingsGroup>
                        </>
                    )}

                    {screen === 'password' && (
                        <SettingsForm onSubmit={changePassword}>
                            <Hero icon={<KeyIcon />} title="Create a strong password" text="Use at least 8 characters. Your current password is required to protect your account." />
                            <Field label="Current password" type="password" value={passwords.currentPassword} onChange={value => setPasswords({ ...passwords, currentPassword: value })} required />
                            <Field label="New password" type="password" value={passwords.newPassword} onChange={value => setPasswords({ ...passwords, newPassword: value })} required minLength={8} />
                            <Field label="Confirm new password" type="password" value={passwords.confirmPassword} onChange={value => setPasswords({ ...passwords, confirmPassword: value })} required minLength={8} />
                            <PrimaryButton busy={busy}>Change password</PrimaryButton>
                        </SettingsForm>
                    )}

                    {screen === 'delete' && (
                        <SettingsForm onSubmit={deleteAccount}>
                            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-5">
                                <ExclamationTriangleIcon className="mb-3 h-8 w-8 text-red-400" />
                                <h3 className="font-semibold text-white">This action is permanent</h3>
                                <p className="mt-2 text-sm leading-6 text-gray-300">Your profile, messages, contacts, posts, reels, status updates, and account relationships will be permanently removed. You cannot undo this.</p>
                            </div>
                            <Field label="Current password" type="password" value={deletion.password} onChange={value => setDeletion({ ...deletion, password: value })} required />
                            <Field label={<>Type <strong className="text-white">{user?.username}</strong> to confirm</>} value={deletion.confirmation} onChange={value => setDeletion({ ...deletion, confirmation: value })} required />
                            <button disabled={busy || deletion.confirmation !== user?.username || !deletion.password} className="w-full rounded-lg bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Deleting account...' : 'Permanently delete account'}</button>
                        </SettingsForm>
                    )}
                </div>
            </div>
        </div>
    );
};

const Notice = ({ type, children }) => <div className={`mx-5 mt-5 rounded-lg border px-4 py-3 text-sm ${type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{children}</div>;
const Hero = ({ icon, title, text }) => <div className="m-5 rounded-xl border border-[#00a884]/20 bg-[#00a884]/10 p-5"><span className="mb-3 block h-8 w-8 text-[#00a884] [&>svg]:h-8 [&>svg]:w-8">{icon}</span><h3 className="text-base font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-gray-400">{text}</p></div>;
const SectionLabel = ({ children }) => <p className="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-[#00a884]">{children}</p>;
const SettingsGroup = ({ children }) => <div className="border-y border-gray-800 bg-[#111b21]">{children}</div>;
const SettingsForm = ({ children, onSubmit }) => <form onSubmit={onSubmit} className="space-y-5 p-5">{children}</form>;
const Field = ({ label, value, onChange, type = 'text', ...props }) => <label className="block"><span className="mb-2 block text-sm font-medium text-gray-200">{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-[#202c33] px-3 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#00a884]" {...props} /></label>;
const PrimaryButton = ({ children, busy }) => <button disabled={busy} className="w-full rounded-lg bg-[#00a884] px-4 py-3 text-sm font-semibold text-white hover:bg-[#069b7e] disabled:opacity-50">{busy ? 'Please wait...' : children}</button>;
const SettingsRow = ({ icon, title, subtitle, onClick, danger = false }) => <button onClick={onClick} className="flex w-full items-center gap-4 border-b border-gray-800/70 px-5 py-4 text-left last:border-b-0 hover:bg-white/5"><span className={`h-6 w-6 [&>svg]:h-6 [&>svg]:w-6 ${danger ? 'text-red-400' : 'text-gray-400'}`}>{icon}</span><span className="min-w-0 flex-1"><span className={`block text-sm font-medium ${danger ? 'text-red-400' : 'text-white'}`}>{title}</span><span className="mt-0.5 block truncate text-xs text-gray-500">{subtitle}</span></span><ChevronRightIcon className="h-4 w-4 text-gray-600" /></button>;
const SettingsToggle = ({ icon, title, subtitle, value, onClick }) => <button onClick={onClick} className="flex w-full items-center gap-4 border-b border-gray-800/70 px-5 py-4 text-left last:border-b-0 hover:bg-white/5"><span className="h-6 w-6 text-gray-400 [&>svg]:h-6 [&>svg]:w-6">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white">{title}</span><span className="mt-0.5 block text-xs text-gray-500">{subtitle}</span></span><span className={`h-6 w-11 rounded-full p-0.5 transition ${value ? 'bg-[#00a884]' : 'bg-gray-700'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${value ? 'translate-x-5' : ''}`} /></span></button>;
const ChoiceRow = ({ title, value, onChange, options }) => <div className="border-b border-gray-800/70 px-5 py-4 last:border-b-0"><p className="mb-3 text-sm font-medium text-white">{title}</p><div className="flex flex-wrap gap-2">{options.map(([id, label]) => <button type="button" key={id} onClick={() => onChange(id)} className={`rounded-full border px-3 py-1.5 text-xs ${value === id ? 'border-[#00a884] bg-[#00a884]/15 text-[#00a884]' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>{label}</button>)}</div></div>;
const InfoRow = ({ title, text }) => <div className="border-b border-gray-800/70 px-5 py-4 last:border-b-0"><p className="text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs leading-5 text-gray-500">{text}</p></div>;
const Stat = ({ label, value }) => <div className="rounded-xl border border-gray-800 bg-[#202c33] p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>;

const ActivityScreen = ({ token, activityTab, setActivityTab, activityLoading, blockedUsers, setBlockedUsers, activityData, onUnblock }) => {
    const tabs = [
        { id: 'blocked', label: 'Blocked', icon: <NoSymbolIcon className="h-4 w-4" />, count: blockedUsers.length },
        { id: 'likes', label: 'Likes', icon: <HeartSolid className="h-4 w-4" />, count: (activityData.likedReels?.length || 0) + (activityData.likedPosts?.length || 0) },
        { id: 'comments', label: 'Comments', icon: <ChatBubbleOvalLeftIcon className="h-4 w-4" />, count: (activityData.reelComments?.length || 0) + (activityData.postComments?.length || 0) },
    ];

    if (activityLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-10 h-10 border-3 border-gray-700 border-t-[#00a884] rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 text-sm">Loading your activity...</p>
            </div>
        );
    }

    return (
        <>
            {/* Stats Overview */}
            <div className="grid grid-cols-3 gap-3 p-5">
                <div className="rounded-xl border border-gray-800 bg-[#202c33] p-3 text-center">
                    <NoSymbolIcon className="h-5 w-5 text-red-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{blockedUsers.length}</p>
                    <p className="text-[10px] text-gray-500 font-medium">Blocked</p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-[#202c33] p-3 text-center">
                    <HeartSolid className="h-5 w-5 text-red-500 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{(activityData.likedReels?.length || 0) + (activityData.likedPosts?.length || 0)}</p>
                    <p className="text-[10px] text-gray-500 font-medium">Likes</p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-[#202c33] p-3 text-center">
                    <ChatBubbleOvalLeftIcon className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{(activityData.reelComments?.length || 0) + (activityData.postComments?.length || 0)}</p>
                    <p className="text-[10px] text-gray-500 font-medium">Comments</p>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex mx-5 mb-4 rounded-xl bg-[#202c33] p-1 border border-gray-800">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActivityTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                            activityTab === tab.id
                                ? 'bg-[#00a884] text-white shadow-lg shadow-[#00a884]/20'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                activityTab === tab.id ? 'bg-white/20' : 'bg-gray-700'
                            }`}>{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Blocked Tab */}
            {activityTab === 'blocked' && (
                <div className="px-5 pb-5 space-y-2">
                    {blockedUsers.length === 0 ? (
                        <EmptyState icon={<NoSymbolIcon className="h-10 w-10" />} title="No blocked accounts" subtitle="Accounts you block won't be able to contact you or see your content." />
                    ) : blockedUsers.map(item => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#1a2429] p-3 hover:bg-[#202c33] transition-colors">
                            <img src={item.user.avatar} alt="" className="h-11 w-11 rounded-full object-cover border border-gray-700" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">{item.user.username}</p>
                                {item.user.platformId && <p className="text-[11px] text-violet-400 font-medium">@{item.user.platformId}</p>}
                                <p className="text-[10px] text-gray-600 mt-0.5">Blocked {timeAgo(item.blockedAt)}</p>
                            </div>
                            <button
                                onClick={() => onUnblock(item.user.id)}
                                className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                            >
                                Unblock
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Likes Tab */}
            {activityTab === 'likes' && (
                <div className="px-5 pb-5 space-y-4">
                    {/* Liked Reels */}
                    {activityData.likedReels?.length > 0 && (
                        <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#00a884] flex items-center gap-1.5">
                                <FilmIcon className="h-3.5 w-3.5" /> Liked Reels
                            </p>
                            <div className="space-y-2">
                                {activityData.likedReels.map(item => (
                                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#1a2429] p-3 hover:bg-[#202c33] transition-colors">
                                        <div className="relative h-14 w-10 rounded-lg overflow-hidden bg-gray-800 shrink-0 border border-gray-700">
                                            <video src={item.videoUrl} className="h-full w-full object-cover" muted preload="metadata" />
                                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                                <HeartSolid className="h-4 w-4 text-red-500" />
                                            </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <img src={item.user.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                                                <p className="text-xs font-semibold text-white truncate">@{item.user.platformId || item.user.username}</p>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.caption || 'No caption'}</p>
                                        </div>
                                        <p className="text-[10px] text-gray-600 shrink-0">{timeAgo(item.likedAt)}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Liked Posts */}
                    {activityData.likedPosts?.length > 0 && (
                        <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#00a884] flex items-center gap-1.5 mt-2">
                                <PhotoIcon className="h-3.5 w-3.5" /> Liked Posts
                            </p>
                            <div className="space-y-2">
                                {activityData.likedPosts.map(item => (
                                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#1a2429] p-3 hover:bg-[#202c33] transition-colors">
                                        {item.mediaUrl ? (
                                            <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-gray-800 shrink-0 border border-gray-700">
                                                {item.mediaType === 'video' ? (
                                                    <video src={item.mediaUrl} className="h-full w-full object-cover" muted preload="metadata" />
                                                ) : (
                                                    <img src={item.mediaUrl} alt="" className="h-full w-full object-cover" />
                                                )}
                                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                                    <HeartSolid className="h-4 w-4 text-red-500" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-pink-500/20 to-red-500/20 flex items-center justify-center shrink-0 border border-gray-700">
                                                <HeartSolid className="h-5 w-5 text-red-500" />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <img src={item.user.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                                                <p className="text-xs font-semibold text-white truncate">@{item.user.platformId || item.user.username}</p>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.caption || 'No caption'}</p>
                                        </div>
                                        <p className="text-[10px] text-gray-600 shrink-0">{timeAgo(item.likedAt)}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {(activityData.likedReels?.length || 0) + (activityData.likedPosts?.length || 0) === 0 && (
                        <EmptyState icon={<HeartIcon className="h-10 w-10" />} title="No likes yet" subtitle="Posts and reels you like will appear here." />
                    )}
                </div>
            )}

            {/* Comments Tab */}
            {activityTab === 'comments' && (
                <div className="px-5 pb-5 space-y-4">
                    {/* Reel Comments */}
                    {activityData.reelComments?.length > 0 && (
                        <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#00a884] flex items-center gap-1.5">
                                <FilmIcon className="h-3.5 w-3.5" /> Reel Comments
                            </p>
                            <div className="space-y-2">
                                {activityData.reelComments.map(item => (
                                    <div key={item.id} className="rounded-xl border border-gray-800 bg-[#1a2429] p-3 hover:bg-[#202c33] transition-colors">
                                        <div className="flex items-center gap-2 mb-2">
                                            <img src={item.reelUser.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                                            <p className="text-xs font-semibold text-white truncate">on @{item.reelUser.platformId || item.reelUser.username}'s reel</p>
                                            <p className="text-[10px] text-gray-600 ml-auto shrink-0">{timeAgo(item.commentedAt)}</p>
                                        </div>
                                        <div className="flex items-start gap-2.5">
                                            <ChatBubbleOvalLeftIcon className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                                            <p className="text-sm text-gray-200 leading-relaxed">"{item.content}"</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Post Comments */}
                    {activityData.postComments?.length > 0 && (
                        <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#00a884] flex items-center gap-1.5 mt-2">
                                <PhotoIcon className="h-3.5 w-3.5" /> Post Comments
                            </p>
                            <div className="space-y-2">
                                {activityData.postComments.map(item => (
                                    <div key={item.id} className="rounded-xl border border-gray-800 bg-[#1a2429] p-3 hover:bg-[#202c33] transition-colors">
                                        <div className="flex items-center gap-2 mb-2">
                                            <img src={item.postUser.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                                            <p className="text-xs font-semibold text-white truncate">on @{item.postUser.platformId || item.postUser.username}'s post</p>
                                            <p className="text-[10px] text-gray-600 ml-auto shrink-0">{timeAgo(item.commentedAt)}</p>
                                        </div>
                                        <div className="flex items-start gap-2.5">
                                            <ChatBubbleOvalLeftIcon className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                                            <p className="text-sm text-gray-200 leading-relaxed">"{item.content}"</p>
                                        </div>
                                        {item.postCaption && (
                                            <p className="text-[11px] text-gray-600 mt-2 ml-6.5 line-clamp-1 italic">Post: {item.postCaption}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {(activityData.reelComments?.length || 0) + (activityData.postComments?.length || 0) === 0 && (
                        <EmptyState icon={<ChatBubbleOvalLeftIcon className="h-10 w-10" />} title="No comments yet" subtitle="Comments you make on posts and reels will appear here." />
                    )}
                </div>
            )}
        </>
    );
};

const EmptyState = ({ icon, title, subtitle }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800/50 border border-gray-700 flex items-center justify-center mb-4 text-gray-600">
            {icon}
        </div>
        <p className="text-sm font-semibold text-white mb-1">{title}</p>
        <p className="text-xs text-gray-500 max-w-[220px] leading-relaxed">{subtitle}</p>
    </div>
);

export default SettingsModal;
