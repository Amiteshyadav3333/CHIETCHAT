import React, { useEffect, useRef } from 'react';
import UserAvatar from './UserAvatar';
import { getSafeMediaUrl, openSafeExternal } from '../utils/safeUrl';

/* ─── Canvas-based Waveform Visualizer ─── */
export const WaveformVisualizer = ({ active, color }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationId;
        let phase = 0;

        const render = () => {
            if (!canvas) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const width = canvas.width;
            const height = canvas.height;
            const mid = height / 2;

            const waves = [
                { amplitude: active ? 22 : 3, frequency: 0.015, speed: 0.08, opacity: 0.8 },
                { amplitude: active ? 16 : 2, frequency: 0.02, speed: -0.05, opacity: 0.4 },
                { amplitude: active ? 9 : 1.5, frequency: 0.01, speed: 0.04, opacity: 0.2 }
            ];

            waves.forEach(w => {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = w.opacity;

                for (let x = 0; x < width; x++) {
                    const y = mid + Math.sin(x * w.frequency + phase * w.speed) * w.amplitude;
                    if (x === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            });

            phase += 1.2;
            animationId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationId);
    }, [active, color]);

    return <canvas ref={canvasRef} width={280} height={60} style={{ display: 'block', margin: '0 auto', opacity: 0.9 }} />;
};

/* ─── Emoji quick picker ─── */
export const EMOJIS = ['😊','😂','🥺','😍','🔥','💯','👀','🙏','❤️','😎','🤔','😭','✨','🥰','😅'];

/* ─── Markdown renderer (bold, code, inline code) ─── */
export const renderMarkdown = (text) => {
    const parts = String(text ?? '').split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const code = part.slice(3, -3).replace(/^\w+\n/, '');
            return (
                <pre key={i} className="ai-code-block">
                    {code}
                </pre>
            );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="ai-inline-code">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
    });
};

/* ─── Typing dots ─── */
export const TypingDots = () => (
    <div className="ai-typing-dots">
        <span /><span /><span />
    </div>
);

/* ─── Message bubble ─── */
export const MessageBubble = ({ msg, botInfo }) => {
    const safeMessage = msg && typeof msg === 'object' ? msg : {};
    const isUser = safeMessage.role === 'user';
    const safeImageUrl = getSafeMediaUrl(safeMessage.imageUrl, typeof window === 'undefined' ? 'https://cheetchat.invalid' : window.location.href);
    const isImage = Boolean(safeImageUrl);

    return (
        <div className={`ai-msg-row ${isUser ? 'ai-msg-row--user' : 'ai-msg-row--bot'}`}>
            {!isUser && (
                <div className="ai-avatar-sm">
                    <UserAvatar src={botInfo?.avatar} name={botInfo?.name || 'Aria'} />
                    <span className="ai-avatar-online" />
                </div>
            )}
            <div className={`ai-bubble ${isUser ? 'ai-bubble--user' : 'ai-bubble--bot'}`}>
                {isImage ? (
                    <>
                        <p className="ai-bubble-text">{String(safeMessage.content ?? '')}</p>
                        <img
                            src={safeImageUrl}
                            alt="AI Generated"
                            className="ai-gen-img"
                            onClick={() => openSafeExternal(safeImageUrl)}
                            referrerPolicy="no-referrer"
                        />
                    </>
                ) : (
                    <div className="ai-bubble-text">
                        {renderMarkdown(safeMessage.content)}
                    </div>
                )}
                <span className="ai-bubble-time">
                    {safeMessage.timestamp && !Number.isNaN(new Date(safeMessage.timestamp).getTime())
                        ? new Date(safeMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                </span>
            </div>
        </div>
    );
};
