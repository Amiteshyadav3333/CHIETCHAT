import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';

const EMPTY_POLL = { question: '', options: ['', ''] };

export const normalizePoll = poll => {
    const question = typeof poll?.question === 'string' ? poll.question.trim() : '';
    const options = Array.isArray(poll?.options)
        ? poll.options.map(option => typeof option === 'string' ? option.trim() : '')
        : [];
    if (!question || question.length > 300 || options.length < 2 || options.length > 5) return null;
    if (options.some(option => !option || option.length > 100)) return null;
    return { question, options };
};

const PollCreatorModal = ({ onClose, onSubmit }) => {
    const [poll, setPoll] = useState(EMPTY_POLL);
    const [error, setError] = useState('');

    const submit = () => {
        const normalized = normalizePoll(poll);
        if (!normalized) {
            setError('Add a question and 2–5 complete options.');
            return;
        }
        onSubmit(normalized);
    };

    const updateOption = (index, value) => setPoll(current => ({
        ...current,
        options: current.options.map((option, optionIndex) => optionIndex === index ? value : option),
    }));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#2a3942] p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Create Poll</h3>
                    <button onClick={onClose} aria-label="Close poll creator"><XMarkIcon className="h-6 w-6 text-gray-400" /></button>
                </div>
                <div className="space-y-4">
                    <input placeholder="Question" maxLength={300} value={poll.question} onChange={event => setPoll(current => ({ ...current, question: event.target.value }))} className="w-full rounded-lg border border-gray-700 bg-[#111b21] p-3 text-white outline-none focus:border-signal-accent" />
                    {poll.options.map((option, index) => (
                        <input key={index} placeholder={`Option ${index + 1}`} maxLength={100} value={option} onChange={event => updateOption(index, event.target.value)} className="w-full rounded-lg border border-gray-700 bg-[#111b21] p-3 text-white outline-none" />
                    ))}
                    {poll.options.length < 5 && <button onClick={() => setPoll(current => ({ ...current, options: [...current.options, ''] }))} className="text-sm font-bold text-signal-accent">+ Add Option</button>}
                    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
                    <button onClick={submit} className="mt-2 w-full rounded-xl bg-signal-accent py-3 font-bold text-white">Send Poll</button>
                </div>
            </div>
        </div>
    );
};

export default PollCreatorModal;
