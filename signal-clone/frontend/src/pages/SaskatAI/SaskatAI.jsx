import React, { useState, useRef, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import ChatInterface from './components/ChatInterface';
import ImageGenerator from './components/ImageGenerator';
import ModelSelector from './components/ModelSelector';
import './SaskatAI.css';

const SaskatAI = () => {
    const { user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [selectedModel, setSelectedModel] = useState('gpt-4');
    const [showImageGen, setShowImageGen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async (content) => {
        if (!content.trim()) return;

        const userMessage = {
            id: Date.now(),
            role: 'user',
            content,
            timestamp: new Date(),
            userPhoto: user?.avatar
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    model: selectedModel,
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                const aiMessage = {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date(),
                    sources: data.sources || [],
                    searched: data.searched || false
                };
                setMessages(prev => [...prev, aiMessage]);
            } else {
                const errorMessage = {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: data.error || 'Failed to get response',
                    timestamp: new Date(),
                    isError: true
                };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            const errorMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: 'Connection error. Please try again.',
                timestamp: new Date(),
                isError: true
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="saskat-ai-container">
            <div className="saskat-header">
                <div className="saskat-logo">
                    <span className="logo-icon">🤖</span>
                    <h1>Saskat AI</h1>
                    <p className="logo-subtitle">Powered by Advanced AI Models</p>
                </div>
                <div className="header-controls">
                    <ModelSelector 
                        selectedModel={selectedModel}
                        onModelChange={setSelectedModel}
                    />
                    <button 
                        className="image-btn"
                        onClick={() => setShowImageGen(!showImageGen)}
                        title="Image Generation"
                    >
                        🖼️ Generate
                    </button>
                </div>
            </div>

            <div className="saskat-main">
                <div className="chat-section">
                    <div className="messages-container">
                        {messages.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">✨</div>
                                <h2>Welcome to Saskat AI</h2>
                                <p>Ask me anything - I can help with questions, analysis, coding, writing, and more!</p>
                                <div className="quick-prompts">
                                    <button onClick={() => handleSendMessage('Explain quantum computing in simple terms')}>
                                        Quantum Computing
                                    </button>
                                    <button onClick={() => handleSendMessage('Write a Python function to sort an array')}>
                                        Python Function
                                    </button>
                                    <button onClick={() => handleSendMessage('What are the latest AI trends?')}>
                                        AI Trends
                                    </button>
                                    <button onClick={() => handleSendMessage('Help me write a professional email')}>
                                        Email Help
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="messages-list">
                                {messages.map((msg) => (
                                    <div key={msg.id} className={`message-wrapper ${msg.role}`}>
                                        <div className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}>
                                            {msg.role === 'user' && (
                                                <img src={msg.userPhoto || 'https://via.placeholder.com/32'} alt="User" className="avatar" />
                                            )}
                                            <div className="message-content">
                                                <div className="message-text">{msg.content}</div>
                                                {msg.sources && msg.sources.length > 0 && (
                                                    <div className="sources">
                                                        <div className="sources-label">📚 Sources:</div>
                                                        {msg.sources.map((source, idx) => (
                                                            <a key={idx} href={source.link} target="_blank" rel="noopener noreferrer" className="source-link">
                                                                {source.title}
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                                {msg.searched && (
                                                    <div className="search-badge">🔍 Web Search</div>
                                                )}
                                            </div>
                                            {msg.role === 'assistant' && (
                                                <div className="ai-avatar">🤖</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="message-wrapper assistant">
                                        <div className="message assistant">
                                            <div className="ai-avatar">🤖</div>
                                            <div className="message-content">
                                                <div className="typing-indicator">
                                                    <span></span>
                                                    <span></span>
                                                    <span></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    <div className="input-section">
                        <div className="input-wrapper">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(inputValue);
                                    }
                                }}
                                placeholder="Ask me anything..."
                                disabled={isLoading}
                                className="message-input"
                            />
                            <button
                                onClick={() => handleSendMessage(inputValue)}
                                disabled={isLoading || !inputValue.trim()}
                                className="send-btn"
                            >
                                {isLoading ? '⏳' : '➤'}
                            </button>
                        </div>
                        <p className="input-hint">Press Enter to send • Shift+Enter for new line</p>
                    </div>
                </div>

                {showImageGen && (
                    <div className="image-gen-section">
                        <ImageGenerator 
                            userId={user?.id}
                            onClose={() => setShowImageGen(false)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default SaskatAI;
