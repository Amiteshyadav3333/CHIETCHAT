import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
    XMarkIcon, PlusIcon, TrashIcon, CheckIcon,
    CalendarDaysIcon, ClipboardDocumentListIcon, DocumentTextIcon,
    FlagIcon, UserCircleIcon, ArrowPathIcon, ShareIcon,
    PencilSquareIcon, CheckCircleIcon, SparklesIcon,
    ArrowRightIcon
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../utils/apiBaseUrl';

const COLUMNS = [
    { id: 'todo', label: 'To Do', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
    { id: 'in_progress', label: 'In Progress', color: 'border-sky-500/30 text-sky-400 bg-sky-500/10' },
    { id: 'review', label: 'Review', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
    { id: 'done', label: 'Completed', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' }
];

const PRIORITY_BADGES = {
    urgent: { label: 'Urgent', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
    high: { label: 'High', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    medium: { label: 'Medium', bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    low: { label: 'Low', bg: 'bg-gray-700/50 text-gray-300 border-gray-600/40' }
};

export default function GroupCollaborationHub({
    chat,
    currentUser,
    token,
    socket,
    onClose,
    onShareToChat
}) {
    const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' | 'notes' | 'milestones'
    const [loading, setLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState('');

    // Tasks State
    const [tasks, setTasks] = useState([]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [filterAssignee, setFilterAssignee] = useState('all');
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        assigneeId: '',
        dueDate: ''
    });

    // Notes State
    const [notes, setNotes] = useState([]);
    const [selectedNote, setSelectedNote] = useState(null);
    const [noteTitleDraft, setNoteTitleDraft] = useState('');
    const [noteContentDraft, setNoteContentDraft] = useState('');
    const [noteSaveStatus, setNoteSaveStatus] = useState(''); // 'saving' | 'saved'

    // Milestones State
    const [milestones, setMilestones] = useState([]);
    const [showMilestoneModal, setShowMilestoneModal] = useState(false);
    const [newMilestone, setNewMilestone] = useState({
        title: '',
        description: '',
        targetDate: ''
    });

    const authHeaders = useMemo(() => ({
        headers: {
            Authorization: `Bearer ${token}`
        }
    }), [token]);

    const showToast = (msg) => {
        setActionMsg(msg);
        setTimeout(() => setActionMsg(''), 3000);
    };

    // Load Data
    const loadAll = useCallback(async () => {
        if (!chat?.id || !token) return;
        setLoading(true);
        try {
            const [tasksRes, notesRes, milestonesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/tasks`, authHeaders),
                axios.get(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/notes`, authHeaders),
                axios.get(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/milestones`, authHeaders)
            ]);
            setTasks(tasksRes.data.tasks || []);
            const fetchedNotes = notesRes.data.notes || [];
            setNotes(fetchedNotes);
            if (fetchedNotes.length > 0 && !selectedNote) {
                setSelectedNote(fetchedNotes[0]);
                setNoteTitleDraft(fetchedNotes[0].title);
                setNoteContentDraft(fetchedNotes[0].content);
            }
            setMilestones(milestonesRes.data.milestones || []);
        } catch (err) {
            console.error('Failed to fetch collaboration workspace data:', err);
        } finally {
            setLoading(false);
        }
    }, [chat?.id, token, authHeaders, selectedNote]);

    useEffect(() => {
        loadAll();
    }, [chat?.id]);

    // Socket real-time sync
    useEffect(() => {
        if (!socket || !chat?.id) return;
        const handleCollabEvent = (evt) => {
            if (String(evt.chatId) !== String(chat.id)) return;
            // Refresh collaboration data smoothly
            loadAll();
        };

        socket.on('collab_event', handleCollabEvent);
        return () => {
            socket.off('collab_event', handleCollabEvent);
        };
    }, [socket, chat?.id, loadAll]);

    // Task Actions
    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!newTask.title.trim()) return;

        try {
            const payload = {
                title: newTask.title.trim(),
                description: newTask.description.trim(),
                status: newTask.status,
                priority: newTask.priority,
                assigneeId: newTask.assigneeId ? parseInt(newTask.assigneeId) : null,
                dueDate: newTask.dueDate || null
            };
            const res = await axios.post(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/tasks`, payload, authHeaders);
            setTasks(prev => [res.data.task, ...prev]);
            setShowTaskModal(false);
            setNewTask({
                title: '',
                description: '',
                status: 'todo',
                priority: 'medium',
                assigneeId: '',
                dueDate: ''
            });
            showToast('Task added to workspace board! 🚀');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create task');
        }
    };

    const handleUpdateTaskStatus = async (taskId, nextStatus) => {
        try {
            const res = await axios.patch(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/tasks/${taskId}`, {
                status: nextStatus
            }, authHeaders);
            setTasks(prev => prev.map(t => t.id === taskId ? res.data.task : t));
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update task status');
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm('Delete this task?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/tasks/${taskId}`, authHeaders);
            setTasks(prev => prev.filter(t => t.id !== taskId));
            showToast('Task removed');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete task');
        }
    };

    // Note Actions
    const handleCreateNewNote = async () => {
        try {
            const res = await axios.post(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/notes`, {
                title: 'New Project Document',
                content: ''
            }, authHeaders);
            const created = res.data.note;
            setNotes(prev => [created, ...prev]);
            setSelectedNote(created);
            setNoteTitleDraft(created.title);
            setNoteContentDraft(created.content);
            showToast('New note created');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create note');
        }
    };

    const handleSelectNote = (n) => {
        setSelectedNote(n);
        setNoteTitleDraft(n.title);
        setNoteContentDraft(n.content);
        setNoteSaveStatus('');
    };

    const handleSaveNote = async () => {
        if (!selectedNote) return;
        setNoteSaveStatus('saving');
        try {
            const res = await axios.put(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/notes/${selectedNote.id}`, {
                title: noteTitleDraft,
                content: noteContentDraft
            }, authHeaders);
            const updated = res.data.note;
            setSelectedNote(updated);
            setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
            setNoteSaveStatus('saved');
            setTimeout(() => setNoteSaveStatus(''), 2500);
        } catch (err) {
            setNoteSaveStatus('');
            alert(err.response?.data?.error || 'Failed to save note');
        }
    };

    const handleDeleteNote = async (noteId) => {
        if (!window.confirm('Delete this note?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/notes/${noteId}`, authHeaders);
            const remaining = notes.filter(n => n.id !== noteId);
            setNotes(remaining);
            if (selectedNote?.id === noteId) {
                if (remaining.length > 0) {
                    handleSelectNote(remaining[0]);
                } else {
                    setSelectedNote(null);
                    setNoteTitleDraft('');
                    setNoteContentDraft('');
                }
            }
            showToast('Note deleted');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete note');
        }
    };

    // Milestone Actions
    const handleCreateMilestone = async (e) => {
        e.preventDefault();
        if (!newMilestone.title.trim()) return;

        try {
            const res = await axios.post(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/milestones`, {
                title: newMilestone.title.trim(),
                description: newMilestone.description.trim(),
                targetDate: newMilestone.targetDate || null
            }, authHeaders);
            setMilestones(prev => [...prev, res.data.milestone]);
            setShowMilestoneModal(false);
            setNewMilestone({ title: '', description: '', targetDate: '' });
            showToast('Milestone milestone added!');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add milestone');
        }
    };

    const handleToggleMilestone = async (milestoneId, currentStatus) => {
        try {
            const res = await axios.patch(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/milestones/${milestoneId}`, {
                isCompleted: !currentStatus
            }, authHeaders);
            setMilestones(prev => prev.map(m => m.id === milestoneId ? res.data.milestone : m));
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update milestone');
        }
    };

    const handleDeleteMilestone = async (milestoneId) => {
        if (!window.confirm('Delete this milestone?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/chats/${chat.id}/collaboration/milestones/${milestoneId}`, authHeaders);
            setMilestones(prev => prev.filter(m => m.id !== milestoneId));
            showToast('Milestone deleted');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete milestone');
        }
    };

    // Share to Chat Functionality
    const handleShareTaskToChat = (task) => {
        const text = `📋 [Task] ${task.title}\nStatus: ${task.status.toUpperCase()} | Priority: ${task.priority.toUpperCase()}${task.assignee ? ` | Assignee: @${task.assignee.username}` : ''}${task.dueDate ? ` | Due: ${new Date(task.dueDate).toLocaleDateString()}` : ''}\n${task.description ? `Details: ${task.description}` : ''}`;
        if (onShareToChat) {
            onShareToChat(text);
            showToast('Shared task to group chat! 💬');
        } else {
            navigator.clipboard?.writeText(text);
            showToast('Task details copied to clipboard!');
        }
    };

    const handleShareNoteToChat = (note) => {
        const text = `📝 [Shared Note] ${note.title}\n---\n${note.content.substring(0, 300)}${note.content.length > 300 ? '...' : ''}`;
        if (onShareToChat) {
            onShareToChat(text);
            showToast('Shared note to group chat! 💬');
        } else {
            navigator.clipboard?.writeText(text);
            showToast('Note snippet copied to clipboard!');
        }
    };

    // Filtered tasks
    const filteredTasks = useMemo(() => {
        if (filterAssignee === 'all') return tasks;
        return tasks.filter(t => String(t.assigneeId) === String(filterAssignee));
    }, [tasks, filterAssignee]);

    // Milestones progress
    const milestoneProgress = useMemo(() => {
        if (!milestones.length) return 0;
        const done = milestones.filter(m => m.isCompleted).length;
        return Math.round((done / milestones.length) * 100);
    }, [milestones]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-2 md:p-4 animate-in fade-in duration-200">
            <div className="flex flex-col w-full max-w-6xl h-[92vh] max-h-[900px] bg-[#0f172a] text-white rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <SparklesIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base md:text-lg font-bold text-white tracking-wide">Workspace Hub</h2>
                                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    Collaboration
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 truncate max-w-xs md:max-w-md">
                                {chat.name || 'Group Chat'} • {chat.participants?.length || 0} collaborators
                            </p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
                        <button
                            onClick={() => setActiveTab('tasks')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'tasks' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            <ClipboardDocumentListIcon className="w-4 h-4" />
                            <span>Tasks</span>
                            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">{tasks.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('notes')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'notes' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            <DocumentTextIcon className="w-4 h-4" />
                            <span>Notes</span>
                            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">{notes.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('milestones')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'milestones' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            <FlagIcon className="w-4 h-4" />
                            <span>Milestones</span>
                            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">{milestones.length}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadAll}
                            title="Refresh workspace"
                            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Toast Notification */}
                {actionMsg && (
                    <div className="bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 text-xs px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2">
                        <span>{actionMsg}</span>
                        <button onClick={() => setActionMsg('')} className="text-emerald-400 hover:text-white">✕</button>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden p-3 md:p-6 bg-[#090d16]">
                    
                    {/* TAB 1: KANBAN TASKS */}
                    {activeTab === 'tasks' && (
                        <div className="h-full flex flex-col">
                            {/* Controls Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">Filter Assignee:</span>
                                    <select
                                        value={filterAssignee}
                                        onChange={(e) => setFilterAssignee(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="all">All Members ({tasks.length})</option>
                                        {chat.participants?.map(p => (
                                            <option key={p.id} value={p.user?.id || p.userId}>
                                                {p.user?.username || p.username || 'Member'}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    onClick={() => setShowTaskModal(true)}
                                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    <span>New Task</span>
                                </button>
                            </div>

                            {/* Kanban Board Columns */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 overflow-y-auto pr-1">
                                {COLUMNS.map(col => {
                                    const colTasks = filteredTasks.filter(t => t.status === col.id);
                                    return (
                                        <div key={col.id} className="flex flex-col bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden">
                                            {/* Column Header */}
                                            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-slate-800">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${col.color}`}>
                                                        {col.label}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-slate-500 font-semibold">{colTasks.length}</span>
                                            </div>

                                            {/* Column Task Cards */}
                                            <div className="flex-1 p-2 space-y-2.5 overflow-y-auto">
                                                {colTasks.length === 0 ? (
                                                    <div className="h-28 flex items-center justify-center border-2 border-dashed border-slate-800/80 rounded-xl text-slate-600 text-xs">
                                                        No tasks here
                                                    </div>
                                                ) : (
                                                    colTasks.map(task => (
                                                        <div
                                                            key={task.id}
                                                            className="group bg-slate-850 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 p-3 rounded-xl transition shadow-sm hover:shadow-md"
                                                        >
                                                            {/* Priority & Creator */}
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${PRIORITY_BADGES[task.priority]?.bg || PRIORITY_BADGES.medium.bg}`}>
                                                                    {PRIORITY_BADGES[task.priority]?.label || 'Normal'}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleDeleteTask(task.id)}
                                                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 transition"
                                                                    title="Delete task"
                                                                >
                                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>

                                                            <h4 className="text-xs font-semibold text-slate-100 mb-1 leading-snug">
                                                                {task.title}
                                                            </h4>

                                                            {task.description && (
                                                                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
                                                                    {task.description}
                                                                </p>
                                                            )}

                                                            {/* Footer: Due date & Assignee */}
                                                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 mt-2">
                                                                <div className="flex items-center gap-1 text-slate-400">
                                                                    {task.dueDate ? (
                                                                        <>
                                                                            <CalendarDaysIcon className="w-3.5 h-3.5 text-emerald-400" />
                                                                            <span>{new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                                        </>
                                                                    ) : (
                                                                        <span>No date</span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-1.5">
                                                                    {task.assignee ? (
                                                                        <div className="flex items-center gap-1 text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-[10px]">
                                                                            <UserCircleIcon className="w-3 h-3 text-cyan-400" />
                                                                            <span className="truncate max-w-[70px]">@{task.assignee.username}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] text-slate-600">Unassigned</span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Move Status & Share Bar */}
                                                            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800/50">
                                                                <button
                                                                    onClick={() => handleShareTaskToChat(task)}
                                                                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400 transition"
                                                                    title="Share into group conversation"
                                                                >
                                                                    <ShareIcon className="w-3 h-3" />
                                                                    <span>Share</span>
                                                                </button>

                                                                <select
                                                                    value={task.status}
                                                                    onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                                                                    className="bg-slate-900 border border-slate-700/80 text-[10px] text-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-500"
                                                                >
                                                                    <option value="todo">To Do</option>
                                                                    <option value="in_progress">In Progress</option>
                                                                    <option value="review">Review</option>
                                                                    <option value="done">Completed</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* TAB 2: SHARED NOTES & DOCS */}
                    {activeTab === 'notes' && (
                        <div className="h-full flex flex-col md:flex-row gap-4">
                            {/* Notes Sidebar */}
                            <div className="w-full md:w-72 flex flex-col bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden shrink-0">
                                <div className="flex items-center justify-between p-3 border-b border-slate-800">
                                    <h3 className="text-xs font-bold text-slate-200">Group Notes ({notes.length})</h3>
                                    <button
                                        onClick={handleCreateNewNote}
                                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow transition"
                                    >
                                        <PlusIcon className="w-3.5 h-3.5" />
                                        <span>New</span>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                                    {notes.length === 0 ? (
                                        <div className="text-center py-10 text-xs text-slate-500">
                                            No notes created yet.<br />Click "+ New" to draft a brief or meeting minutes.
                                        </div>
                                    ) : (
                                        notes.map(n => (
                                            <div
                                                key={n.id}
                                                onClick={() => handleSelectNote(n)}
                                                className={`p-2.5 rounded-xl cursor-pointer transition border ${selectedNote?.id === n.id ? 'bg-emerald-950/40 border-emerald-500/50 text-white' : 'bg-slate-850 hover:bg-slate-800 border-slate-800 text-slate-300'}`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="text-xs font-semibold truncate max-w-[170px]">{n.title || 'Untitled Note'}</h4>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(n.id); }}
                                                        className="text-slate-500 hover:text-rose-400 p-1"
                                                    >
                                                        <TrashIcon className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-slate-500 line-clamp-1">
                                                    {n.content || 'Empty note...'}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Note Editor Area */}
                            <div className="flex-1 flex flex-col bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
                                {selectedNote ? (
                                    <>
                                        <div className="flex items-center justify-between p-3.5 bg-slate-900 border-b border-slate-800">
                                            <input
                                                type="text"
                                                value={noteTitleDraft}
                                                onChange={(e) => setNoteTitleDraft(e.target.value)}
                                                placeholder="Document Title..."
                                                className="bg-transparent text-sm md:text-base font-bold text-white focus:outline-none border-b border-transparent focus:border-emerald-500 px-1 py-0.5 flex-1 max-w-md"
                                            />
                                            <div className="flex items-center gap-2">
                                                {noteSaveStatus === 'saved' && (
                                                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                                                        <CheckIcon className="w-3.5 h-3.5" /> Saved
                                                    </span>
                                                )}
                                                {noteSaveStatus === 'saving' && (
                                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Saving...
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => handleShareNoteToChat({ title: noteTitleDraft, content: noteContentDraft })}
                                                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-emerald-400 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
                                                >
                                                    <ShareIcon className="w-3.5 h-3.5" />
                                                    <span>Share to Chat</span>
                                                </button>
                                                <button
                                                    onClick={handleSaveNote}
                                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition"
                                                >
                                                    Save Note
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 p-4 flex flex-col">
                                            <textarea
                                                value={noteContentDraft}
                                                onChange={(e) => setNoteContentDraft(e.target.value)}
                                                placeholder="Write meeting notes, task requirements, agendas, or research findings here..."
                                                className="w-full flex-1 bg-transparent text-xs md:text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none leading-relaxed"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                                        <DocumentTextIcon className="w-10 h-10 mb-2 text-slate-600" />
                                        <span>Select a note from the left or create a new one</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 3: MILESTONES & TIMELINE */}
                    {activeTab === 'milestones' && (
                        <div className="h-full flex flex-col max-w-4xl mx-auto">
                            {/* Progress Overview Card */}
                            <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-850 rounded-2xl border border-slate-800 mb-4 shadow-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold text-white">Project Milestones & Deadlines</h3>
                                        <p className="text-xs text-slate-400">Keep college submissions, sprint goals, or event dates on track</p>
                                    </div>
                                    <button
                                        onClick={() => setShowMilestoneModal(true)}
                                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow transition"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        <span>Add Milestone</span>
                                    </button>
                                </div>
                                <div className="mt-3">
                                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                                        <span className="text-emerald-400">{milestoneProgress}% Achieved</span>
                                        <span className="text-slate-400">
                                            {milestones.filter(m => m.isCompleted).length} / {milestones.length} Completed
                                        </span>
                                    </div>
                                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500 rounded-full"
                                            style={{ width: `${milestoneProgress}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Milestones List */}
                            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                {milestones.length === 0 ? (
                                    <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                                        <FlagIcon className="w-8 h-8 mb-2 text-slate-600" />
                                        <span>No milestones created yet. Add one to track project goals!</span>
                                    </div>
                                ) : (
                                    milestones.map(m => (
                                        <div
                                            key={m.id}
                                            className={`p-4 rounded-xl border transition flex items-start gap-3.5 ${m.isCompleted ? 'bg-slate-900/40 border-slate-800/60 opacity-80' : 'bg-slate-850 border-slate-800 shadow-md'}`}
                                        >
                                            <button
                                                onClick={() => handleToggleMilestone(m.id, m.isCompleted)}
                                                className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition border ${m.isCompleted ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-600 hover:border-emerald-500 text-transparent'}`}
                                            >
                                                <CheckIcon className="w-4 h-4" />
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h4 className={`text-xs md:text-sm font-semibold truncate ${m.isCompleted ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                                                        {m.title}
                                                    </h4>
                                                    <button
                                                        onClick={() => handleDeleteMilestone(m.id)}
                                                        className="text-slate-500 hover:text-rose-400 p-1"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {m.description && (
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        {m.description}
                                                    </p>
                                                )}

                                                {m.targetDate && (
                                                    <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-400">
                                                        <CalendarDaysIcon className="w-4 h-4 text-cyan-400" />
                                                        <span>Target: {new Date(m.targetDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* MODAL: ADD TASK */}
                {showTaskModal && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-white">Create New Task</h3>
                                <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-white">✕</button>
                            </div>
                            <form onSubmit={handleCreateTask} className="space-y-3.5">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Task Title *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Design Presentation Deck"
                                        value={newTask.title}
                                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Add relevant links, notes or instructions..."
                                        value={newTask.description}
                                        onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
                                        <select
                                            value={newTask.priority}
                                            onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="urgent">Urgent</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Column</label>
                                        <select
                                            value={newTask.status}
                                            onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value="todo">To Do</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="review">Review</option>
                                            <option value="done">Completed</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Assignee</label>
                                        <select
                                            value={newTask.assigneeId}
                                            onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value="">Unassigned</option>
                                            {chat.participants?.map(p => (
                                                <option key={p.id} value={p.user?.id || p.userId}>
                                                    @{p.user?.username || p.username || 'Member'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Due Date</label>
                                        <input
                                            type="date"
                                            value={newTask.dueDate}
                                            onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowTaskModal(false)}
                                        className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition"
                                    >
                                        Add Task
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL: ADD MILESTONE */}
                {showMilestoneModal && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-white">Add Project Milestone</h3>
                                <button onClick={() => setShowMilestoneModal(false)} className="text-slate-400 hover:text-white">✕</button>
                            </div>
                            <form onSubmit={handleCreateMilestone} className="space-y-3.5">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Milestone Title *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Project Submission / Beta Launch"
                                        value={newMilestone.title}
                                        onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                                    <textarea
                                        rows={2}
                                        placeholder="What needs to be accomplished?"
                                        value={newMilestone.description}
                                        onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Target Date</label>
                                    <input
                                        type="date"
                                        value={newMilestone.targetDate}
                                        onChange={(e) => setNewMilestone({ ...newMilestone, targetDate: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowMilestoneModal(false)}
                                        className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition"
                                    >
                                        Save Milestone
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
