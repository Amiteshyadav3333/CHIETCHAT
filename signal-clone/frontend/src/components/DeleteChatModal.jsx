export const canDeleteChatForEveryone = chat => (
    Boolean(chat) && (!chat.isGroup || chat.groupAdminId === chat.currentUserId)
);

const DeleteChatModal = ({ chat, onClose, onConfirm }) => {
    if (!chat) return null;

    const canDeleteForEveryone = canDeleteChatForEveryone(chat);
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f2c34] p-6 text-white shadow-2xl animate-scale-up"
                onClick={event => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-chat-title"
            >
                <h3 id="delete-chat-title" className="mb-2 text-lg font-bold">Delete chat?</h3>
                <p className="mb-6 text-sm text-gray-400">Are you sure you want to delete this chat conversation?</p>
                <div className="flex flex-col gap-2">
                    {canDeleteForEveryone && (
                        <button type="button" onClick={() => onConfirm('everyone')} className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold transition hover:bg-red-500">
                            Delete for everyone
                        </button>
                    )}
                    <button type="button" onClick={() => onConfirm('me')} className="w-full rounded-xl bg-white/10 py-3 text-sm font-semibold transition hover:bg-white/15">
                        Delete for me
                    </button>
                    <button type="button" onClick={onClose} className="w-full rounded-xl py-3 text-sm font-semibold text-gray-400 transition hover:text-white">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteChatModal;
