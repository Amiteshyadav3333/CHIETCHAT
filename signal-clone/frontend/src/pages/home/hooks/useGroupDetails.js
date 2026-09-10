import { useState, useCallback } from 'react';
import axios from 'axios';

export const useGroupDetails = ({ token, visibleActiveChat, fetchChats, setActiveChat, setChats, setShowSearchModal }) => {
    const [searchModalTab, setSearchModalTab] = useState('search_user'); // 'search_user' | 'create_group' | 'discover_groups'
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupIsPublic, setNewGroupIsPublic] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState('');
    const [discoveredGroups, setDiscoveredGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupRequests, setGroupRequests] = useState([]);

    const fetchGroupRequests = useCallback(async (chatId) => {
        if (!token || !chatId) return;
        try {
            const res = await axios.get(`/api/groups/${chatId}/requests`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setGroupRequests(res.data);
        } catch (err) {
            console.error("Error fetching group requests", err);
        }
    }, [token]);

    const fetchPublicGroups = useCallback(async () => {
        if (!token) return;
        setLoadingGroups(true);
        try {
            const res = await axios.get('/api/groups/public', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDiscoveredGroups(res.data);
        } catch (err) {
            console.error("Error fetching public groups", err);
        } finally {
            setLoadingGroups(false);
        }
    }, [token]);

    const handleRespondRequest = useCallback(async (reqId, action) => {
        if (!token || !visibleActiveChat) return;
        try {
            await axios.post(`/api/groups/requests/${reqId}/respond`, { action }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchGroupRequests(visibleActiveChat.id);
            if (fetchChats) await fetchChats();
        } catch (err) {
            console.error("Error responding to request", err);
            alert(err.response?.data?.error || "Action failed");
        }
    }, [token, visibleActiveChat, fetchGroupRequests, fetchChats]);

    const handleToggleMuteGroup = useCallback(async () => {
        if (!token || !visibleActiveChat) return;
        try {
            const res = await axios.post(`/api/groups/${visibleActiveChat.id}/toggle-chat`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (setChats) setChats(prev => prev.map(c => c.id === visibleActiveChat.id ? { ...c, isChatDisabled: res.data.isChatDisabled } : c));
            if (setActiveChat) setActiveChat(prev => prev && prev.id === visibleActiveChat.id ? { ...prev, isChatDisabled: res.data.isChatDisabled } : prev);
        } catch (err) {
            console.error("Error toggling group chat mute", err);
            alert(err.response?.data?.error || "Action failed");
        }
    }, [token, visibleActiveChat, setChats, setActiveChat]);

    const handleSearchGroups = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (!token) return;
        if (!groupSearchQuery.trim()) {
            fetchPublicGroups();
            return;
        }
        setLoadingGroups(true);
        try {
            const res = await axios.post('/api/groups/search', { query: groupSearchQuery }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDiscoveredGroups(res.data);
        } catch (err) {
            console.error("Error searching groups", err);
        } finally {
            setLoadingGroups(false);
        }
    }, [token, groupSearchQuery, fetchPublicGroups]);

    const handleJoinGroup = useCallback(async (group) => {
        if (!token) return;
        try {
            const res = await axios.post(`/api/groups/${group.id}/join`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.joined) {
                const updatedChats = await fetchChats();
                const newChat = updatedChats.find(chat => chat.id === group.id);
                if (newChat && setActiveChat) setActiveChat(newChat);
                if (setShowSearchModal) setShowSearchModal(false);
            } else if (res.data.pending) {
                alert("Request to join private group sent to the admin.");
                setDiscoveredGroups(prev => prev.map(g => g.id === group.id ? { ...g, hasPendingRequest: true } : g));
            }
        } catch (err) {
            console.error("Error joining group", err);
            alert(err.response?.data?.error || "Failed to join group");
        }
    }, [token, fetchChats, setActiveChat, setShowSearchModal]);

    const handleCreateGroup = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (!newGroupName.trim() || !token) {
            alert("Group name is required");
            return;
        }
        try {
            const res = await axios.post('/api/groups/create', {
                name: newGroupName,
                isPublic: newGroupIsPublic
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const updatedChats = await fetchChats();
            const newChat = updatedChats.find(chat => chat.id === res.data.id);
            if (newChat && setActiveChat) setActiveChat(newChat);
            setNewGroupName('');
            setNewGroupIsPublic(false);
            if (setShowSearchModal) setShowSearchModal(false);
        } catch (err) {
            console.error("Error creating group", err);
            alert(err.response?.data?.error || "Failed to create group");
        }
    }, [newGroupName, newGroupIsPublic, token, fetchChats, setActiveChat, setShowSearchModal]);

    return {
        searchModalTab, setSearchModalTab,
        newGroupName, setNewGroupName,
        newGroupIsPublic, setNewGroupIsPublic,
        groupSearchQuery, setGroupSearchQuery,
        discoveredGroups, setDiscoveredGroups,
        loadingGroups, setLoadingGroups,
        groupRequests, setGroupRequests,
        fetchGroupRequests,
        fetchPublicGroups,
        handleRespondRequest,
        handleToggleMuteGroup,
        handleSearchGroups,
        handleJoinGroup,
        handleCreateGroup,
    };
};
