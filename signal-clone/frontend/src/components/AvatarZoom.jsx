import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';

const AvatarZoom = ({ src, name, size = 'w-10 h-10', className = '', onClick }) => {
    const [open, setOpen] = useState(false);
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=random&size=256`;

    const handleClick = (e) => {
        e.stopPropagation();
        if (onClick) { onClick(e); return; }
        setOpen(true);
    };

    return (
        <>
            <img
                src={src || fallback}
                alt={name}
                className={`${size} rounded-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${className}`}
                onClick={handleClick}
            />

            {open && (
                <div
                    className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center"
                    onClick={() => setOpen(false)}
                >
                    <div className="relative flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setOpen(false)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300"
                        >
                            <XMarkIcon className="w-7 h-7" />
                        </button>
                        <img
                            src={src || fallback}
                            alt={name}
                            className="w-72 h-72 md:w-96 md:h-96 rounded-full object-cover shadow-2xl border-4 border-white/10"
                        />
                        <p className="text-white font-bold text-xl">{name}</p>
                    </div>
                </div>
            )}
        </>
    );
};

export default AvatarZoom;
