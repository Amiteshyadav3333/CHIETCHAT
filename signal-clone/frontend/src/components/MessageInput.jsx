import React, { useRef, useState } from 'react';
import { PaperAirplaneIcon, PhotoIcon, FaceSmileIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid';
import EmojiPicker from 'emoji-picker-react';

const MessageInput = ({ onSend, onUpload }) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

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
        e.target.value = '';
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
                const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: audioBlob.type });
                stream.getTracks().forEach(track => track.stop());

                if (audioBlob.size > 0) {
                    onUpload(audioFile);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error(err);
            alert("Microphone permission is needed to record voice messages.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    const handleActionClick = () => {
        if (text.trim()) return;
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        <div className="p-2 md:p-3 bg-signal-secondary flex items-end gap-2 relative border-t border-gray-800">
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
                <div className="flex-1 flex items-center bg-signal-input rounded-3xl pr-1">
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={isRecording ? "Recording voice message..." : "Signal message"}
                        disabled={isRecording}
                        className="flex-1 min-w-0 bg-transparent text-gray-100 px-4 py-3 focus:outline-none font-light"
                    />

                    {isRecording && (
                        <span className="text-xs text-red-400 px-2 animate-pulse whitespace-nowrap">
                            Recording
                        </span>
                    )}
                </div>

                <button
                    type={text.trim() ? "submit" : "button"}
                    onClick={handleActionClick}
                    className={`p-3 rounded-full transition-all ${text.trim() ? 'bg-signal-accent text-white' : isRecording ? 'bg-red-600 text-white' : 'bg-signal-input text-gray-400'}`}
                    title={text.trim() ? "Send" : isRecording ? "Stop and send voice" : "Record voice"}
                >
                    {text.trim() ? (
                        <PaperAirplaneIcon className="w-5 h-5" />
                    ) : isRecording ? (
                        <StopIcon className="w-5 h-5" />
                    ) : (
                        <MicrophoneIcon className="w-5 h-5" />
                    )}
                </button>
            </form>
        </div>
    );
};

export default MessageInput;
