import { useEffect, useState } from 'react';
import axios from 'axios';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { normalizeScheduleRequest } from '../utils/scheduledMessages';

const authConfig = token => ({ headers: { Authorization: `Bearer ${token}` } });

const ScheduleMessageModal = ({ chatId, message, onClose, onSchedule, onScheduled, token }) => {
    const [draft, setDraft] = useState(message || '');
    const [scheduleAt, setScheduleAt] = useState('');
    const [pending, setPending] = useState([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        axios.get(`/api/chats/${chatId}/scheduled-messages`, authConfig(token))
            .then(response => active && setPending(response.data.items || []))
            .catch(() => active && setError('Could not load scheduled messages.'));
        return () => { active = false; };
    }, [chatId, token]);

    const submit = async () => {
        const request = normalizeScheduleRequest(draft, scheduleAt);
        if (!request) {
            setError('Choose a time at least one minute from now and within one year.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSchedule(request.content, request.sendAt);
            onScheduled();
        } catch (submitError) {
            setError(submitError.response?.data?.error || submitError.message || 'Could not schedule this encrypted message.');
        } finally {
            setSaving(false);
        }
    };

    const cancel = async id => {
        try {
            await axios.delete(`/api/scheduled-messages/${id}`, authConfig(token));
            setPending(current => current.filter(item => item.id !== id));
        } catch (cancelError) {
            setError(cancelError.response?.data?.error || 'Could not cancel the scheduled message.');
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#202c33] p-5 text-white shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-bold">Schedule message</h3>
                    <button onClick={onClose} aria-label="Close scheduled messages"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                <textarea
                    autoFocus
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder="Type the message you want to schedule"
                    maxLength={10000}
                    className="mb-3 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-[#111b21] p-3 text-sm text-gray-200 outline-none focus:border-[#00a884]"
                />
                <input type="datetime-local" value={scheduleAt} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} onChange={event => setScheduleAt(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#111b21] p-3 text-sm outline-none focus:border-[#00a884]" />
                {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
                <button disabled={saving || !draft.trim() || !scheduleAt} onClick={submit} className="mt-4 w-full rounded-xl bg-[#00a884] py-3 text-sm font-bold disabled:opacity-40">{saving ? 'Scheduling…' : 'Schedule'}</button>
                {pending.length > 0 && <div className="mt-5 border-t border-white/10 pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Pending in this chat</p>{pending.map(item => <div key={item.id} className="mb-2 flex items-center justify-between rounded-lg bg-[#111b21] px-3 py-2"><span className="text-xs">{new Date(item.scheduledFor).toLocaleString()}</span><button onClick={() => cancel(item.id)} className="text-xs font-bold text-red-300 hover:text-red-200">Cancel</button></div>)}</div>}
            </div>
        </div>
    );
};

export default ScheduleMessageModal;
