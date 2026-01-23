import React from 'react';
import { PhoneIcon, XMarkIcon } from '@heroicons/react/24/solid';

const IncomingCallModal = ({ callerName, onAccept, onReject }) => {
    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col items-center animate-bounce-short">
                <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mb-4 border-4 border-gray-600">
                    <span className="text-3xl">👤</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">{callerName}</h3>
                <p className="text-gray-400 mb-8 animate-pulse">Incoming Video Call...</p>

                <div className="flex gap-8 w-full justify-center">
                    <button
                        onClick={onReject}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                            <XMarkIcon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-sm text-gray-400">Decline</span>
                    </button>

                    <button
                        onClick={onAccept}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 animate-pulse">
                            <PhoneIcon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-sm text-gray-400">Accept</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallModal;
