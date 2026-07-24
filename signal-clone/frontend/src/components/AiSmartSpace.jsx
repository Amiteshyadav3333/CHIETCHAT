import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircleIcon, PlusIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';

const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
};

const AiSmartSpace = ({ chats, token, onClose, onOpenChat }) => {
    const [tasks, setTasks] = useState(() => read('smart_space_tasks', []));
    const [notes, setNotes] = useState(() => read('smart_space_notes', []));
    const [reminders, setReminders] = useState(() => read('smart_space_reminders', []));
    const [taskText, setTaskText] = useState('');
    const [noteText, setNoteText] = useState('');
    const [reminderText, setReminderText] = useState('');
    const [reminderAt, setReminderAt] = useState('');
    const [brief, setBrief] = useState(() => localStorage.getItem('smart_space_daily_brief') || '');
    const [loadingBrief, setLoadingBrief] = useState(false);

    useEffect(() => localStorage.setItem('smart_space_tasks', JSON.stringify(tasks)), [tasks]);
    useEffect(() => localStorage.setItem('smart_space_notes', JSON.stringify(notes)), [notes]);
    useEffect(() => localStorage.setItem('smart_space_reminders', JSON.stringify(reminders)), [reminders]);

    const pendingChats = useMemo(() => chats
        .filter(chat => chat.lastMessage && chat.lastMessage.senderId !== undefined)
        .filter(chat => chat.unreadCount > 0)
        .slice(0, 5), [chats]);

    const generateBrief = async () => {
        setLoadingBrief(true);
        const context = chats.slice(0, 10).map(chat =>
            `${chat.name}: ${chat.lastMessage?.content || 'no recent message'} (${chat.unreadCount || 0} unread)`
        ).join('\n');
        try {
            const res = await axios.post('/api/ai/chat', {
                message: `Mera daily communication brief banao. 5 short bullets max. Important chats, pending replies, follow-ups aur birthdays suggest karo:\n${context}`
            }, { headers: { Authorization: `Bearer ${token}` } });
            setBrief(res.data.reply);
            localStorage.setItem('smart_space_daily_brief', res.data.reply);
            localStorage.setItem('smart_space_brief_date', new Date().toDateString());
        } catch {
            setBrief('Aaj ke important chats check karo, pending replies complete karo aur ek follow-up task add karo.');
        } finally { setLoadingBrief(false); }
    };

    useEffect(() => {
        if (localStorage.getItem('smart_space_brief_date') !== new Date().toDateString()) generateBrief();
    }, []);

    const addTask = () => {
        if (!taskText.trim()) return;
        setTasks(current => [{ id: Date.now(), text: taskText.trim(), done: false }, ...current]);
        setTaskText('');
    };
    const addNote = () => {
        if (!noteText.trim()) return;
        setNotes(current => [{ id: Date.now(), text: noteText.trim(), createdAt: new Date().toISOString() }, ...current]);
        setNoteText('');
    };
    const addReminder = () => {
        if (!reminderText.trim() || !reminderAt) return;
        setReminders(current => [{ id: Date.now(), text: reminderText.trim(), at: reminderAt }, ...current]);
        setReminderText(''); setReminderAt('');
    };

    return (
        <div className="flex h-full flex-col bg-[#07110f] text-white">
            <header className="flex items-center gap-3 border-b border-white/10 bg-[#10201c] px-5 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg"><SparklesIcon className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1"><h2 className="font-bold">AI Smart Space</h2><p className="text-xs text-emerald-200/60">Your daily communication assistant</p></div>
                <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><XMarkIcon className="h-5 w-5" /></button>
            </header>
            <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
                <section className="rounded-3xl border border-emerald-400/15 bg-gradient-to-br from-emerald-500/15 to-cyan-500/5 p-5 lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Today’s brief</h3><button onClick={generateBrief} disabled={loadingBrief} className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{loadingBrief ? 'Thinking…' : 'Refresh with AI'}</button></div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-200">{brief || 'Generate your first daily brief.'}</p>
                </section>

                <Card title="Pending replies" subtitle="Chats that may need your attention">
                    {pendingChats.length ? pendingChats.map(chat => <button key={chat.id} onClick={() => onOpenChat(chat)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-white/5"><img src={chat.avatar} className="h-9 w-9 rounded-full object-cover" alt="" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{chat.name}</p><p className="truncate text-xs text-gray-400">{chat.lastMessage?.content}</p></div><span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-black">{chat.unreadCount}</span></button>) : <Empty text="No pending replies" />}
                </Card>

                <Card title="Tasks" subtitle="Shared and personal follow-ups">
                    <AddRow value={taskText} setValue={setTaskText} onAdd={addTask} placeholder="Add a follow-up task" />
                    {tasks.map(task => <div key={task.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5"><button onClick={() => setTasks(list => list.map(x => x.id === task.id ? { ...x, done: !x.done } : x))}><CheckCircleIcon className={`h-5 w-5 ${task.done ? 'text-emerald-400' : 'text-gray-500'}`} /></button><span className={`flex-1 text-sm ${task.done ? 'text-gray-500 line-through' : ''}`}>{task.text}</span><button onClick={() => setTasks(list => list.filter(x => x.id !== task.id))} className="text-gray-600">×</button></div>)}
                </Card>

                <Card title="Saved notes" subtitle="Ideas, documents and personal messages">
                    <AddRow value={noteText} setValue={setNoteText} onAdd={addNote} placeholder="Save a quick note" />
                    {notes.map(note => <div key={note.id} className="rounded-xl bg-white/5 p-3 text-sm">{note.text}</div>)}
                </Card>

                <Card title="Reminders" subtitle="Bills, birthdays and important follow-ups">
                    <input value={reminderText} onChange={e => setReminderText(e.target.value)} placeholder="Reminder title" className="mb-2 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none" />
                    <div className="flex gap-2"><input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-xs outline-none" /><button onClick={addReminder} className="rounded-xl bg-emerald-400 px-4 text-sm font-bold text-black">Add</button></div>
                    {reminders.map(item => <div key={item.id} className="mt-2 flex items-center justify-between rounded-xl bg-white/5 p-3"><div><p className="text-sm">{item.text}</p><p className="text-[10px] text-gray-500">{new Date(item.at).toLocaleString()}</p></div><button onClick={() => setReminders(list => list.filter(x => x.id !== item.id))}>×</button></div>)}
                </Card>
            </div>
        </div>
    );
};

const Card = ({ title, subtitle, children }) => <section className="rounded-3xl border border-white/10 bg-[#10201c] p-4"><h3 className="font-bold">{title}</h3><p className="mb-3 text-xs text-gray-500">{subtitle}</p><div className="space-y-2">{children}</div></section>;
const Empty = ({ text }) => <p className="py-8 text-center text-sm text-gray-600">{text}</p>;
const AddRow = ({ value, setValue, onAdd, placeholder }) => <div className="flex gap-2"><input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAdd()} placeholder={placeholder} className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-400" /><button onClick={onAdd} className="rounded-xl bg-white/10 p-2 hover:bg-white/15"><PlusIcon className="h-5 w-5" /></button></div>;

export default AiSmartSpace;
