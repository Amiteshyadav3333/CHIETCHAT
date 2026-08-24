import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { XMarkIcon, LinkIcon, PhotoIcon, DocumentIcon, BellIcon, PencilSquareIcon, UserPlusIcon, ShieldCheckIcon, CheckIcon, CameraIcon, TrashIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import UserAvatar from './UserAvatar';

const Toggle = ({ value, onChange, disabled }) => (
    <button type="button" disabled={disabled} onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition ${value ? 'bg-[#3390ec]' : 'bg-[#3a4652]'} disabled:opacity-40`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);

const Row = ({ icon: Icon, title, subtitle, action, onClick }) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[.045]">
        <Icon className="h-5 w-5 shrink-0 text-[#3390ec]" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white">{title}</span>{subtitle && <span className="block truncate text-xs text-slate-400">{subtitle}</span>}</span>
        {action}
    </button>
);

export default function TelegramGroupInfo({ chat, user, token, messages, requests, onRespondRequest, onClose, onTogglePosting, onDelete, onUpdated }) {
    const isAdmin = chat.groupAdminId === user?.id;
    const [tab, setTab] = useState('members');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [members, setMembers] = useState(chat.participants || []);
    const [memberCount, setMemberCount] = useState(chat.memberCount || chat.participants?.length || 0);
    const [memberCursor, setMemberCursor] = useState(null);
    const [memberSearch, setMemberSearch] = useState('');
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [bots, setBots] = useState([]);
    const [botDraft, setBotDraft] = useState({ name: '', username: '', description: '', commands: 'help=Available commands: /help' });
    const [creatingBot, setCreatingBot] = useState(false);
    const avatarInputRef = useRef(null);
    const [draft, setDraft] = useState({
        name: chat.name || '', description: chat.description || '', groupUsername: chat.groupUsername || '',
        isPublic: !!chat.isPublic, slowModeSeconds: chat.slowModeSeconds || 0,
        membersCanSendMedia: chat.membersCanSendMedia !== false, membersCanAddMembers: !!chat.membersCanAddMembers,
        reactionsEnabled: chat.reactionsEnabled !== false, joinApprovalRequired: !!chat.joinApprovalRequired,
    });
    const media = useMemo(() => messages.filter(m => ['image', 'video', 'gif'].includes(m.type)), [messages]);
    const files = useMemo(() => messages.filter(m => ['file', 'audio'].includes(m.type)), [messages]);
    const links = useMemo(() => messages.filter(m => /https?:\/\//i.test(m.content || '')), [messages]);
    const inviteLink = `${window.location.origin}/join/${chat.groupUsername || chat.id}`;

    const loadMembers = async ({ reset = false, query = memberSearch } = {}) => {
        setLoadingMembers(true);
        try {
            const { data } = await axios.get(`/api/groups/${chat.id}/members`, { params: { limit: 50, after: reset ? 0 : (memberCursor || 0), q: query }, headers: { Authorization: `Bearer ${token}` } });
            setMembers(current => reset ? data.items : [...current, ...data.items.filter(item => !current.some(existing => existing.id === item.id))]);
            setMemberCount(data.memberCount);
            setMemberCursor(data.nextCursor);
        } catch (error) { console.error('Could not load group members', error); }
        finally { setLoadingMembers(false); }
    };
    useEffect(() => { loadMembers({ reset: true, query: '' }); }, [chat.id]);
    useEffect(() => { axios.get(`/api/groups/${chat.id}/bots`, { headers: { Authorization: `Bearer ${token}` } }).then(({ data }) => setBots(data)).catch(() => setBots([])); }, [chat.id, token]);

    const createBot = async event => {
        event.preventDefault();
        const commands = Object.fromEntries(botDraft.commands.split('\n').map(line => line.split('=')).filter(parts => parts.length >= 2).map(([command, ...reply]) => [command.trim().replace(/^\//, ''), reply.join('=').trim()]));
        setCreatingBot(true);
        try {
            const { data } = await axios.post(`/api/groups/${chat.id}/bots`, { ...botDraft, commands }, { headers: { Authorization: `Bearer ${token}` } });
            setBots(current => [...current, data]);
            setBotDraft({ name: '', username: '', description: '', commands: 'help=Available commands: /help' });
        } catch (error) { alert(error.response?.data?.error || 'Could not create bot'); }
        finally { setCreatingBot(false); }
    };
    const toggleBot = async bot => {
        const { data } = await axios.patch(`/api/groups/${chat.id}/bots/${bot.id}`, { isEnabled: !bot.isEnabled }, { headers: { Authorization: `Bearer ${token}` } });
        setBots(current => current.map(item => item.id === bot.id ? data : item));
    };
    const deleteBot = async bot => {
        if (!window.confirm(`Delete @${bot.username}?`)) return;
        await axios.delete(`/api/groups/${chat.id}/bots/${bot.id}`, { headers: { Authorization: `Bearer ${token}` } });
        setBots(current => current.filter(item => item.id !== bot.id));
    };

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await axios.patch(`/api/groups/${chat.id}/settings`, draft, { headers: { Authorization: `Bearer ${token}` } });
            onUpdated(data); setEditing(false);
        } catch (error) { alert(error.response?.data?.error || 'Could not save group settings'); }
        finally { setSaving(false); }
    };
    const copyInvite = async () => { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1800); };
    const set = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
    const uploadAvatar = async (file) => {
        if (!file) return;
        const form = new FormData(); form.append('avatar', file); setUploadingAvatar(true);
        try { const { data } = await axios.post(`/api/groups/${chat.id}/avatar`, form, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }); onUpdated(data); }
        catch (error) { alert(error.response?.data?.error || 'Could not update group photo'); }
        finally { setUploadingAvatar(false); if (avatarInputRef.current) avatarInputRef.current.value = ''; }
    };
    const removeAvatar = async () => {
        if (!window.confirm('Remove this group photo?')) return;
        try { const { data } = await axios.delete(`/api/groups/${chat.id}/avatar`, { headers: { Authorization: `Bearer ${token}` } }); onUpdated(data); }
        catch (error) { alert(error.response?.data?.error || 'Could not remove group photo'); }
    };

    return (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
            <aside className="flex h-full w-full max-w-[410px] flex-col overflow-hidden border-l border-white/10 bg-[#17212b] shadow-2xl animate-slide-left" onClick={e => e.stopPropagation()}>
                <header className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
                    <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><XMarkIcon className="h-5 w-5" /></button>
                    <h2 className="flex-1 font-semibold text-white">Group Info</h2>
                    {isAdmin && <button onClick={() => setEditing(v => !v)} className="rounded-full p-2 text-[#3390ec] hover:bg-[#3390ec]/10"><PencilSquareIcon className="h-5 w-5" /></button>}
                </header>

                <div className="overflow-y-auto">
                    <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-[#223445] to-[#17212b] px-5 pb-5 pt-7 text-center">
                        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#3390ec]/10 blur-3xl" />
                        <div className="group/avatar relative mx-auto h-28 w-28">
                            <UserAvatar src={chat.avatar} name={chat.name} className="h-28 w-28 rounded-full border-4 border-[#17212b] object-cover shadow-2xl" alt="" />
                            {isAdmin && <button disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/55 text-white opacity-100 transition sm:opacity-0 sm:group-hover/avatar:opacity-100"><CameraIcon className="h-6 w-6" /><span className="mt-1 text-[10px] font-bold">{uploadingAvatar ? 'Uploading…' : 'CHANGE PHOTO'}</span></button>}
                            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={e => uploadAvatar(e.target.files?.[0])} />
                        </div>
                        <h3 className="relative mt-3 text-xl font-bold text-white">{chat.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{memberCount.toLocaleString()} members · {chat.isPublic ? 'public group' : 'private group'}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Capacity: {memberCount.toLocaleString()} / 500,000</p>
                        {chat.groupUsername && <p className="mt-1 text-sm font-medium text-[#58a9ef]">@{chat.groupUsername}</p>}
                        {chat.description && <p className="mx-auto mt-3 max-w-sm whitespace-pre-wrap text-sm leading-5 text-slate-300">{chat.description}</p>}
                        {isAdmin && chat.avatar && <button onClick={removeAvatar} className="mt-2 inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"><TrashIcon className="h-3.5 w-3.5" />Remove photo</button>}
                    </section>

                    {editing && isAdmin && <section className="space-y-3 border-b border-white/10 bg-[#1d2a36] p-4">
                        <input value={draft.name} onChange={e => set('name', e.target.value)} maxLength={100} placeholder="Group name" className="w-full rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#3390ec]" />
                        <textarea value={draft.description} onChange={e => set('description', e.target.value)} maxLength={500} rows={3} placeholder="Description" className="w-full resize-none rounded-xl border border-white/10 bg-[#17212b] px-3 py-2.5 text-sm text-white outline-none focus:border-[#3390ec]" />
                        <div className="flex items-center rounded-xl border border-white/10 bg-[#17212b] px-3"><span className="text-slate-500">@</span><input value={draft.groupUsername} onChange={e => set('groupUsername', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="public_username" className="w-full bg-transparent px-1 py-2.5 text-sm text-white outline-none" /></div>
                        <button onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3390ec] py-2.5 text-sm font-bold text-white hover:bg-[#2b7fc4] disabled:opacity-50"><CheckIcon className="h-4 w-4" />{saving ? 'Saving…' : 'Save changes'}</button>
                    </section>}

                    <section className="border-b border-white/10 py-1">
                        <Row icon={BellIcon} title="Notifications" subtitle="Custom notifications for this group" action={<span className="text-xs text-slate-400">On</span>} />
                        <Row icon={LinkIcon} title={copied ? 'Invite link copied' : 'Invite via link'} subtitle={inviteLink} onClick={copyInvite} action={copied ? <CheckIcon className="h-5 w-5 text-emerald-400" /> : null} />
                        <Row icon={LockClosedIcon} title="Group privacy" subtitle="Phone numbers are hidden; usernames and unique IDs are shown" onClick={() => window.open('/privacy', '_blank', 'noopener,noreferrer')} />
                        {isAdmin && <Row icon={ShieldCheckIcon} title="Only admins can post" subtitle="Turn this group into an announcement channel" action={<Toggle value={!!chat.isChatDisabled} onChange={onTogglePosting} />} />}
                    </section>

                    {isAdmin && <section className="border-b border-white/10 py-2">
                        <p className="px-4 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-[#58a9ef]">Premium group controls</p>
                        <Row icon={LinkIcon} title="Public group" subtitle="Anyone can find this group by username" action={<Toggle value={draft.isPublic} onChange={v => set('isPublic', v)} />} />
                        <Row icon={PhotoIcon} title="Members can send media" action={<Toggle value={draft.membersCanSendMedia} onChange={v => set('membersCanSendMedia', v)} />} />
                        <Row icon={UserPlusIcon} title="Members can add people" action={<Toggle value={draft.membersCanAddMembers} onChange={v => set('membersCanAddMembers', v)} />} />
                        <Row icon={ShieldCheckIcon} title="Approve new members" action={<Toggle value={draft.joinApprovalRequired} onChange={v => set('joinApprovalRequired', v)} />} />
                        <Row icon={CheckIcon} title="Message reactions" action={<Toggle value={draft.reactionsEnabled} onChange={v => set('reactionsEnabled', v)} />} />
                        <div className="px-4 py-3"><label className="mb-2 block text-sm font-medium text-white">Slow mode</label><select value={draft.slowModeSeconds} onChange={e => set('slowModeSeconds', Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-[#243442] px-3 py-2.5 text-sm text-white outline-none"><option value="0">Off</option><option value="10">10 seconds</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="3600">1 hour</option></select></div>
                        <button onClick={save} disabled={saving} className="mx-4 mb-2 w-[calc(100%-2rem)] rounded-xl bg-[#3390ec]/15 py-2.5 text-sm font-bold text-[#58a9ef] hover:bg-[#3390ec]/25">Apply permissions</button>
                    </section>}

                    <section className="border-b border-white/10 p-4">
                        <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-white">Group bots</p><p className="text-xs text-slate-400">Custom command bots work only in this group</p></div><span className="rounded-full bg-[#3390ec]/15 px-2 py-1 text-[10px] font-bold text-[#58a9ef]">{bots.length}/20</span></div>
                        <div className="mt-3 space-y-2">{bots.map(bot => <div key={bot.id} className="rounded-xl border border-white/10 bg-[#1d2a36] p-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#3390ec] to-violet-600 text-lg">🤖</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{bot.name}</p><p className="truncate text-xs text-[#58a9ef]">@{bot.username} · {Object.keys(bot.commands).length} commands</p></div>{isAdmin && <Toggle value={bot.isEnabled} onChange={() => toggleBot(bot)} />}{isAdmin && <button type="button" onClick={() => deleteBot(bot)} className="text-xs text-rose-400">Delete</button>}</div>{bot.description && <p className="mt-2 text-xs text-slate-400">{bot.description}</p>}<div className="mt-2 flex flex-wrap gap-1">{Object.keys(bot.commands).map(command => <span key={command} className="rounded-md bg-black/20 px-2 py-1 text-[10px] text-slate-300">/{command}@{bot.username}</span>)}</div></div>)}</div>
                        {isAdmin && <form onSubmit={createBot} className="mt-3 space-y-2 rounded-xl border border-dashed border-[#3390ec]/30 bg-[#3390ec]/5 p-3"><p className="text-xs font-bold text-[#58a9ef]">CREATE A BOT</p><input required maxLength={80} value={botDraft.name} onChange={e => setBotDraft(d => ({ ...d, name: e.target.value }))} placeholder="Bot name" className="w-full rounded-lg border border-white/10 bg-[#17212b] px-3 py-2 text-xs text-white outline-none" /><div className="flex items-center rounded-lg border border-white/10 bg-[#17212b] px-3"><span className="text-slate-500">@</span><input required minLength={5} maxLength={64} value={botDraft.username} onChange={e => setBotDraft(d => ({ ...d, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))} placeholder="my_group_bot" className="w-full bg-transparent px-1 py-2 text-xs text-white outline-none" /></div><input maxLength={300} value={botDraft.description} onChange={e => setBotDraft(d => ({ ...d, description: e.target.value }))} placeholder="What does this bot do?" className="w-full rounded-lg border border-white/10 bg-[#17212b] px-3 py-2 text-xs text-white outline-none" /><label className="block text-[10px] text-slate-400">One command per line: command=reply<textarea required rows={4} value={botDraft.commands} onChange={e => setBotDraft(d => ({ ...d, commands: e.target.value }))} className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-[#17212b] px-3 py-2 text-xs text-white outline-none" /></label><button disabled={creatingBot || bots.length >= 20} className="w-full rounded-lg bg-[#3390ec] py-2 text-xs font-bold text-white disabled:opacity-50">{creatingBot ? 'Creating…' : 'Create group bot'}</button></form>}
                    </section>

                    <nav className="sticky top-0 z-10 grid grid-cols-4 border-b border-white/10 bg-[#17212b]/95 backdrop-blur">
                        {[['members', `Members ${memberCount.toLocaleString()}`], ['media', `Media ${media.length}`], ['files', `Files ${files.length}`], ['links', `Links ${links.length}`]].map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`border-b-2 px-1 py-3 text-xs font-semibold ${tab === id ? 'border-[#3390ec] text-[#58a9ef]' : 'border-transparent text-slate-400'}`}>{label}</button>)}
                    </nav>
                    {tab === 'members' && <div className="py-2">
                        <form onSubmit={event => { event.preventDefault(); setMemberCursor(null); loadMembers({ reset: true, query: memberSearch }); }} className="mx-3 mb-3 flex gap-2"><input value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Search members" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#243442] px-3 py-2 text-xs text-white outline-none focus:border-[#3390ec]" /><button className="rounded-xl bg-[#3390ec] px-3 text-xs font-bold text-white">Search</button></form>
                        {isAdmin && requests.length > 0 && <div className="mx-3 mb-3 rounded-xl border border-[#3390ec]/25 bg-[#3390ec]/5 p-2"><p className="px-2 py-1 text-xs font-bold text-[#58a9ef]">JOIN REQUESTS · {requests.length}</p>{requests.map(r => <div key={r.id} className="flex items-center gap-2 p-2"><UserAvatar src={r.avatar} name={r.username} className="h-9 w-9 rounded-full" /><span className="min-w-0 flex-1 truncate text-sm text-white">{r.username}</span><button onClick={() => onRespondRequest(r.id, 'reject')} className="text-xs text-rose-400">Decline</button><button onClick={() => onRespondRequest(r.id, 'approve')} className="rounded-lg bg-[#3390ec] px-2.5 py-1.5 text-xs font-bold text-white">Add</button></div>)}</div>}
                        {members.map(p => <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[.035]"><UserAvatar src={p.avatar} name={p.username} className="h-10 w-10 rounded-full" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{p.username}{p.id === user?.id ? ' (you)' : ''}</span><span className="block truncate text-xs text-[#58a9ef]">@{p.platformId || `user_${p.id}`}</span><span className={`text-[11px] ${p.isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>{p.id === chat.groupAdminId ? 'Owner · phone hidden' : p.isOnline ? 'online · phone hidden' : 'phone hidden'}</span></span>{p.id === chat.groupAdminId && <span className="rounded-md bg-[#3390ec]/15 px-2 py-1 text-[10px] font-bold text-[#58a9ef]">OWNER</span>}</div>)}
                        {memberCursor && <button type="button" disabled={loadingMembers} onClick={() => loadMembers()} className="mx-4 my-3 w-[calc(100%-2rem)] rounded-xl border border-[#3390ec]/30 py-2.5 text-xs font-bold text-[#58a9ef] disabled:opacity-50">{loadingMembers ? 'Loading…' : 'Load more members'}</button>}
                    </div>}
                    {tab !== 'members' && <div className="grid grid-cols-3 gap-1 p-2">{(tab === 'media' ? media : tab === 'files' ? files : links).length ? (tab === 'media' ? media : tab === 'files' ? files : links).map(m => <div key={m.id} className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[#243442] p-2 text-center text-xs text-slate-300">{m.type === 'image' && m.content ? <img src={m.content} className="h-full w-full object-cover" alt="" /> : <><DocumentIcon className="mr-1 h-5 w-5 text-[#58a9ef]" /><span className="line-clamp-3 break-all">{m.content || m.type}</span></>}</div>) : <p className="col-span-3 py-12 text-center text-sm text-slate-500">Nothing shared here yet</p>}</div>}
                </div>
                <footer className="mt-auto border-t border-white/10 bg-[#17212b] p-3"><button onClick={onDelete} className="w-full rounded-xl py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10">{isAdmin ? 'Delete group' : 'Leave group'}</button></footer>
            </aside>
        </div>
    );
}
