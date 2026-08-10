const WALLPAPERS = [
    ['white', 'White', 'bg-white'],
    ['gradient', 'Dark', 'bg-[#0b141a]'],
    ['dots', 'Dots', 'bg-gray-700'],
    ['emerald', 'Green', 'bg-emerald-800'],
    ['sunset', 'Sunset', 'bg-gradient-to-br from-orange-900 to-fuchsia-900'],
    ['ocean', 'Ocean', 'bg-gradient-to-br from-sky-900 to-cyan-700'],
    ['lavender', 'Lavender', 'bg-gradient-to-br from-indigo-900 to-violet-600'],
    ['rose', 'Rose', 'bg-gradient-to-br from-rose-950 to-rose-700'],
    ['sand', 'Sand', 'bg-gradient-to-br from-amber-900 to-yellow-700'],
    ['aurora', 'Aurora', 'bg-gradient-to-br from-emerald-900 via-indigo-800 to-violet-700'],
];

const ChatPreferences = ({ wallpaper, onWallpaperChange, disappearingTtl, onDisappearingChange }) => (
    <div className="border-b border-gray-800 bg-[#111b21] px-4 py-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#00a884]">Chat settings</h4>
        <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-white">Disappearing messages</span>
            <select
                value={disappearingTtl}
                onChange={event => onDisappearingChange(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-[#202c33] px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
            >
                <option value={0}>Off</option>
                <option value={60}>1 minute</option>
                <option value={3600}>1 hour</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
            </select>
            <span className="mt-1 block text-[11px] leading-4 text-gray-500">New messages will disappear after the selected time.</span>
        </label>
        <div>
            <span className="mb-2 block text-sm font-medium text-white">Chat wallpaper</span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {WALLPAPERS.map(([id, label, color]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onWallpaperChange(id)}
                        className={`rounded-lg border p-2 text-center ${wallpaper === id ? 'border-[#00a884]' : 'border-gray-700'}`}
                    >
                        <span className={`mx-auto mb-1 block h-8 w-full rounded ${color}`} />
                        <span className="text-[10px] text-gray-300">{label}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export default ChatPreferences;
