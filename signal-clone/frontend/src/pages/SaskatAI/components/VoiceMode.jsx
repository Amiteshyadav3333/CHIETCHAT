import React, { useState, useRef } from 'react';

const VoiceMode = ({ onTranscript, isLoading }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);

    React.useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onstart = () => setIsListening(true);
            recognitionRef.current.onend = () => setIsListening(false);

            recognitionRef.current.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcriptSegment = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        setTranscript(transcriptSegment);
                        onTranscript(transcriptSegment);
                    } else {
                        interimTranscript += transcriptSegment;
                    }
                }
            };
        }
    }, [onTranscript]);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            setTranscript('');
            recognitionRef.current?.start();
        }
    };

    return (
        <div className="voice-mode">
            <div className="voice-container">
                <div className={`voice-indicator ${isListening ? 'active' : ''}`}>
                    <div className="pulse"></div>
                </div>
                <p className="voice-status">
                    {isListening ? 'Listening...' : 'Click to start speaking'}
                </p>
                {transcript && (
                    <div className="transcript-display">
                        <p>{transcript}</p>
                    </div>
                )}
            </div>
            <button 
                className={`voice-toggle ${isListening ? 'active' : ''}`}
                onClick={toggleListening}
                disabled={isLoading}
            >
                🎤
            </button>
        </div>
    );
};

export default VoiceMode;
