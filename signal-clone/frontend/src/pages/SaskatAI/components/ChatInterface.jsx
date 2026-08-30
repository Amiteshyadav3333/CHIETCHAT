import React, { useState, useRef, useEffect } from 'react';

const ChatInterface = ({ messages, onSendMessage, isLoading, userPhoto }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input);
            setInput('');
        }
    };

    return (
        <div className="chat-interface">
            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🤖</div>
                        <h2>Welcome to Saskat AI</h2>
                        <p>Ask me anything - I can help with questions, generate images, fill forms, and more!</p>
                        <div className="quick-prompts">
                            <button onClick={() => onSendMessage('What is AI?')}>What is AI?</button>
                            <button onClick={() => onSendMessage('Generate an image of a sunset')}>Generate Image</button>
                            <button onClick={() => onSendMessage('Help me fill a form')}>Fill Form</button>
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`message ${msg.role}`}>
                            {msg.role === 'user' && (
                                <div className="user-message">
                                    <div className="message-content">{msg.content}</div>
                                    <img src={userPhoto} alt="User" className="user-avatar" />
                                </div>
                            )}
                            {msg.role === 'assistant' && (
                                <div className="ai-message">
                                    <div className="ai-avatar">🤖</div>
                                    <div className="message-content">
                                        {msg.content}
                                        {msg.sources && msg.sources.length > 0 && (
                                            <div className="sources">
                                                <strong>Sources:</strong>
                                                {msg.sources.map((source, idx) => (
                                                    <a key={idx} href={source.url} target="_blank" rel="noopener noreferrer">
                                                        {source.title}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="message assistant">
                        <div className="ai-message">
                            <div className="ai-avatar">🤖</div>
                            <div className="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="input-form">
                <div className="input-wrapper">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Saskat AI anything..."
                        disabled={isLoading}
                        className="chat-input"
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading || !input.trim()}
                        className="send-btn"
                    >
                        ➤
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ChatInterface;
