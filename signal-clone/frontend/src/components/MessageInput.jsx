import React, { useRef, useState } from 'react';
import { PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, MicrophoneIcon, StopIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import EmojiPicker from 'emoji-picker-react';

const MessageInput = ({ onSend, onUpload, replyTo, onCancelReply }) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const inputRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim()) {
            onSend(text.trim(), 'text');
            setText('');
            setShowEmoji(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleEmojiClick = (emojiData) => {
        setText(prev => prev + emojiData.emoji);
        inputRef.current?.focus();
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => onUpload(file));
        e.target.value = '';
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
                const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
                stream.getTracks().forEach(t => t.stop());
                if (blob.size > 0) onUpload(file);
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch {
            alert('Microphone permission needed.');
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    return (
        <div className="relative bg-[#202c33] border-t border-gray-800">
            {/* Reply Preview Bar */}
            {replyTo && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#2a3942] border-b border-gray-700">
                    <ArrowUturnLeftIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-blue-400 font-semibold truncate">{replyTo.senderName || 'Message'}</p>
                        <p className="text-xs text-gray-400 truncate">
                            {replyTo.type && replyTo.type !== 'text' ? `📎 ${replyTo.type}` : replyTo.content}
                        </p>
                    </div>
                    <button onClick={onCancelReply} className="text-gray-400 hover:text-white flex-shrink-0">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}
            {/* Emoji Picker */}
            {showEmoji && (
                <div className="absolute bottom-full left-0 z-50">
                    <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        theme="dark"
                        height={380}
                        width={320}
                        searchDisabled={false}
                        skinTonesDisabled
                        previewConfig={{ showPreview: false }}
                    />
                </div>
            )}

            <div className="flex items-end gap-2 px-3 py-2">
                {/* Emoji + Attach */}
                {!isRecording && (
                    <div className="flex items-center gap-1 flex-shrink-0 pb-1">
                        <button
                            onClick={() => setShowEmoji(v => !v)}
                            className={`p-2 rounded-full transition-colors ${showEmoji ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <FaceSmileIcon className="w-6 h-6" />
                        </button>
                        <label className="p-2 text-gray-400 hover:text-gray-200 cursor-pointer rounded-full transition-colors">
                            <input type="file" className="hidden" onChange={handleFileChange} multiple accept="*/*" />
                            <PaperClipIcon className="w-6 h-6" />
                        </label>
                    </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="flex-1 flex items-end gap-2">
                    {isRecording ? (
                        <div className="flex-1 flex items-center gap-3 bg-[#2a3942] rounded-3xl px-4 py-3">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-red-400 text-sm font-medium">Recording...</span>
                        </div>
                    ) : (
                        <textarea
                            ref={inputRef}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Message"
                            rows={1}
                            className="flex-1 bg-[#2a3942] text-gray-100 placeholder-gray-500 rounded-3xl px-4 py-3 text-[15px] focus:outline-none resize-none max-h-32 overflow-y-auto leading-relaxed"
                            style={{ scrollbarWidth: 'none' }}
                            onClick={() => setShowEmoji(false)}
                        />
                    )}

                    {/* Send / Mic button */}
                    {text.trim() ? (
                        <button
                            type="submit"
                            className="w-11 h-11 bg-[#00a884] hover:bg-[#00c49a] rounded-full flex items-center justify-center flex-shrink-0 transition-colors shadow-lg"
                        >
                            <PaperAirplaneIcon className="w-5 h-5 text-white" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-[#00a884] hover:bg-[#00c49a]'}`}
                        >
                            {isRecording
                                ? <StopIcon className="w-5 h-5 text-white" />
                                : <MicrophoneIcon className="w-5 h-5 text-white" />
                            }
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};

export default MessageInput;
