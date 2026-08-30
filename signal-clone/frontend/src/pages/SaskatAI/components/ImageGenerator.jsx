import React, { useState } from 'react';

const ImageGenerator = ({ userId, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState('dall-e-3');
    const [generatedImages, setGeneratedImages] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);

    const models = [
        { id: 'dall-e-3', name: 'DALL-E 3' },
        { id: 'midjourney', name: 'Midjourney' },
        { id: 'stable-diffusion', name: 'Stable Diffusion' }
    ];

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        try {
            const response = await fetch('/api/ai/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    model,
                    userId
                })
            });

            const data = await response.json();
            setGeneratedImages(prev => [...prev, ...data.images]);
        } catch (error) {
            console.error('Failed to generate image:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="image-generator">
            <div className="gen-header">
                <h3>Image Generator</h3>
                <button className="close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="gen-controls">
                <select 
                    value={model} 
                    onChange={(e) => setModel(e.target.value)}
                    className="model-select"
                >
                    {models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>

                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want to generate..."
                    className="prompt-input"
                    rows="3"
                />

                <button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className="generate-btn"
                >
                    {isGenerating ? 'Generating...' : 'Generate Image'}
                </button>
            </div>

            <div className="generated-images">
                {generatedImages.map((img, idx) => (
                    <div key={idx} className="image-item">
                        <img src={img.url} alt={`Generated ${idx}`} />
                        <a href={img.url} download className="download-btn">
                            ⬇️ Download
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ImageGenerator;
