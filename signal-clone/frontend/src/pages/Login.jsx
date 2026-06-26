import React, { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { generateKeys } from '../utils/encryption';
import { EnvelopeIcon, KeyIcon, LockClosedIcon, ShieldCheckIcon, UserPlusIcon } from '@heroicons/react/24/outline';

const Login = () => {
    const [mode, setMode] = useState('login');
    const [authStep, setAuthStep] = useState('password');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [message, setMessage] = useState('');
    
    // 2FA login states
    const [is2FaStep, setIs2FaStep] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorUserId, setTwoFactorUserId] = useState(null);

    const [attemptsRemaining, setAttemptsRemaining] = useState(null);
    const [passwordLocked, setPasswordLocked] = useState(false);
    const [pendingKeys, setPendingKeys] = useState(null);
    const [submitting, setSubmitting] = useState(false);
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

    const isLogin = mode === 'login';
    const isRegister = mode === 'register';
    const isReset = mode === 'reset';
    const isOtpStep = authStep === 'otp';

    const cleanEmail = email.trim().toLowerCase();

    const resetFlow = (nextMode) => {
        setMode(nextMode);
        setAuthStep('password');
        setPassword('');
        setOtp('');
        setMessage('');
        setAttemptsRemaining(null);
        setPasswordLocked(false);
        setPendingKeys(null);
        setIs2FaStep(false);
        setTwoFactorCode('');
        setTwoFactorUserId(null);
    };

    const finishLogin = (userData, authToken, keysToStore = null, needsProfileSetup = false) => {
        if (keysToStore) {
            localStorage.setItem(`privKey_${userData.id}`, keysToStore.privateKeyString);
            localStorage.setItem(`pubKey_${userData.id}`, keysToStore.publicKeyString);
        }
        if (needsProfileSetup) {
            sessionStorage.setItem('pending_nav', '/setup-profile');
        }
        login(userData, authToken);
    };

    const handlePhoneChange = (e) => {
        setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
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
                    token: twoFactorCode
                });
                finishLogin(res.data.user, res.data.token);
                return;
            }

            if (isLogin && isOtpStep) {
                const res = await axios.post('/api/login/verify-otp', { email: cleanEmail, otp });
                finishLogin(res.data.user, res.data.token);
                return;
            }

            if (isLogin) {
                const res = await axios.post('/api/login', { email: cleanEmail, password });
                if (res.data.twoFactorRequired) {
                    setTwoFactorUserId(res.data.userId);
                    setIs2FaStep(true);
                    setAuthStep('2fa');
                    setMessage('Please enter your 2-Factor Authentication Code');
                    setSubmitting(false);
                    return;
                }
                finishLogin(res.data.user, res.data.token);
                return;
            }

            if (isRegister && isOtpStep) {
                const res = await axios.post('/api/register/verify-otp', { email: cleanEmail, otp });
                finishLogin(res.data.user, res.data.token, pendingKeys, res.data.needsProfileSetup || true);
                return;
            }

            if (isRegister) {
                const keys = await generateKeys();
                const res = await axios.post('/api/register', {
                    username: username.trim(),
                    email: cleanEmail,
                    phone: cleanPhone,
                    password,
                    publicKey: keys.publicKeyString
                });
                setPendingKeys(keys);
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
            alert(data.error || 'An error occurred');
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
        <div className="min-h-[100dvh] bg-[#08090b] text-signal-text flex items-center justify-center p-4">
            <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#121418] shadow-2xl md:grid-cols-[0.95fr_1.05fr]">
                <div className="hidden min-h-[640px] border-r border-white/10 bg-[#0d1117] p-8 md:flex md:flex-col md:justify-between">
                    <div>
                        <div className="mb-10 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-signal-accent">
                                <ShieldCheckIcon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-normal">CHEETCHAT</h1>
                                <p className="text-sm text-gray-400">Secure Messenger</p>
                            </div>
                        </div>
                        <div className="space-y-5">
                            <h2 className="text-4xl font-semibold leading-tight tracking-normal">
                                Private chats with verified access.
                            </h2>
                            <p className="text-base leading-7 text-gray-400">
                                Email OTP verification protects new accounts, and password lockout switches users to OTP after repeated failed attempts.
                            </p>
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
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-signal-accent">
                            <ShieldCheckIcon className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-normal">CHEETCHAT</h1>
                        <p className="text-sm text-gray-400">Secure Messenger</p>
                    </div>

                    <div className="mb-6 grid grid-cols-2 rounded-lg bg-[#0c0f14] p-1">
                        <button
                            type="button"
                            onClick={() => resetFlow('login')}
                            className={`rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${isLogin || isReset ? 'bg-signal-accent text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Login
                        </button>
                        <button
                            type="button"
                            onClick={() => resetFlow('register')}
                            className={`rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${isRegister ? 'bg-signal-accent text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Sign up
                        </button>
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
                        {!isOtpStep && !isReset && (
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
                        {!isOtpStep && !isLogin && (
                            <button
                                type="button"
                                onClick={() => resetFlow('login')}
                                className="text-sm font-semibold text-signal-accent hover:underline"
                            >
                                Back to login
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
