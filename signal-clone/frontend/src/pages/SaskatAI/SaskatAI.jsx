import React, { useState, useRef, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import ChatInterface from './components/ChatInterface';
import AdPanel from './components/AdPanel';
import VoiceMode from './components/VoiceMode';
import ImageGenerator from './components/ImageGenerator';
import ModelSelector from './components/ModelSelector';
import './SaskatAI.css';

const SaskatAI = () => {
    const { user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gpt-4');
    const [showImageGen, setShowImageGen] = useState(false);
    const [currentAd, setCurrentAd] = useState(null);
    const [adHistory, setAdHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const adTimerRef = useRef(null);
    const adShowTimeRef = useRef(0);

    // Show ad every 5 minutes
    useEffect(() => {
        const showAdInterval = setInterval(() => {
            fetchAndShowAd();
        }, 5 * 60 * 1000);

        return () => clearInterval(showAdInterval);
    }, []);

    const fetchAndShowAd = async () => {
        try {
            const response = await fetch('/api/ai/ads/get-contextual-ad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userContext: messages[messages.length - 1]?.content || '',
                    userId: user?.id,
                })
            });
            const ad = await response.json();
            setCurrentAd(ad);
            adShowTimeRef.current = Date.now();
        } catch (error) {
            console.error('Failed to fetch ad:', error);
        }
    };

    const handleSendMessage = async (content) => {
        const userMessage = {
            id: Date.now(),
            role: 'user',
            content,
            timestamp: new Date(),
            userPhoto: user?.avatar
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // Fetch contextual ad based on user query
            const adResponse = await fetch('/api/ai/ads/get-contextual-ad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userContext: content,
                    userId: user?.id,
                })
            });
            const ad = await adResponse.json();
            if (ad) {
                setCurrentAd(ad);
                adShowTimeRef.current = Date.now();
            }

            // Get AI response
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    model: selectedModel,
                    userId: user?.id,
                })
            });

            const data = await response.json();
            const aiMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
                sources: data.sources || []
            };

            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloseAd = () => {
        setCurrentAd(null);
        setAdHistory(prev => [...prev, currentAd]);
    };

    return (
        <div className="saskat-ai-container">
            <div className="saskat-header">
                <div className="saskat-logo">
                    <span className="logo-icon">🤖</span>
                    <h1>Saskat AI</h1>
                </div>
                <div className="header-controls">
                    <ModelSelector 
                        selectedModel={selectedModel}
                        onModelChange={setSelectedModel}
                    />
                    <button 
                        className="voice-btn"
                        onClick={() => setIsVoiceMode(!isVoiceMode)}
                        title="Toggle Voice Mode"
                    >
                        🎤
                    </button>
                    <button 
                        className="image-btn"
                        onClick={() => setShowImageGen(!showImageGen)}
                        title="Image Generation"
                    >
                        🖼️
                    </button>
                </div>
            </div>

            <div className="saskat-main">
                <div className="chat-section">
                    {isVoiceMode ? (
                        <VoiceMode 
                            onTranscript={handleSendMessage}
                            isLoading={isLoading}
                        />
                    ) : (
                        <ChatInterface 
                            messages={messages}
                            onSendMessage={handleSendMessage}
                            isLoading={isLoading}
                            userPhoto={user?.avatar}
                        />
                    )}
                </div>

                {showImageGen && (
                    <div className="image-gen-section">
                        <ImageGenerator 
                            userId={user?.id}
                            onClose={() => setShowImageGen(false)}
                        />
                    </div>
                )}

                {currentAd && (
                    <AdPanel 
                        ad={currentAd}
                        onClose={handleCloseAd}
                        onProductClick={(productId) => {
                            // Handle product purchase
                            window.open(`/shopping/${productId}`, '_blank');
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default SaskatAI;
