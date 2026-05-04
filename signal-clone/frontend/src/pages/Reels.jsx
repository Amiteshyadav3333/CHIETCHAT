import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import ReelCard from '../components/ReelCard';
import { AuthContext } from '../context/AuthContext';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import ReelUploader from '../components/ReelUploader';
import ReelProfile from '../components/ReelProfile';
import ReelReactor from '../components/ReelReactor';

const Reels = ({ onBack, onShareToChat }) => {
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('foryou'); // 'foryou' | 'following'
    const [showUploader, setShowUploader] = useState(false);
    const [selectedProfileUserId, setSelectedProfileUserId] = useState(null);
    const [reactingToReel, setReactingToReel] = useState(null);
    const { user, token } = useContext(AuthContext);

    const fetchReels = async (f = filter) => {
        try {
            const res = await axios.get(`/api/reels?filter=${f}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setReels(res.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        setLoading(true);
        fetchReels(filter);
    }, [token, filter]);

    if (loading) {
        return (
            <div className="h-full w-full bg-black flex flex-col items-center justify-center text-white">
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
                <p className="animate-pulse">Loading Reels...</p>
            </div>
        );
    }

    if (selectedProfileUserId) {
        return (
            <ReelProfile 
                userId={selectedProfileUserId} 
                onBack={() => setSelectedProfileUserId(null)}
                onSelectReel={(reel) => {
                    // Logic to show specific reel (can be improved later)
                    setSelectedProfileUserId(null);
                }}
            />
        );
    }

    return (
        <div className="h-full w-full bg-black relative overflow-hidden flex flex-col">
            {/* Top Navigation */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
                <button onClick={onBack} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="flex gap-6">
                    <button 
                        onClick={() => setFilter('foryou')}
                        className={`font-bold text-lg transition-all ${filter === 'foryou' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}
                    >
                        For You
                    </button>
                    <button 
                        onClick={() => setFilter('following')}
                        className={`font-bold text-lg transition-all ${filter === 'following' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}
                    >
                        Following
                    </button>
                </div>
                <button onClick={() => setShowUploader(true)} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                    <PlusIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Scroll Container */}
            <div className="flex-1 overflow-y-auto snap-y snap-mandatory hide-scrollbar">
                {reels.length > 0 ? (
                    reels.map(reel => (
                        <ReelCard 
                            key={reel.id} 
                            reel={reel} 
                            currentUser={user} 
                            onShare={onShareToChat}
                            onProfileClick={(uid) => setSelectedProfileUserId(uid)}
                            onReact={(r) => setReactingToReel(r)}
                            onDelete={(id) => setReels(prev => prev.filter(r => r.id !== id))}
                        />
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-white px-8 text-center gap-4">
                        <p className="text-xl font-bold">No reels yet</p>
                        <p className="text-gray-400 text-sm">Be the first one to post a video!</p>
                        <button 
                            onClick={() => setShowUploader(true)}
                            className="bg-white text-black px-6 py-2 rounded-full font-bold"
                        >
                            Create Reel
                        </button>
                    </div>
                )}
            </div>

            {showUploader && (
                <ReelUploader 
                    onClose={() => setShowUploader(false)} 
                    onSuccess={() => { setShowUploader(false); fetchReels(); }}
                />
            )}

            {reactingToReel && (
                <ReelReactor 
                    originalReel={reactingToReel}
                    onClose={() => setReactingToReel(null)}
                    onSuccess={() => { setReactingToReel(null); fetchReels(); }}
                />
            )}

            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes slide-up {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up { animation: slide-up 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default Reels;
