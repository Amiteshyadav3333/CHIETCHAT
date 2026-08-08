import AvatarZoom from './AvatarZoom';

export const AppLockOverlay = ({ error, onPinChange, onSubmit, pin }) => (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#050914] p-4">
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-3xl border border-blue-500/20 bg-[#0c1526] p-6 text-center shadow-2xl">
            <img src="/cheetchat-logo.png" alt="CHEETCHAT" className="mx-auto h-20 w-20 rounded-2xl object-cover" />
            <h2 className="mt-4 text-xl font-black text-white">CHEETCHAT locked</h2>
            <p className="mt-1 text-xs text-gray-400">Enter this browser's device PIN</p>
            <input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={event => onPinChange(event.target.value.replace(/\D/g, ''))} className="mt-5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white outline-none focus:border-blue-500" />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <button className="mt-4 w-full rounded-xl bg-blue-500 py-3 text-sm font-bold text-white">Unlock</button>
        </form>
    </div>
);

export const OfflineBanner = () => (
    <div className="absolute left-0 right-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-600/90 px-4 py-1.5 text-center text-xs font-bold text-white shadow-md animate-fade-in">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
        Offline mode. Messages will be queued and sent automatically when connection is restored.
    </div>
);

export const EditMessageModal = ({ onCancel, onChange, onSubmit, text }) => (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#111b21] p-4 shadow-2xl">
            <h3 className="mb-3 text-lg font-bold text-white">Edit message</h3>
            <textarea value={text} onChange={event => onChange(event.target.value)} className="h-28 w-full resize-none rounded-xl bg-[#202c33] p-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-signal-accent" autoFocus />
            <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10">Cancel</button>
                <button type="submit" className="rounded-lg bg-signal-accent px-4 py-2 text-sm font-bold text-white">Save</button>
            </div>
        </form>
    </div>
);

export const ForwardMessageModal = ({ activeChatId, chats, message, onClose, onForward }) => (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#111b21] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{message._shareSource === 'reel' ? 'Share reel to' : 'Forward to'}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
                {chats.filter(chat => message._shareSource === 'reel' || chat.id !== activeChatId).map(chat => (
                    <button key={chat.id} onClick={() => onForward(chat)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/10">
                        <AvatarZoom src={chat.avatar || null} name={chat.name} size="w-10 h-10" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{chat.name}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);
