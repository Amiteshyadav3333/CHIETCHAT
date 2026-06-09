import React, { useState, useContext, useRef, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    CameraIcon,
    UserCircleIcon,
    ArrowRightIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';

const ProfileSetup = () => {
    const { user, token, updateUser } = useContext(AuthContext);
    const navigate = useNavigate();

    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const avatarInputRef = useRef(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (user?.profileSetupDone) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        setError('');
        setSubmitting(true);
        try {
            const formData = new FormData();
            if (avatarFile) {
                formData.append('avatar', avatarFile);
            }
            const res = await axios.post('/api/user/setup-profile', formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                }
            });
            updateUser(res.data.user);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#07090c] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            <div className="relative w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
                        <ShieldCheckIcon className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">CHIETCHAT</span>
                </div>

                <div className="mb-6 text-center">
                    <h2 className="text-sm font-medium text-violet-400 tracking-wider uppercase mb-1">Welcome, {user?.username || 'there'}!</h2>
                    <p className="text-xs text-gray-500">One last step — add a profile photo</p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden">
                    <div className="border-b border-white/[0.06] bg-white/[0.02] px-7 pt-7 pb-6">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 text-violet-400">
                            <CameraIcon className="h-7 w-7" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Add a profile photo</h1>
                        <p className="mt-1.5 text-sm leading-relaxed text-gray-400">Add a photo so your friends can recognize you</p>
                    </div>

                    <div className="px-7 py-6 space-y-6">
                        <div className="flex flex-col items-center gap-5">
                            <div className="relative group">
                                <div
                                    onClick={() => avatarInputRef.current?.click()}
                                    className="h-36 w-36 rounded-full overflow-hidden border-[3px] border-white/10 cursor-pointer ring-4 ring-violet-500/0 transition-all duration-300 hover:ring-violet-500/30 hover:border-violet-500/40 hover:scale-105"
                                >
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="h-full w-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                                            <UserCircleIcon className="h-24 w-24 text-gray-600" />
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => avatarInputRef.current?.click()}
                                    className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 border-[3px] border-[#07090c] shadow-lg hover:from-violet-500 hover:to-indigo-500 transition-all hover:scale-110"
                                >
                                    <CameraIcon className="h-5 w-5 text-white" />
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
                            <div className="text-center">
                                {avatarFile ? (
                                    <div className="space-y-1">
                                        <p className="text-sm text-emerald-400 font-medium">✓ Photo selected</p>
                                        <button
                                            onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                                            className="text-xs text-red-400/80 hover:text-red-400 transition"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Tap the photo to add a picture</p>
                                )}
                            </div>
                        </div>

                        {/* Your ID info */}
                        <div className="rounded-xl border border-violet-500/15 bg-violet-500/5 px-4 py-3 flex items-start gap-3">
                            <CheckBadgeIcon className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs text-gray-400">Your CHIETCHAT ID</p>
                                <p className="text-sm font-bold text-white mt-0.5">@{user?.platformId || '...'}</p>
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <button
                            id="finish-profile-btn"
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <>
                                    <div className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                    Setting up…
                                </>
                            ) : (
                                <>
                                    <ArrowRightIcon className="h-5 w-5" />
                                    {avatarFile ? 'Get Started' : 'Skip & Get Started'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileSetup;
