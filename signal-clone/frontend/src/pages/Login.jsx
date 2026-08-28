import React, { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from '../utils/clientRouter';
import { generateKeys, generateRecoveryCode, protectPrivateKeyWithPassword, restorePrivateKeyWithPassword } from '../utils/encryption';
import { EnvelopeIcon, KeyIcon, LockClosedIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { getDeviceFingerprint } from '../utils/deviceIdentity';
import { loadDevicePrivateKey, saveDevicePrivateKey } from '../utils/secureKeyStore';
import { getSupabaseClient } from '../utils/supabaseClient';
import MarketingLanding from '../components/MarketingLanding';

const Login = () => {
    const isSignupRoute = window.location.pathname === '/signup';
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    const authOnly = isSignupRoute || requestedMode === 'login';
    const [authOpen, setAuthOpen] = useState(authOnly);
    const [siteLanguage, setSiteLanguage] = useState(() => localStorage.getItem('cheetchat-marketing-language') || (navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en'));
    const [mode, setMode] = useState(isSignupRoute ? 'register' : 'login');
    const [authStep, setAuthStep] = useState('password');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [otp, setOtp] = useState('');
    const [message, setMessage] = useState('');
    
    // 2FA login states
    const [is2FaStep, setIs2FaStep] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorUserId, setTwoFactorUserId] = useState(null);

    const [attemptsRemaining, setAttemptsRemaining] = useState(null);
    const [passwordLocked, setPasswordLocked] = useState(false);
    const [pendingKeys, setPendingKeys] = useState(null);
    const [pendingRecoveryCode, setPendingRecoveryCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const { login, token } = useContext(AuthContext);
    const navigate = useNavigate();

    React.useEffect(() => {
        if (token) {
            const pendingNav = sessionStorage.getItem('pending_nav');
            if (pendingNav) {
                sessionStorage.removeItem('pending_nav');
                navigate(pendingNav);
            } else {
                navigate('/');
            }
        }
    }, [token, navigate]);

    React.useEffect(() => {
        if (!new URLSearchParams(window.location.search).has('google')) return;
        let cancelled = false;
        const finishGoogleCallback = async () => {
            setGoogleLoading(true);
            try {
                const supabase = await getSupabaseClient();
                const code = new URLSearchParams(window.location.search).get('code');
                const authResult = code
                    ? await supabase.auth.exchangeCodeForSession(code)
                    : await supabase.auth.getSession();
                if (authResult.error) throw authResult.error;
                const session = authResult.data.session;
                if (!session?.access_token) throw new Error('Google session was not returned');
                const response = await axios.post('/api/auth/google/exchange', {
                    accessToken: session.access_token,
                    deviceFingerprint,
                });
                window.history.replaceState({}, '', '/login');
                if (cancelled) return;
                if (response.data.onboardingRequired) {
                    const keys = await generateKeys();
                    const recoveryCode = generateRecoveryCode();
                    const encryptedRecoveryKey = await protectPrivateKeyWithPassword(keys.privateKeyString, recoveryCode);
                    const completed = await axios.post('/api/auth/google/complete', {
                        accessToken: session.access_token,
                        phone: null,
                        useGoogleAvatar: Boolean(response.data.googleAvatarUrl),
                        publicKey: keys.publicKeyString,
                        encryptedRecoveryKey,
                        deviceFingerprint,
                    });
                    await finishLogin(completed.data.user, null, keys, false, null, recoveryCode, completed.data.csrfToken, completed.data.recoveryKeyBackup);
                } else {
                    await finishLogin(response.data.user, null, null, false, response.data.keyBackup, '', response.data.csrfToken, response.data.recoveryKeyBackup);
                }
            } catch (error) {
                window.history.replaceState({}, '', '/login');
                if (!cancelled) {
                    setMode('login');
                    setAuthOpen(true);
                    setMessage(error.response?.data?.error || error.message || 'Google sign-in failed');
                }
            } finally {
                if (!cancelled) setGoogleLoading(false);
            }
        };
        finishGoogleCallback();
        return () => { cancelled = true; };
    }, []);

    const isLogin = mode === 'login';
    const isRegister = mode === 'register';
    const isReset = mode === 'reset';
    const isOtpStep = authStep === 'otp';

    const cleanEmail = email.trim().toLowerCase();
    const deviceFingerprint = getDeviceFingerprint();

    const resetFlow = (nextMode) => {
        setAuthOpen(true);
        setMode(nextMode);
        setAuthStep('password');
        setPassword('');
        setOtp('');
        setMessage('');
        setAttemptsRemaining(null);
        setPasswordLocked(false);
        setPendingKeys(null);
        setPendingRecoveryCode('');
        setIs2FaStep(false);
        setTwoFactorCode('');
        setTwoFactorUserId(null);
    };

    const changeSiteLanguage = (nextLanguage) => {
        setSiteLanguage(nextLanguage);
        localStorage.setItem('cheetchat-marketing-language', nextLanguage);
        window.dispatchEvent(new CustomEvent('cheetchat-language-change', { detail: nextLanguage }));
    };

    const finishLogin = async (userData, authToken, keysToStore = null, needsProfileSetup = false, keyBackup = null, recoveryCode = '', csrfToken = null, recoveryKeyBackup = null) => {
        if (csrfToken) sessionStorage.setItem('cheetchat_csrf_token', csrfToken);
        if (keysToStore) {
            await saveDevicePrivateKey(userData.id, keysToStore.privateKeyString);
            localStorage.setItem(`pubKey_${userData.id}`, keysToStore.publicKeyString);
        } else {
            let devicePrivateKey = await loadDevicePrivateKey(userData.id);
            if (!devicePrivateKey && keyBackup && password) {
                try {
                    devicePrivateKey = await restorePrivateKeyWithPassword(keyBackup, password);
                } catch (error) {
                    console.warn('Password key restore failed; recovery code is required.', error);
                }
            }
            if (!devicePrivateKey && recoveryKeyBackup) {
                const enteredRecoveryCode = window.prompt('Enter your CHEETCHAT recovery code to restore encrypted chats on this device:');
                if (enteredRecoveryCode?.trim()) {
                    try {
                        devicePrivateKey = await restorePrivateKeyWithPassword(recoveryKeyBackup, enteredRecoveryCode.trim());
                    } catch {
                        throw new Error('The recovery code is incorrect. Your account was not opened without its chat key.');
                    }
                }
            }
            if (devicePrivateKey) {
                await saveDevicePrivateKey(userData.id, devicePrivateKey);
                if (userData.publicKey) localStorage.setItem(`pubKey_${userData.id}`, userData.publicKey);
                if (!keyBackup && password && authToken) {
                    const encryptedPrivateKey = await protectPrivateKeyWithPassword(devicePrivateKey, password);
                    await axios.post('/api/user/key-backup', { encryptedPrivateKey }, { headers: { Authorization: `Bearer ${authToken}` } });
                }
            } else if (userData.publicKey) {
                throw new Error('This device needs your CHEETCHAT recovery code before encrypted chats can be opened.');
            }
        }
        if (recoveryCode) {
            sessionStorage.setItem('recovery_code_once', recoveryCode);
            sessionStorage.setItem('pending_nav', '/recovery-code');
        } else if (needsProfileSetup) {
            sessionStorage.setItem('pending_nav', '/setup-profile');
        }
        login(userData, authToken, csrfToken);
    };

    const handlePhoneChange = (e) => {
        setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
    };

    const startGoogleLogin = async () => {
        setGoogleLoading(true);
        setMessage('');
        try {
            const supabase = await getSupabaseClient();
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/login?google=callback`,
                    queryParams: { prompt: 'select_account' },
                },
            });
            if (error) throw error;
        } catch (error) {
            setMode('login');
            setAuthOpen(true);
            setMessage(error.message || 'Could not open Google Sign-In');
            setGoogleLoading(false);
        }
    };

    const handleOtpRequest = async () => {
        if (!cleanEmail) {
            alert('Email address is required');
            return;
        }
        setSubmitting(true);
        try {
            const res = await axios.post('/api/login/request-otp', { email: cleanEmail });
            setAuthStep('otp');
            setMessage(res.data.message || 'OTP sent to email');
        } catch (err) {
            alert(err.response?.data?.error || 'Unable to send OTP');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const cleanPhone = phone.replace(/\D/g, '');
        setMessage('');
        setSubmitting(true);

        if (isRegister && !isOtpStep && cleanPhone.length !== 10) {
            alert('Phone number must be exactly 10 digits');
            setSubmitting(false);
            return;
        }

        try {
            if (is2FaStep) {
                const res = await axios.post('/api/auth/2fa/login-verify', {
                    userId: twoFactorUserId,
                    token: twoFactorCode,
                    deviceFingerprint
                });
                await finishLogin(res.data.user, res.data.token, null, false, res.data.keyBackup, '', res.data.csrfToken, res.data.recoveryKeyBackup);
                return;
            }

            if (isLogin && isOtpStep) {
                const res = await axios.post('/api/login/verify-otp', { email: cleanEmail, otp, deviceFingerprint });
                await finishLogin(res.data.user, res.data.token, null, false, res.data.keyBackup, '', res.data.csrfToken, res.data.recoveryKeyBackup);
                return;
            }

            if (isLogin) {
                const res = await axios.post('/api/login', { email: cleanEmail, password, deviceFingerprint });
                if (res.data.twoFactorRequired) {
                    setTwoFactorUserId(res.data.userId);
                    setIs2FaStep(true);
                    setAuthStep('2fa');
                    setMessage(res.data.message || `Enter the email code sent to ${res.data.maskedEmail || 'your registered email'}`);
                    setSubmitting(false);
                    return;
                }
                await finishLogin(res.data.user, res.data.token, null, false, res.data.keyBackup, '', res.data.csrfToken, res.data.recoveryKeyBackup);
                return;
            }

            if (isRegister && isOtpStep) {
                const res = await axios.post('/api/register/verify-otp', { email: cleanEmail, otp, deviceFingerprint });
                await finishLogin(res.data.user, res.data.token, pendingKeys, res.data.needsProfileSetup ?? true, res.data.keyBackup, pendingRecoveryCode, res.data.csrfToken, res.data.recoveryKeyBackup);
                return;
            }

            if (isRegister) {
                const keys = await generateKeys();
                const recoveryCode = generateRecoveryCode();
                const encryptedPrivateKey = await protectPrivateKeyWithPassword(keys.privateKeyString, password);
                const encryptedRecoveryKey = await protectPrivateKeyWithPassword(keys.privateKeyString, recoveryCode);
                const res = await axios.post('/api/register', {
                    username: username.trim(),
                    email: cleanEmail,
                    phone: cleanPhone,
                    password,
                    publicKey: keys.publicKeyString,
                    encryptedPrivateKey,
                    encryptedRecoveryKey,
                    referralCode: referralCode.trim().toUpperCase()
                });
                setPendingKeys(keys);
                setPendingRecoveryCode(recoveryCode);
                setAuthStep('otp');
                setMessage(res.data.message || 'OTP sent to email');
                return;
            }

            const res = await axios.post('/api/forgot-password', { email: cleanEmail });

            resetFlow('login');
            setMessage(res.data.message || 'Password reset link sent to your email.');
        } catch (err) {
            const data = err.response?.data || {};
            if (data.otpRequired) {
                setAuthStep('otp');
                setPasswordLocked(Boolean(data.passwordLocked));
                setAttemptsRemaining(data.attemptsRemaining ?? null);
                setMessage(data.error || 'OTP sent to email');
                return;
            }
            if (typeof data.attemptsRemaining === 'number') {
                setAttemptsRemaining(data.attemptsRemaining);
            }
            alert(data.error || err.message || 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    const title = isLogin ? 'Welcome back' : isRegister ? 'Create your account' : 'Reset password';
    const helperText = isOtpStep
        ? `Enter the OTP sent to ${cleanEmail || 'your email'}`
        : isLogin
            ? 'Use your password, or continue with a secure email OTP.'
            : isRegister
                ? 'Verify your email with OTP before your account is activated.'
                : 'Enter your email and we will send a secure password reset link.';
    const submitLabel = isOtpStep ? 'Verify OTP' : isLogin ? 'Log in' : isRegister ? 'Create account' : 'Send reset link';

    return (
        <div className="h-[100dvh] overflow-y-auto overscroll-contain bg-[#08090b] text-signal-text scroll-smooth">
            <header className="auth-header">
                <a href="#auth-top" className="auth-header-brand"><img src="/cheetchat-logo.png" alt="CHEETCHAT logo"/><span>CHEET<strong>CHAT</strong></span></a>
                <nav className="auth-header-nav"><a href="#features">Features</a><a href="#security">Security</a><a href="/founder">Founder</a><a href="#projects">Projects</a><a href="#pricing">Pricing</a><a href="#legal">Legal</a></nav>
                <div className="auth-header-actions">
                    <div className="auth-language" aria-label="Website language"><button type="button" className={siteLanguage === 'en' ? 'active' : ''} onClick={() => changeSiteLanguage('en')}>EN</button><button type="button" className={siteLanguage === 'hi' ? 'active' : ''} onClick={() => changeSiteLanguage('hi')}>हिं</button></div>
                    <a href="/login?mode=login" className={`auth-header-login ${authOnly && (isLogin || isReset) ? 'active' : ''}`}>Log in</a>
                    <a href="/signup" className={`auth-header-signup ${authOnly && isRegister ? 'active' : ''}`}>Sign up</a>
                    <button type="button" onClick={startGoogleLogin} disabled={googleLoading} className="auth-header-google" aria-label="Continue with Google">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.4-4H3.3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.6 14a6 6 0 0 1 0-3.9V7.5H3.3a10 10 0 0 0 0 9.1L6.6 14Z"/><path fill="#EA4335" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.7 5.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z"/></svg>
                        <span>{googleLoading ? 'Connecting…' : 'Continue with Google'}</span>
                    </button>
                </div>
            </header>
            <section id="auth-top" className="auth-stage">
            {!authOpen && <div className="auth-welcome">
                <div className="auth-welcome-copy">
                    <span className="auth-welcome-badge">🇮🇳 Super All-in-One Platform · Made in India</span>
                    <h1>Chat. Create. Connect.<br/><strong>Everything in one place.</strong></h1>
                    <p>Private messaging, social communities, reels, HD calls, Indian-language translation and intelligent AI tools—built for students, creators and businesses.</p>
                    <div className="auth-welcome-actions">
                        <a href="/signup" className="auth-welcome-primary">Create free account</a>
                        <a href="/login?mode=login" className="auth-welcome-secondary">Log in</a>
                    </div>
                    <a href="https://github.com/Amiteshyadav3333/CHIETCHAT-ANDROID/releases/tag/v1.0.0" target="_blank" rel="noopener noreferrer" className="android-download-link">
                        <span className="android-mark">↧</span><span><small>DOWNLOAD THE ANDROID APP</small><strong>CHEETCHAT v1.0.0</strong></span><b>Get app ↗</b>
                    </a>
                </div>
                <div className="auth-google-center">
                    <div className="auth-preview-stack" aria-hidden="true"><div className="auth-preview-phone preview-back"><img src="/marketing/social.jpg" alt=""/></div><div className="auth-preview-phone preview-front"><img src="/marketing/chat.jpg" alt=""/></div><div className="auth-preview-glow"/></div>
                    <div className="auth-google-card">
                        <div className="auth-google-logo"><img src="/cheetchat-logo.png" alt="CHEETCHAT"/></div>
                        <span>Fast, secure account access</span>
                        <h2>Enter CHEETCHAT</h2>
                        <p>One account for private chat, social, reels, calls, AI and creator tools.</p>
                        <button type="button" onClick={startGoogleLogin} disabled={googleLoading} className="auth-main-google">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.4-4H3.3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.6 14a6 6 0 0 1 0-3.9V7.5H3.3a10 10 0 0 0 0 9.1L6.6 14Z"/><path fill="#EA4335" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.7 5.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z"/></svg>
                            {googleLoading ? 'Connecting…' : 'Continue with Google'}
                        </button>
                        <div className="auth-trust-mini"><span>✓ Verified access</span><span>✓ Private by design</span></div>
                    </div>
                </div>
            </div>}
            {authOpen && <div className="auth-panel-wrap">
            <a href="/login" className="auth-panel-close" aria-label="Close authentication">×</a>
            <div className="grid w-full max-w-5xl shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#121418] shadow-2xl md:grid-cols-[0.95fr_1.05fr]">
                <div className="hidden min-h-[640px] border-r border-white/10 bg-[#0d1117] p-8 md:flex md:flex-col md:justify-between">
                    <div>
                        <div className="mb-10 flex items-center gap-3">
                            <img src="/cheetchat-logo.png" alt="CHEETCHAT logo" className="h-11 w-11 rounded-lg object-cover" />
                            <div>
                                <h1 className="text-2xl font-bold tracking-normal">CHEETCHAT</h1>
                                <p className="text-sm text-gray-400">Super All-in-One Platform</p>
                            </div>
                        </div>
                        <div className="space-y-5">
                            <h2 className="text-4xl font-semibold leading-tight tracking-normal">
                                Private chats with verified access.
                            </h2>
                            <p className="text-base leading-7 text-gray-400">Chat, calls, payments, social and business tools—your work in one app. Designed and developed in India 🇮🇳.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <p className="font-semibold text-white">Email OTP</p>
                            <p className="mt-1 text-gray-400">Verify before login</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <p className="font-semibold text-white">3 attempts</p>
                            <p className="mt-1 text-gray-400">Then OTP unlock</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8">
                    <div className="mb-7 md:hidden">
                        <img src="/cheetchat-logo.png" alt="CHEETCHAT logo" className="mb-3 h-11 w-11 rounded-lg object-cover" />
                        <h1 className="text-3xl font-bold tracking-normal">CHEETCHAT</h1>
                        <p className="text-sm text-gray-400">Super All-in-One Platform · Made in India</p>
                    </div>

                    <div className="mb-6 grid grid-cols-2 rounded-lg bg-[#0c0f14] p-1">
                        <a
                            href="/login?mode=login"
                            className={`rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${isLogin || isReset ? 'bg-signal-accent text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Login
                        </a>
                        <a
                            href="/signup"
                            className={`rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${isRegister ? 'bg-signal-accent text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Sign up
                        </a>
                    </div>

                    <div className="mb-6">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-signal-accent/15 text-signal-accent">
                            {isRegister ? <UserPlusIcon className="h-6 w-6" /> : isOtpStep ? <KeyIcon className="h-6 w-6" /> : <LockClosedIcon className="h-6 w-6" />}
                        </div>
                        <h2 className="text-2xl font-bold tracking-normal">{title}</h2>
                        <p className="mt-2 text-sm leading-6 text-gray-400">{helperText}</p>
                    </div>

                    {message && (
                        <div className="mb-4 rounded-lg border border-signal-accent/40 bg-signal-accent/10 px-4 py-3 text-sm text-signal-text">
                            {message}
                        </div>
                    )}

                    {!isReset && !isOtpStep && !is2FaStep && <><button type="button" onClick={startGoogleLogin} disabled={googleLoading} className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white px-4 py-3 font-bold text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"><svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.4-4H3.3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.6 14a6 6 0 0 1 0-3.9V7.5H3.3a10 10 0 0 0 0 9.1L6.6 14Z"/><path fill="#EA4335" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.7 5.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z"/></svg>{googleLoading ? 'Connecting…' : 'Continue with Google'}</button><div className="mb-4 flex items-center gap-3"><span className="h-px flex-1 bg-white/10"/><span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">or use email</span><span className="h-px flex-1 bg-white/10"/></div></>}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isRegister && !isOtpStep && (
                            <input
                                type="text"
                                placeholder="Full Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-signal-input px-4 py-3 text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30"
                                required
                            />
                        )}
                        {isRegister && !isOtpStep && <input type="text" placeholder="Referral coupon (optional)" value={referralCode} onChange={e => setReferralCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 16))} className="w-full rounded-lg border border-violet-400/20 bg-signal-input px-4 py-3 uppercase text-white outline-none transition focus:border-violet-400" />}
                        <div className="relative">
                            <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                            <input
                                type="email"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-signal-input py-3 pl-11 pr-4 text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isOtpStep}
                                required
                            />
                        </div>
                        {isRegister && !isOtpStep && (
                            <input
                                type="text"
                                placeholder="Phone number"
                                value={phone}
                                onChange={handlePhoneChange}
                                inputMode="numeric"
                                pattern="\d{10}"
                                maxLength={10}
                                className="w-full rounded-lg border border-white/10 bg-signal-input px-4 py-3 text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30"
                                required
                            />
                        )}
                        {is2FaStep ? (
                            <input
                                type="text"
                                placeholder="Email security code"
                                value={twoFactorCode}
                                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                maxLength={6}
                                className="w-full rounded-lg border border-white/10 bg-signal-input px-4 py-3 text-center text-xl font-semibold text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30"
                                required
                            />
                        ) : !isOtpStep && !isReset && (
                            <div>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-lg border border-white/10 bg-signal-input px-4 py-3 text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={passwordLocked}
                                    required
                                    minLength={undefined}
                                />
                                {isLogin && attemptsRemaining !== null && !passwordLocked && (
                                    <p className="mt-2 text-xs text-yellow-300">
                                        {attemptsRemaining} password attempt{attemptsRemaining === 1 ? '' : 's'} remaining
                                    </p>
                                )}
                            </div>
                        )}
                        {isOtpStep && (
                            <input
                                type="text"
                                placeholder="Email OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                maxLength={6}
                                className="w-full rounded-lg border border-white/10 bg-signal-input px-4 py-3 text-center text-xl font-semibold text-white outline-none transition focus:border-signal-accent focus:ring-2 focus:ring-signal-accent/30"
                                required
                            />
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-accent py-3 font-bold text-white transition-colors hover:bg-signal-accentHover disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {submitting ? 'Please wait...' : submitLabel}
                        </button>
                    </form>

                    <div className="mt-6 flex flex-col items-center gap-3 text-center">
                        {isLogin && !isOtpStep && (
                            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={handleOtpRequest}
                                    disabled={submitting}
                                    className="rounded-lg border border-signal-accent/50 px-4 py-2.5 text-sm font-semibold text-signal-accent transition hover:bg-signal-accent/10 disabled:opacity-60"
                                >
                                    Login with OTP
                                </button>
                                <button
                                    type="button"
                                    onClick={() => resetFlow('reset')}
                                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-signal-accent/50 hover:text-white"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}
                        {isOtpStep && (
                            <button
                                type="button"
                                onClick={() => resetFlow(isRegister ? 'register' : 'login')}
                                className="text-sm font-semibold text-signal-accent hover:underline"
                            >
                                Change details
                            </button>
                        )}
                        {!isOtpStep && !isLogin && <a href="/login?mode=login" className="text-sm font-semibold text-signal-accent hover:underline">Back to login</a>}
                    </div>
                </div>
            </div>
            </div>}
            <a href="#features" className="auth-scroll-cue" aria-label="Explore CHEETCHAT features"><span>Explore CHEETCHAT</span><b>↓</b></a>
            </section>
            {!authOnly && <MarketingLanding />}
        </div>
    );
};

export default Login;
