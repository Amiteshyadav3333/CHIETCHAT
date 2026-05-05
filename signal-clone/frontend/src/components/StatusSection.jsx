import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { PlusIcon } from '@heroicons/react/24/solid';
import StatusViewer from './StatusViewer';
import StatusUploader from './StatusUploader';

const StatusSection = ({ user, token }) => {
    const [statusGroups, setStatusGroups] = useState([]);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const [uploaderOpen, setUploaderOpen] = useState(false);

    const fetchStatuses = useCallback(async () => {
        try {
            const res = await axios.get('/api/status', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatusGroups(res.data);
        } catch (err) {
            console.error(err);
        }
    }, [token]);

    useEffect(() => {
        fetchStatuses();
        const interval = setInterval(fetchStatuses, 30000);
        return () => clearInterval(interval);
    }, [fetchStatuses]);

    const openViewer = (index) => {
        setViewerIndex(index);
        setViewerOpen(true);
    };

    const handleDelete = (deletedId) => {
        setStatusGroups(prev => prev.map(group => ({
            ...group,
            statuses: group.statuses.filter(s => s.id !== deletedId)
        })).filter(group => group.statuses.length > 0));
    };

    const myGroup = statusGroups.find(g => g.user.id === user?.id);
    const othersGroups = statusGroups.filter(g => g.user.id !== user?.id);
    const allGroups = [...(myGroup ? [myGroup] : []), ...othersGroups];

    const hasUnviewed = (group) => group.statuses.some(s => !s.viewed);

    return (
        <>
            <div className="px-2 py-3 border-b border-gray-800">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider px-2 mb-2">Status</p>

                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                    {/* Add Status Button */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <button
                            onClick={() => setUploaderOpen(true)}
                            className="relative w-14 h-14 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 hover:border-blue-500 flex items-center justify-center transition-colors group"
                        >
                            {user?.avatar ? (
                                <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover opacity-60 group-hover:opacity-80" />
                            ) : null}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-blue-600 rounded-full p-0.5">
                                    <PlusIcon className="w-3 h-3 text-white" />
                                </div>
                            </div>
                        </button>
                        <span className="text-xs text-gray-400 truncate w-14 text-center">My Status</span>
                    </div>

                    {/* Other Status Circles */}
                    {allGroups.map((group) => {
                        const unviewed = hasUnviewed(group);
                        const isMe = group.user.id === user?.id;
                        const groupIdx = allGroups.indexOf(group);

                        return (
                            <div key={group.user.id} className="flex flex-col items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => openViewer(groupIdx)}
                                    className={`w-14 h-14 rounded-full p-0.5 ${unviewed
                                        ? 'bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500'
                                        : 'bg-gray-700'
                                        }`}
                                >
                                    <img
                                        src={group.user.avatar}
                                        alt={group.user.username}
                                        className="w-full h-full rounded-full object-cover border-2 border-gray-900"
                                    />
                                </button>
                                <span className="text-xs text-gray-400 truncate w-14 text-center">
                                    {isMe ? 'You' : group.user.username}
                                </span>
                            </div>
                        );
                    })}

                    {allGroups.length === 0 && (
                        <p className="text-xs text-gray-600 px-2 py-3">No status updates yet</p>
                    )}
                </div>
            </div>

            {viewerOpen && (
                <StatusViewer
                    statusGroups={allGroups}
                    initialGroupIndex={viewerIndex}
                    currentUserId={user?.id}
                    token={token}
                    onClose={() => setViewerOpen(false)}
                    onDelete={handleDelete}
                />
            )}

            {uploaderOpen && (
                <StatusUploader
                    token={token}
                    onClose={() => setUploaderOpen(false)}
                    onUploaded={fetchStatuses}
                />
            )}
        </>
    );
};

export default StatusSection;
