import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import ReelCard from '../components/ReelCard';
import { AuthContext } from '../context/AuthContext';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import ReelUploader from '../components/ReelUploader';

const Reels = ({ onBack, onShareToChat }) => {
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);
    const { user, token } = useContext(AuthContext);

    const fetchReels = async () => {
        try {
            const res = await axios.get('/api/reels', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setReels(res.data);
        } catch (err) { console.error(err); }
        finally { setLoading(true); } // Setting true to show initial state but wait, should be false
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await fetchReels();
            setLoading(false);
        };
        load();
    }, [token]);

    if (loading) {
        return (
            <div className="h-full w-full bg-black flex flex-col items-center justify-center text-white">
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
                <p className="animate-pulse">Loading Reels...</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-black relative overflow-hidden flex flex-col">
            {/* Top Navigation */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
                <button onClick={onBack} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <div className="flex gap-4">
                    <span className="text-white font-bold text-lg border-b-2 border-white pb-1">For You</span>
                    <span className="text-white/60 font-bold text-lg pb-1">Following</span>
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
