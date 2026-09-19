import React, { useState, useContext, useRef, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from '../utils/clientRouter';
import {
    CameraIcon,
    UserCircleIcon,
    ArrowRightIcon,
    ShieldCheckIcon,
    AcademicCapIcon,
    MapPinIcon,
    UserPlusIcon,
    ChatBubbleLeftRightIcon,
    CheckIcon,
    SparklesIcon,
    ShareIcon,
    UserGroupIcon,
    GiftIcon,
    PhoneIcon
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';

const POPULAR_COLLEGES = [
    'Delhi University',
    'IIT Delhi',
    'IIT Bombay',
    'Amity University',
    'Mumbai University',
    'NIT Trichy',
    'BHU Varanasi',
    'Anna University',
    'VIT Vellore',
    'Chandigarh University',
    'JNU Delhi',
    'SRM University'
];

const POPULAR_LOCATIONS = [
    'New Delhi',
    'Mumbai',
    'Bengaluru',
    'Pune',
    'Patna',
    'Hyderabad',
    'Kolkata',
    'Jaipur',
    'Lucknow',
    'Chandigarh'
];

const ProfileSetup = () => {
    const { user, token, updateUser } = useContext(AuthContext);
    const navigate = useNavigate();

    const [step, setStep] = useState(1); // 1: College & Profile, 2: Connections & Group creation
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [college, setCollege] = useState(user?.college || '');
    const [location, setLocation] = useState(user?.location || '');
    const [classGroupName, setClassGroupName] = useState('');
    const [creatingGroup, setCreatingGroup] = useState(false);
    const [groupCreated, setGroupCreated] = useState(false);
    const avatarInputRef = useRef(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Suggestions state for step 2
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [followedIds, setFollowedIds] = useState({});
    const [connectedIds, setConnectedIds] = useState({});
    const [actionBusyIds, setActionBusyIds] = useState({});

    useEffect(() => {
        if (user?.profileSetupDone && step === 1) {
            navigate('/');
        }
    }, [user, step, navigate]);

    useEffect(() => {
        if (college) {
            setClassGroupName(`${college} Freshers 2026`);
        } else {
            setClassGroupName('Classroom & Campus 2026');
        }
    }, [college]);

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const fetchSuggestions = async () => {
        setLoadingSuggestions(true);
        try {
            const res = await axios.get('/api/users/suggestions?limit=8', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuggestions(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to load campus suggestions', err);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleFormSubmit = async () => {
        setError('');
        setSubmitting(true);
        try {
            const formData = new FormData();
            if (avatarFile) {
                formData.append('avatar', avatarFile);
            }
            formData.append('college', college.trim());
            formData.append('location', location.trim());

            const res = await axios.post('/api/user/setup-profile', formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                }
            });

            updateUser(res.data.user);
            setStep(2);
            fetchSuggestions();
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleFollow = async (userId) => {
        if (actionBusyIds[userId]) return;
        setActionBusyIds(prev => ({ ...prev, [userId]: true }));
        try {
            const res = await axios.post(`/api/users/${userId}/follow`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFollowedIds(prev => ({ ...prev, [userId]: res.data.isFollowing }));
        } catch (err) {
            console.error('Follow failed', err);
        } finally {
            setActionBusyIds(prev => ({ ...prev, [userId]: false }));
        }
    };

    const handleConnect = async (userId) => {
        if (actionBusyIds[userId]) return;
        setActionBusyIds(prev => ({ ...prev, [userId]: true }));
        try {
            const res = await axios.post(`/api/users/${userId}/connect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.ok) {
                setConnectedIds(prev => ({ ...prev, [userId]: true }));
            }
        } catch (err) {
            console.error('Connect failed', err);
        } finally {
            setActionBusyIds(prev => ({ ...prev, [userId]: false }));
        }
    };

    const handleCreateClassGroup = async () => {
        const groupName = classGroupName.trim() || `${college || 'Campus'} Freshers 2026`;
        setCreatingGroup(true);
        try {
            const res = await axios.post('/api/chats/create', {
                name: groupName,
                isGroup: true,
                isPublic: true,
                participants: [user.id]
            }, { headers: { Authorization: `Bearer ${token}` } });

            const chatId = res.data.id;
            const referralCode = user?.referralCode || '';
            const inviteUrl = `${window.location.origin}/signup?ref=${referralCode}&group=${chatId}`;
            const shareText = `🎓 Hey classmates! Maine hamari class/batch ka official group '${groupName}' banaya hai CHEETCHAT par.\n\nSabhi log yahan jud jao:\n${inviteUrl}\n\n🎁 Join karne par sabko 15 Din Free Premium milega!`;

            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
            setGroupCreated(true);
        } catch (err) {
            console.error('Group creation failed', err);
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleShareWhatsApp = () => {
        const referralCode = user?.referralCode || '';
        const inviteUrl = `${window.location.origin}/signup?ref=${referralCode}`;
        const campusText = college ? `apne college (${college})` : 'campus';
        const shareText = `Hey! Mai ${campusText} ke classmates ke saath CHEETCHAT par jud gaya hoon. Tum bhi join karo aur free 15 din Premium pao:\n${inviteUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
    };

    const handlePickContacts = async () => {
        if (navigator.contacts && navigator.contacts.select) {
            try {
                const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
                if (contacts && contacts.length > 0) {
                    handleShareWhatsApp();
                }
            } catch (e) {
                handleShareWhatsApp();
            }
        } else {
            handleShareWhatsApp();
        }
    };

    const handleFinish = () => {
        localStorage.removeItem('cheetchat_tour_completed');
        navigate('/');
    };

    return (
        <div className="min-h-[100dvh] bg-[#07090c] flex items-center justify-center p-3 sm:p-5 relative overflow-x-hidden">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            <div className="relative w-full max-w-xl my-4">
                {/* Brand Logo */}
                <div className="mb-5 flex items-center justify-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25d366] to-[#00a884] shadow-lg shadow-[#25d366]/20">
                        <ShieldCheckIcon className="h-6 w-6 text-black" />
                    </div>
                    <div>
                        <span className="text-xl font-black tracking-tight text-white block">CHEETCHAT</span>
                        <span className="text-[10px] text-[#25d366] tracking-wider uppercase font-bold">Campus & Student Network</span>
                    </div>
                </div>

                {/* Step Progress Indicators */}
                <div className="mb-5 flex items-center justify-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${step === 1 ? 'bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/40' : 'bg-white/5 text-gray-400'}`}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25d366] text-black font-black text-[10px]">1</span>
                        <span>College Info</span>
                    </div>
                    <div className="h-0.5 w-6 bg-white/10" />
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${step === 2 ? 'bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/40' : 'bg-white/5 text-gray-400'}`}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25d366] text-black font-black text-[10px]">2</span>
                        <span>First Connection & Lobby</span>
                    </div>
                </div>

                <div className="rounded-3xl border border-white/[0.08] bg-[#111b21]/95 backdrop-blur-2xl shadow-2xl shadow-black/80 overflow-hidden">
                    {/* STEP 1: College & Profile Details */}
                    {step === 1 && (
                        <div>
                            <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-6 sm:px-8">
                                <span className="rounded-full bg-[#25d366]/15 border border-[#25d366]/30 px-3 py-1 text-[11px] font-bold text-[#25d366] uppercase tracking-wider inline-block mb-2">
                                    Step 1 of 2
                                </span>
                                <h1 className="text-2xl font-bold text-white tracking-tight">
                                    Welcome, {user?.username || 'Student'}! 👋
                                </h1>
                                <p className="mt-1 text-sm text-gray-300">
                                    Which college or university are you from? Enter your campus details so we can instantly link you with your batchmates.
                                </p>
                            </div>

                            <div className="px-6 py-6 sm:px-8 space-y-5">
                                {/* Avatar */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative group">
                                        <div
                                            onClick={() => avatarInputRef.current?.click()}
                                            className="h-24 w-24 rounded-full overflow-hidden border-[3px] border-white/10 cursor-pointer ring-4 ring-[#25d366]/0 transition-all duration-300 hover:ring-[#25d366]/30 hover:border-[#25d366]/40 hover:scale-105"
                                        >
                                            {avatarPreview ? (
                                                <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="h-full w-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                                                    <UserCircleIcon className="h-16 w-16 text-gray-500" />
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => avatarInputRef.current?.click()}
                                            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#25d366] text-[#07090c] border-2 border-[#111b21] shadow-lg hover:bg-[#20bd5a] transition-all hover:scale-110"
                                        >
                                            <CameraIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleAvatarChange}
                                        className="hidden"
                                        id="avatar-input"
                                    />
                                    <span className="text-[11px] text-gray-400">
                                        {avatarFile ? '✓ Photo Selected' : 'Add Profile Photo (Optional)'}
                                    </span>
                                </div>

                                {/* College / University Input */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-white flex items-center gap-2">
                                        <AcademicCapIcon className="h-5 w-5 text-[#25d366]" />
                                        <span>University / College Name</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={college}
                                        onChange={(e) => setCollege(e.target.value)}
                                        placeholder="e.g. Delhi University, IIT Delhi, Amity University..."
                                        className="w-full rounded-xl border border-gray-700 bg-[#202c33] px-4 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-[#25d366] ring-1 ring-transparent focus:ring-[#25d366]/20 transition"
                                    />
                                    {/* Popular College Chips */}
                                    <div className="pt-1">
                                        <p className="text-[11px] text-gray-400 mb-1.5 font-medium">Quick Select (Popular Campuses):</p>
                                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                                            {POPULAR_COLLEGES.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setCollege(c)}
                                                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                                                        college === c
                                                            ? 'bg-[#25d366] text-black font-bold'
                                                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                                    }`}
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Location / City Input */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-white flex items-center gap-2">
                                        <MapPinIcon className="h-5 w-5 text-emerald-400" />
                                        <span>Location / City</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        placeholder="e.g. New Delhi, Mumbai, Bengaluru, Patna, Pune..."
                                        className="w-full rounded-xl border border-gray-700 bg-[#202c33] px-4 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-[#25d366] ring-1 ring-transparent focus:ring-[#25d366]/20 transition"
                                    />
                                    {/* Popular Location Chips */}
                                    <div className="pt-1">
                                        <div className="flex flex-wrap gap-1.5">
                                            {POPULAR_LOCATIONS.map((loc) => (
                                                <button
                                                    key={loc}
                                                    type="button"
                                                    onClick={() => setLocation(loc)}
                                                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                                                        location === loc
                                                            ? 'bg-emerald-400 text-black font-bold'
                                                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                                    }`}
                                                >
                                                    {loc}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {error && (
                                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                                        {error}
                                    </div>
                                )}

                                <button
                                    id="profile-step1-continue-btn"
                                    type="button"
                                    onClick={handleFormSubmit}
                                    disabled={submitting}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] hover:bg-[#20bd5a] py-4 font-black text-[#07090c] text-sm uppercase tracking-wider shadow-lg shadow-[#25d366]/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="h-4 w-4 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                                            <span>Saving profile & preparing campus lobby…</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Connect with Campus & Classmates →</span>
                                            <ArrowRightIcon className="h-5 w-5" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Force First Connection, Lobby & Instant Group */}
                    {step === 2 && (
                        <div>
                            <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-5 sm:px-8">
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#25d366] mb-1">
                                    <SparklesIcon className="h-4 w-4" />
                                    <span>Instant Campus Connections & Lobby</span>
                                </div>
                                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                    {college ? `${college} Hub` : 'Campus Friends'}
                                </h1>
                                <p className="mt-1 text-xs sm:text-sm text-gray-300">
                                    No empty home screen! Your campus lobby and batchmates are ready. Connect in 1 click or create your class group.
                                </p>
                            </div>

                            <div className="px-6 py-5 sm:px-8 space-y-5 max-h-[72vh] overflow-y-auto">
                                {/* Automatic Campus Lobby Notice */}
                                <div className="rounded-2xl border border-[#25d366]/30 bg-[#25d366]/10 p-4 flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25d366] text-black font-black">
                                        🏫
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-[#25d366]">
                                            College Campus Lobby Ready
                                        </p>
                                        <p className="text-sm font-bold text-white mt-0.5">
                                            {college ? `${college} Campus Lobby` : 'Freshers & Campus Lounge 2026'}
                                        </p>
                                        <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                                            You have been automatically added to your college lobby so you can chat live with fellow students immediately.
                                        </p>
                                    </div>
                                </div>

                                {/* Feature 1: Existing Campus Peers / Suggestions */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                            <UserPlusIcon className="h-4 w-4 text-[#25d366]" />
                                            <span>Suggested Batchmates (Send Request)</span>
                                        </h3>
                                        <span className="text-[11px] text-gray-400">1-Click Connect</span>
                                    </div>

                                    {loadingSuggestions ? (
                                        <div className="py-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                                            <div className="h-4 w-4 rounded-full border-2 border-[#25d366] border-t-transparent animate-spin" />
                                            <span>Finding classmates...</span>
                                        </div>
                                    ) : suggestions.length === 0 ? (
                                        <div className="p-4 rounded-xl bg-white/5 text-center text-xs text-gray-400">
                                            You are the first pioneer from this campus! Use the button below to bring your class group here.
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {suggestions.slice(0, 4).map((u) => {
                                                const isFollowing = Boolean(followedIds[u.id] ?? u.isFollowing);
                                                const isConnected = Boolean(connectedIds[u.id] ?? u.isContact);
                                                const isBusy = Boolean(actionBusyIds[u.id]);

                                                return (
                                                    <div
                                                        key={u.id}
                                                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/5 bg-[#182229]"
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <img
                                                                src={u.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=CHEETCHAT"}
                                                                alt=""
                                                                className="h-10 w-10 rounded-full object-cover shrink-0 border border-white/10"
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1">
                                                                    <p className="text-xs sm:text-sm font-bold text-white truncate">{u.username}</p>
                                                                    {u.isVerified && <CheckBadgeIcon className="h-3.5 w-3.5 text-[#53bdeb] shrink-0" />}
                                                                </div>
                                                                <p className="text-[11px] text-emerald-400 truncate font-semibold">
                                                                    {u.college ? `🏫 ${u.college}` : (u.location ? `📍 ${u.location}` : u.suggestionReason)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                disabled={isBusy}
                                                                onClick={() => handleToggleFollow(u.id)}
                                                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                                                                    isFollowing
                                                                        ? 'bg-white/10 text-gray-300'
                                                                        : 'bg-white/15 hover:bg-white/20 text-white'
                                                                }`}
                                                            >
                                                                {isFollowing ? 'Following' : 'Follow'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isBusy || isConnected}
                                                                onClick={() => handleConnect(u.id)}
                                                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition ${
                                                                    isConnected
                                                                        ? 'bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/30'
                                                                        : 'bg-[#25d366] hover:bg-[#20bd5a] text-black shadow-md shadow-[#25d366]/20'
                                                                }`}
                                                            >
                                                                {isConnected ? '✓ Connected' : 'Say Hi & Request'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Feature 2: Instant Class Group Creation */}
                                <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <UserGroupIcon className="h-5 w-5 text-violet-400" />
                                            <h3 className="text-sm font-black text-white">
                                                Bring Your Class Group Here (Instant Group)
                                            </h3>
                                        </div>
                                        <span className="rounded bg-violet-500/20 text-violet-300 px-2 py-0.5 text-[10px] font-bold">
                                            Rewarding
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-300 leading-relaxed">
                                        Create your batch group and 1-click share to WhatsApp. When 3 classmates join, get <strong>15 Days Free Premium + Creator Badge</strong>!
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={classGroupName}
                                            onChange={(e) => setClassGroupName(e.target.value)}
                                            placeholder="Group Name: e.g. DU B.Com Batch 2026"
                                            className="flex-1 rounded-xl border border-gray-700 bg-[#202c33] px-3.5 py-2.5 text-xs text-white outline-none focus:border-violet-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCreateClassGroup}
                                            disabled={creatingGroup}
                                            className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white px-4 py-2.5 text-xs font-bold shadow-lg shadow-violet-600/30 transition active:scale-95 disabled:opacity-50"
                                        >
                                            {creatingGroup ? 'Creating…' : (groupCreated ? '✓ Shared on WhatsApp' : 'Create & WhatsApp Share 📲')}
                                        </button>
                                    </div>
                                </div>

                                {/* Feature 3: Big WhatsApp & Contacts Invite Button with Strong Incentive */}
                                <div className="rounded-2xl border border-[#25d366]/40 bg-gradient-to-br from-[#25d366]/15 via-[#182229] to-[#121c17] p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <GiftIcon className="h-5 w-5 text-[#25d366]" />
                                            <h3 className="text-sm font-black text-white">
                                                Invite Rewards & Classmate Perks
                                            </h3>
                                        </div>
                                        <span className="rounded-full bg-[#25d366] text-black px-2 py-0.5 text-[10px] font-black">
                                            15 Days Free
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
                                        <div className="rounded-lg bg-black/25 p-2 border border-white/5">
                                            <p className="font-bold text-[#25d366]">✓ 1 Friend Joins</p>
                                            <p className="text-[10px] text-gray-400">15 Days Free Premium for both</p>
                                        </div>
                                        <div className="rounded-lg bg-black/25 p-2 border border-white/5">
                                            <p className="font-bold text-violet-300">✓ 3 Friends Join</p>
                                            <p className="text-[10px] text-gray-400">Campus Pioneer Special Badge</p>
                                        </div>
                                    </div>

                                    {/* Big WhatsApp / Contacts Buttons */}
                                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={handleShareWhatsApp}
                                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#25d366] hover:bg-[#20bd5a] text-[#07090c] font-black py-3 px-4 text-xs uppercase tracking-wider shadow-lg shadow-[#25d366]/20 transition active:scale-95"
                                        >
                                            <ShareIcon className="h-4 w-4" />
                                            <span>Invite Classmates via WhatsApp</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handlePickContacts}
                                            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-bold py-3 px-4 text-xs transition active:scale-95"
                                        >
                                            <PhoneIcon className="h-4 w-4 text-gray-300" />
                                            <span>Phone Contacts</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Finish & Start Feature Tour */}
                                <div className="pt-2">
                                    <button
                                        type="button"
                                        id="finish-to-tour-btn"
                                        onClick={handleFinish}
                                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25d366] hover:bg-[#20bd5a] py-4 px-6 font-black text-[#07090c] text-sm uppercase tracking-wider shadow-xl shadow-[#25d366]/30 ring-4 ring-[#25d366]/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                                    >
                                        <span>Enter CHEETCHAT & Start Feature Tour →</span>
                                    </button>
                                    <p className="mt-2 text-center text-xs text-gray-400">
                                        Your Campus Lobby and Campus Guide are waiting for you
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileSetup;
