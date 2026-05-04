import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { ArrowLeftIcon, PlayIcon, UserCircleIcon } from '@heroicons/react/24/outline';

const ReelProfile = ({ userId, onBack, onSelectReel }) => {
    const { token, user: currentUser } = useContext(AuthContext);
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axios.get(`/api/users/${userId}/reels`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setProfileData(res.data);
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchProfile();
    }, [userId, token]);

    const toggleFollow = async () => {
        try {
            const res = await axios.post(`/api/users/${userId}/follow`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProfileData(prev => ({
                ...prev,
                user: {
                    ...prev.user,
                    isFollowing: res.data.isFollowing,
                    followerCount: res.data.isFollowing ? prev.user.followerCount + 1 : prev.user.followerCount - 1
                }
            }));
        } catch (err) { console.error(err); }
    };

    if (loading) {
        return (
            <div className="h-full w-full bg-black flex items-center justify-center text-white">
                <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!profileData) return null;

    const { user, reels } = profileData;

    return (
        <div className="h-full w-full bg-[#0f0f0f] flex flex-col animate-slide-up overflow-y-auto">
            {/* Header Navigation */}
            <div className="sticky top-0 z-30 bg-[#0f0f0f] flex items-center p-4 gap-4">
                <button onClick={onBack} className="p-2 text-white"><ArrowLeftIcon className="w-6 h-6" /></button>
                <h2 className="text-white font-bold text-lg">{user.username}</h2>
            </div>

            {/* Profile Info */}
            <div className="flex flex-col items-center px-4 py-6 gap-4">
                <img src={user.avatar} className="w-24 h-24 rounded-full border-2 border-white/10 shadow-xl object-cover" alt="" />
                <h1 className="text-white text-xl font-bold">@{user.username}</h1>
                
                <div className="flex gap-8 text-center mt-2">
                    <div>
                        <p className="text-white font-bold">{reels.length}</p>
                        <p className="text-gray-500 text-xs uppercase tracking-widest">Videos</p>
                    </div>
                    <div>
                        <p className="text-white font-bold">{user.followerCount}</p>
                        <p className="text-gray-500 text-xs uppercase tracking-widest">Followers</p>
                    </div>
                    <div>
                        <p className="text-white font-bold">{user.followingCount}</p>
                        <p className="text-gray-500 text-xs uppercase tracking-widest">Following</p>
                    </div>
                </div>

                <div className="flex gap-2 w-full max-w-xs mt-4">
                    {currentUser.id !== user.id ? (
                        <button 
                            onClick={toggleFollow}
                            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${user.isFollowing ? 'bg-gray-800 text-white' : 'bg-red-600 text-white shadow-lg shadow-red-600/20'}`}
                        >
                            {user.isFollowing ? 'Following' : 'Follow'}
                        </button>
                    ) : (
                        <button className="flex-1 py-2.5 bg-gray-800 text-white rounded-lg font-bold text-sm">Edit Profile</button>
                    )}
                    <button className="px-4 py-2.5 bg-gray-800 text-white rounded-lg"><UserCircleIcon className="w-5 h-5" /></button>
                </div>
                
                <p className="text-gray-400 text-sm mt-2 text-center px-6">Hello! Welcome to my profile. Check out my latest reels. ✨</p>
            </div>

            {/* Videos Grid */}
            <div className="grid grid-cols-3 gap-0.5 mt-4 bg-gray-900/50">
                {reels.map(reel => (
                    <div 
                        key={reel.id} 
                        className="aspect-[3/4] relative cursor-pointer group"
                        onClick={() => onSelectReel(reel)}
                    >
                        <video src={reel.videoUrl} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                        <div className="absolute bottom-2 left-2 flex items-center gap-1">
                            <PlayIcon className="w-3 h-3 text-white" />
                            <span className="text-white text-[10px] font-bold">{reel.likesCount}</span>
                        </div>
                    </div>
                ))}
            </div>

            {reels.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-600">
                    <p>No videos yet</p>
                </div>
            )}
        </div>
    );
};

export default ReelProfile;
