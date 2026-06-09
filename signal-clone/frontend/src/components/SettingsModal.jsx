import React, { useState } from 'react';
import axios from 'axios';
import {
    ArrowLeftIcon, ArrowRightOnRectangleIcon, BellIcon, ChartBarIcon,
    ChatBubbleBottomCenterTextIcon, CheckBadgeIcon, ChevronRightIcon,
    ComputerDesktopIcon, ExclamationTriangleIcon, EyeSlashIcon, KeyIcon,
    LifebuoyIcon, LockClosedIcon, QuestionMarkCircleIcon, ShieldCheckIcon,
    ShoppingBagIcon, TrashIcon, UserCircleIcon, XMarkIcon
} from '@heroicons/react/24/outline';

const TITLES = {
    settings: 'Settings', profile: 'Profile', account: 'Account', privacy: 'Privacy',
    chats: 'Chats', notifications: 'Notifications', storage: 'Storage and data',
    business: 'Business tools', help: 'Help center', password: 'Change password',
    delete: 'Delete account',
};

const SettingsModal = ({ user, token, onClose, onLogout, onUserUpdate, theme, wallpaper, onThemeChange, onWallpaperChange }) => {
    const [screen, setScreen] = useState('settings');
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    const [businessTitle, setBusinessTitle] = useState('Business tools');
    const [profile, setProfile] = useState({ username: user?.username || '', bio: user?.bio || '', websiteUrl: user?.websiteUrl || '', platformId: user?.platformId || '' });
    const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [deletion, setDeletion] = useState({ password: '', confirmation: '' });
    const [prefs, setPrefs] = useState(() => ({
        hideLastSeen: localStorage.getItem('hide_last_seen') === '1',
        incognitoKeyboard: localStorage.getItem('incognito_keyboard') === '1',
        twoStep: localStorage.getItem('two_step_verification') === '1',
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

    const openBusiness = (title) => {
        setBusinessTitle(title);
        go('business');
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
                        <button onClick={() => go(screen === 'password' || screen === 'delete' ? 'help' : 'settings')} title="Back" className="rounded-full p-2 text-gray-300 hover:bg-white/10">
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
                            <Hero icon={<ShieldCheckIcon />} title="Account security" text="Manage your sign-in password and permanent account controls." />
                            <SettingsGroup>
                                <SettingsRow icon={<KeyIcon />} title="Change password" subtitle="Verify your current password first" onClick={() => go('password')} />
                                <SettingsRow icon={<TrashIcon />} title="Delete account" subtitle="Permanently remove your account and data" onClick={() => go('delete')} danger />
                            </SettingsGroup>
                            <SectionLabel>Security status</SectionLabel>
                            <SettingsGroup>
                                <SettingsToggle icon={<KeyIcon />} title="Two-step verification" subtitle="Require additional verification on sign-in" value={prefs.twoStep} onClick={() => togglePref('twoStep', 'two_step_verification')} />
                                <InfoRow title="Email verified" text="Your registered email is verified and can be used for account recovery." />
                            </SettingsGroup>
                        </>
                    )}

                    {screen === 'privacy' && (
                        <>
                            <SectionLabel>Who can see my personal info</SectionLabel>
                            <SettingsGroup>
                                <SettingsToggle icon={<EyeSlashIcon />} title="Hide last seen" subtitle="Your last seen will not be shown" value={prefs.hideLastSeen} onClick={() => togglePref('hideLastSeen', 'hide_last_seen')} />
                                <SettingsToggle icon={<ShieldCheckIcon />} title="Incognito keyboard" subtitle="Prevent personalized keyboard learning" value={prefs.incognitoKeyboard} onClick={() => togglePref('incognitoKeyboard', 'incognito_keyboard')} />
                                <SettingsToggle icon={<KeyIcon />} title="Two-step verification" subtitle="Add an extra layer of account security" value={prefs.twoStep} onClick={() => togglePref('twoStep', 'two_step_verification')} />
                            </SettingsGroup>
                            <SectionLabel>Security</SectionLabel>
                            <SettingsGroup><InfoRow title="End-to-end encryption" text="Messages and calls are secured between participants." /><InfoRow title="Blocked contacts" text="Block or unblock a user from that contact's chat info." /></SettingsGroup>
                        </>
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

export default SettingsModal;
