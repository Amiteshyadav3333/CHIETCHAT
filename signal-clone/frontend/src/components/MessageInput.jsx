import React, { useRef, useState } from 'react';
import { 
    PaperAirplaneIcon, FaceSmileIcon, PaperClipIcon, MicrophoneIcon, 
    StopIcon, XMarkIcon, ChartBarIcon, MapPinIcon, DocumentIcon,
    MusicalNoteIcon, PhotoIcon, CameraIcon, UserCircleIcon
} from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import EmojiPicker from 'emoji-picker-react';

const MessageInput = ({ onSend, onUpload, onStartLiveLocation, replyTo, onCancelReply }) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [pollData, setPollData] = useState({ question: '', options: ['', ''] });
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    const openFilePicker = (accept) => {
        if (!fileInputRef.current) return;
        fileInputRef.current.accept = accept;
        fileInputRef.current.click();
    };

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
        if (files.length > 15) {
            alert('You can only select up to 15 files at once.');
            return;
        }
        files.forEach(file => onUpload(file));
        e.target.value = '';
        setShowAttachMenu(false);
    };

    const handleShareLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return;
        }
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            onSend(JSON.stringify({ lat: latitude, lng: longitude }), 'location');
            setShowAttachMenu(false);
        }, () => {
            alert("Unable to retrieve your location");
        });
    };

    const handleCreatePoll = () => {
        if (!pollData.question.trim() || pollData.options.some(opt => !opt.trim())) {
            alert("Please fill in the question and all options");
            return;
        }
        onSend(JSON.stringify(pollData), 'poll');
        setShowPollCreator(false);
        setPollData({ question: '', options: ['', ''] });
        setShowAttachMenu(false);
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
            {/* Poll Creator Modal */}
            {showPollCreator && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-[#2a3942] w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white font-bold text-lg">Create Poll</h3>
                            <button onClick={() => setShowPollCreator(false)}><XMarkIcon className="w-6 h-6 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <input 
                                placeholder="Question" 
                                value={pollData.question}
                                onChange={e => setPollData({...pollData, question: e.target.value})}
                                className="w-full bg-[#111b21] text-white p-3 rounded-lg outline-none border border-gray-700 focus:border-signal-accent"
                            />
                            {pollData.options.map((opt, i) => (
                                <input 
                                    key={i}
                                    placeholder={`Option ${i+1}`}
                                    value={opt}
                                    onChange={e => {
                                        const newOpts = [...pollData.options];
                                        newOpts[i] = e.target.value;
                                        setPollData({...pollData, options: newOpts});
                                    }}
                                    className="w-full bg-[#111b21] text-white p-3 rounded-lg outline-none border border-gray-700"
                                />
                            ))}
                            {pollData.options.length < 5 && (
                                <button 
                                    onClick={() => setPollData({...pollData, options: [...pollData.options, '']})}
                                    className="text-signal-accent text-sm font-bold"
                                >
                                    + Add Option
                                </button>
                            )}
                            <button 
                                onClick={handleCreatePoll}
                                className="w-full bg-signal-accent text-white py-3 rounded-xl font-bold mt-2"
                            >
                                Send Poll
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reply Preview Bar */}
            {replyTo && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#2a3942] border-b border-gray-700 animate-slide-up">
                    <ArrowUturnLeftIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-blue-400 font-semibold truncate">{replyTo.senderName || 'Message'}</p>
                        <p className="text-xs text-gray-400 truncate italic">
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

            {/* Attachment Menu */}
            {showAttachMenu && (
                <div className="absolute bottom-full left-2 sm:left-10 mb-3 z-50 w-[calc(100vw-1rem)] max-w-sm rounded-3xl bg-[#233138] p-3 shadow-2xl border border-white/10 animate-slide-up">
                    <div className="grid grid-cols-4 gap-2">
                        <AttachOption
                            label="Gallery"
                            color="bg-fuchsia-600"
                            icon={<PhotoIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('image/*,video/*')}
                        />
                        <AttachOption
                            label="Camera"
                            color="bg-rose-500"
                            icon={<CameraIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('image/*,video/*')}
                        />
                        <AttachOption
                            label="Document"
                            color="bg-indigo-500"
                            icon={<DocumentIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('*/*')}
                        />
                        <AttachOption
                            label="Audio"
                            color="bg-orange-500"
                            icon={<MusicalNoteIcon className="w-6 h-6 text-white" />}
                            onClick={() => openFilePicker('audio/*')}
                        />
                        <AttachOption
                            label="Location"
                            color="bg-emerald-500"
                            icon={<MapPinIcon className="w-6 h-6 text-white" />}
                            onClick={handleShareLocation}
                        />
                        <AttachOption
                            label="Live"
                            color="bg-red-500"
                            icon={<MapPinIcon className="w-6 h-6 text-white" />}
                            onClick={() => { onStartLiveLocation(); setShowAttachMenu(false); }}
                        />
                        <AttachOption
                            label="Poll"
                            color="bg-yellow-500"
                            icon={<ChartBarIcon className="w-6 h-6 text-white" />}
                            onClick={() => setShowPollCreator(true)}
                        />
                        <AttachOption
                            label="Contact"
                            color="bg-cyan-500"
                            icon={<UserCircleIcon className="w-6 h-6 text-white" />}
                            onClick={() => alert('Contact sharing coming soon')}
                        />
                    </div>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept="*/*" />
                </div>
            )}

            <div className="flex items-end gap-2 px-3 py-2">
                {/* Emoji + Attach */}
                {!isRecording && (
                    <div className="flex items-center gap-1 flex-shrink-0 pb-1">
                        <button
                            onClick={() => { setShowEmoji(v => !v); setShowAttachMenu(false); }}
                            className={`p-2 rounded-full transition-colors ${showEmoji ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <FaceSmileIcon className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={() => { setShowAttachMenu(v => !v); setShowEmoji(false); }}
                            className={`p-2 rounded-full transition-colors ${showAttachMenu ? 'text-blue-400 rotate-45' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <PaperClipIcon className="w-6 h-6" />
                        </button>
                    </div>
                )}

                {/* Input */}
                <form onSubmit={handleSubmit} className="flex-1 flex items-end gap-2">
                    {isRecording ? (
                        <div className="flex-1 flex items-center gap-3 bg-[#2a3942] rounded-3xl px-4 py-3">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-red-400 text-sm font-medium">Recording voice message...</span>
                        </div>
                    ) : (
                        <textarea
                            ref={inputRef}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            rows={1}
                            className="flex-1 bg-[#2a3942] text-gray-100 placeholder-gray-500 rounded-3xl px-4 py-3 text-[15px] focus:outline-none resize-none max-h-32 overflow-y-auto leading-relaxed"
                            style={{ scrollbarWidth: 'none' }}
                            onClick={() => { setShowEmoji(false); setShowAttachMenu(false); }}
                        />
                    )}

                    {/* Send / Mic button */}
                    {text.trim() ? (
                        <button
                            type="submit"
                            className="w-11 h-11 bg-signal-accent hover:bg-signal-accentHover rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg"
                        >
                            <PaperAirplaneIcon className="w-5 h-5 text-white" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-signal-accent hover:bg-signal-accentHover'}`}
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

const AttachOption = ({ label, color, icon, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1.5 py-2 hover:bg-white/5 active:scale-95 transition"
    >
        <span className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center shadow-lg`}>
            {icon}
        </span>
        <span className="text-[11px] leading-tight text-gray-200 truncate max-w-full">{label}</span>
    </button>
);

export default MessageInput;
