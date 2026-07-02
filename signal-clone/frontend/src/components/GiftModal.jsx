import React, { useState } from 'react';
import { XMarkIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';

const ITEMS = [
    { id: 'dress1', name: 'Floral Summer Dress', price: '₹1,299', image: '👗', category: 'Clothing' },
    { id: 'watch', name: 'Smart Watch Pro', price: '₹3,499', image: '⌚', category: 'Electronics' },
    { id: 'perfume', name: 'Luxury Perfume', price: '₹999', image: '🧴', category: 'Beauty' },
    { id: 'shoes', name: 'Running Sneakers', price: '₹2,199', image: '👟', category: 'Shoes' },
    { id: 'headphones', name: 'Wireless Earbuds', price: '₹1,599', image: '🎧', category: 'Electronics' },
    { id: 'chocolates', name: 'Premium Assorted Chocolates', price: '₹499', image: '🍫', category: 'Food' }
];

const GiftModal = ({ onClose, onSend }) => {
    const [selectedItem, setSelectedItem] = useState(null);
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSendGift = () => {
        if (!selectedItem) return;
        setIsSending(true);
        setTimeout(() => {
            onSend({
                item: selectedItem,
                message: message || "Here's a gift for you!",
                status: 'Sent'
            });
            onClose();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-0 sm:p-4">
            <div className="w-full h-[85vh] sm:h-[80vh] max-w-lg bg-[#0b141a] sm:rounded-2xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col animate-slide-up">
                
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#111b21] border-b border-white/5">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-gray-300 transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <ShoppingBagIcon className="w-5 h-5 text-pink-500" />
                        <h2 className="text-white font-bold text-base tracking-wide">Shop & Gift</h2>
                    </div>
                    <div className="w-9" />
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-[#0b141a]">
                    {!selectedItem ? (
                        <>
                            <h3 className="text-white font-bold text-lg mb-4">Select a Gift</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {ITEMS.map(item => (
                                    <div 
                                        key={item.id}
                                        onClick={() => setSelectedItem(item)}
                                        className="bg-[#111b21] border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors group relative overflow-hidden"
                                    >
                                        <div className="text-5xl group-hover:scale-110 transition-transform duration-300">{item.image}</div>
                                        <div className="text-center w-full mt-2">
                                            <p className="text-white text-sm font-semibold truncate w-full">{item.name}</p>
                                            <p className="text-pink-400 font-bold text-sm mt-1">{item.price}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col h-full animate-fade-in">
                            <button onClick={() => setSelectedItem(null)} className="text-pink-500 text-sm font-semibold mb-4 flex items-center gap-1 hover:underline">
                                ← Back to catalog
                            </button>
                            
                            <div className="flex-1 flex flex-col items-center justify-center py-8">
                                <div className="text-8xl drop-shadow-2xl mb-6">{selectedItem.image}</div>
                                <h3 className="text-white font-bold text-2xl text-center">{selectedItem.name}</h3>
                                <p className="text-pink-400 text-xl font-bold mt-2">{selectedItem.price}</p>
                            </div>

                            <div className="mt-auto bg-[#111b21] rounded-2xl p-4 border border-white/5">
                                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Gift Message (Optional)</label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Write a sweet note..."
                                    className="w-full bg-[#202c33] border-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-pink-500 outline-none resize-none h-24"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                {selectedItem && (
                    <div className="p-4 bg-[#111b21] border-t border-white/5">
                        <button
                            onClick={handleSendGift}
                            disabled={isSending}
                            className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-90 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-opacity shadow-lg shadow-pink-500/20"
                        >
                            {isSending ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>Pay {selectedItem.price} & Send Gift</>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GiftModal;
