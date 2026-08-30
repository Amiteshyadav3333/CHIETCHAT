import React, { useState } from 'react';

const ModelSelector = ({ selectedModel, onModelChange }) => {
    const [isOpen, setIsOpen] = useState(false);

    const models = [
        { id: 'gpt-4', name: 'GPT-4', icon: '🧠', description: 'Most capable' },
        { id: 'gpt-3.5', name: 'GPT-3.5', icon: '⚡', description: 'Fast & efficient' },
        { id: 'claude-3', name: 'Claude 3', icon: '🎯', description: 'Balanced' },
        { id: 'gemini', name: 'Gemini', icon: '✨', description: 'Advanced' }
    ];

    const current = models.find(m => m.id === selectedModel);

    return (
        <div className="model-selector">
            <button 
                className="model-button"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="model-icon">{current?.icon}</span>
                <span className="model-name">{current?.name}</span>
                <span className="dropdown-arrow">▼</span>
            </button>

            {isOpen && (
                <div className="model-dropdown">
                    {models.map(model => (
                        <button
                            key={model.id}
                            className={`model-option ${selectedModel === model.id ? 'active' : ''}`}
                            onClick={() => {
                                onModelChange(model.id);
                                setIsOpen(false);
                            }}
                        >
                            <span className="option-icon">{model.icon}</span>
                            <div className="option-info">
                                <span className="option-name">{model.name}</span>
                                <span className="option-desc">{model.description}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModelSelector;
