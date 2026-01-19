import React, { useState } from 'react';
import { PaperAirplaneIcon, PhotoIcon, FaceSmileIcon, MicrophoneIcon } from '@heroicons/react/24/solid';
import EmojiPicker from 'emoji-picker-react';

const MessageInput = ({ onSend, onUpload }) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim()) {
            onSend(text, 'text');
            setText('');
        }
    };

    const handleEmojiClick = (emojiData) => {
        setText((prev) => prev + emojiData.emoji);
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            onUpload(file);
        }
    };

    return (
        <div className="p-3 bg-signal-secondary flex items-end gap-2 relative border-t border-gray-800">
            {showEmoji && (
                <div className="absolute bottom-16 left-0">
                    <EmojiPicker onEmojiClick={handleEmojiClick} theme="dark" />
                </div>
            )}

            <button
                className="p-2 text-gray-400 hover:text-gray-200 transition-colors bg-signal-input rounded-full"
                onClick={() => setShowEmoji(!showEmoji)}
            >
                <FaceSmileIcon className="w-6 h-6" />
            </button>

            <label className="p-2 text-gray-400 hover:text-gray-200 transition-colors bg-signal-input rounded-full cursor-pointer">
                <input type="file" className="hidden" onChange={handleFileChange} />
                <PhotoIcon className="w-6 h-6" />
            </label>

            <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Signal message"
                    className="flex-1 bg-signal-input text-gray-100 rounded-3xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-gray-600 transition-all font-light"
                />

                {text.trim() || 'voice' ? (
                    <button
                        type="submit"
                        className={`p-3 rounded-full transition-all ${text.trim() ? 'bg-signal-accent text-white' : 'bg-signal-input text-gray-400'}`}
                    >
                        {text.trim() ? <PaperAirplaneIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
                    </button>
                ) : null}
            </form>
        </div>
    );
};

export default MessageInput;
