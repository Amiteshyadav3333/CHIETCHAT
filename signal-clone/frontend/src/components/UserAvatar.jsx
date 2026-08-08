import { useMemo, useState } from 'react';
import { getSafeMediaUrl } from '../utils/safeUrl';

const COLORS = ['#0f766e', '#1d4ed8', '#7e22ce', '#be123c', '#b45309', '#047857'];

export const getInitials = name => {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
};

const UserAvatar = ({ src, name, className = '', onClick, alt = '', ...props }) => {
    const [failedSource, setFailedSource] = useState('');
    const normalizedSource = getSafeMediaUrl(
        src,
        typeof window === 'undefined' ? 'https://cheetchat.invalid' : window.location.href,
    ) || '';
    const showImage = normalizedSource && failedSource !== normalizedSource;
    const background = useMemo(() => {
        const seed = Array.from(String(name || '?')).reduce((total, character) => total + character.charCodeAt(0), 0);
        return COLORS[seed % COLORS.length];
    }, [name]);

    if (showImage) {
        return (
            <img
                src={normalizedSource}
                alt={alt || name || 'User avatar'}
                className={className}
                onClick={onClick}
                onError={() => setFailedSource(normalizedSource)}
                referrerPolicy="no-referrer"
                {...props}
            />
        );
    }

    return (
        <span
            className={`inline-flex select-none items-center justify-center font-bold uppercase text-white ${className}`}
            style={{ backgroundColor: background }}
            onClick={onClick}
            role={onClick ? 'button' : 'img'}
            aria-label={alt || `${name || 'User'} avatar`}
            {...props}
        >
            {getInitials(name)}
        </span>
    );
};

export default UserAvatar;
