import React, { useState } from 'react';
import { XMarkIcon, MapPinIcon } from '@heroicons/react/24/outline';

const CARS = [
    { id: 'mini', name: 'Uber Go', time: '3 min', price: '₹145', icon: '🚗', desc: 'Affordable, compact rides', app: 'uber' },
    { id: 'sedan', name: 'Uber Sedan', time: '5 min', price: '₹185', icon: '🚙', desc: 'Comfortable sedans', app: 'uber' },
    { id: 'suv', name: 'Uber XL', time: '8 min', price: '₹260', icon: '🚐', desc: 'SUVs for groups up to 6', app: 'uber' },
    { id: 'rapido_bike', name: 'Rapido Bike', time: '2 min', price: '₹49', icon: '🏍️', desc: 'Fast & affordable bike rides', app: 'rapido' },
    { id: 'rapido_auto', name: 'Rapido Auto', time: '4 min', price: '₹89', icon: '🛺', desc: 'Quick auto rides', app: 'rapido' },
    { id: 'rapido_cab', name: 'Rapido Cab', time: '6 min', price: '₹129', icon: '🚕', desc: 'Comfortable cab rides', app: 'rapido' },
];

const RideModal = ({ onClose, onSend }) => {
    const [pickup, setPickup] = useState('Current Location');
    const [destination, setDestination] = useState('');
    const [selectedCar, setSelectedCar] = useState(CARS[0]);

    const handleBook = () => {
        if (!destination.trim()) {
            alert("Please enter a destination");
            return;
        }
        const partnerUrl = selectedCar.app === 'rapido' ? 'https://www.rapido.bike' : 'https://www.uber.com/in/en/ride/';
        window.open(partnerUrl, '_blank', 'noopener,noreferrer');
        onSend({
            pickup: pickup.trim(),
            destination: destination.trim(),
            car: selectedCar,
            status: 'Ride plan shared — booking not verified',
            eta: selectedCar.time,
            partnerUrl,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-[#111b21] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                
                {/* Header (Map Mockup) */}
                <div className="relative h-48 bg-gray-800 shrink-0">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
                    <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-30" aria-hidden="true">🚕</div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111b21] to-transparent" />
                    
                    <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-md">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    
                    <div className="absolute bottom-4 left-4 text-white font-bold text-xl drop-shadow-md">
                        Book a Ride
                    </div>
                </div>

                <div className="p-4 flex-1 overflow-y-auto">
                    {/* Location Inputs */}
                    <div className="relative flex flex-col gap-3 mb-6">
                        <div className="absolute left-[11px] top-[22px] bottom-[22px] w-0.5 bg-gray-700 z-0" />
                        
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            </div>
                            <input 
                                type="text"
                                value={pickup}
                                onChange={(e) => setPickup(e.target.value)}
                                className="flex-1 bg-[#202c33] border-none rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                placeholder="Pickup location"
                            />
                        </div>
                        
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                                <MapPinIcon className="w-5 h-5 text-red-500" />
                            </div>
                            <input 
                                type="text"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                                className="flex-1 bg-[#202c33] border-none rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-red-500 outline-none"
                                placeholder="Where to?"
                            />
                        </div>
                    </div>

                {/* Car Selection */}
                    <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Available Rides</h3>
                    <div className="flex flex-col gap-2">
                        {CARS.map(car => (
                            <button
                                key={car.id}
                                onClick={() => setSelectedCar(car)}
                                className={`flex items-center justify-between p-3 rounded-xl border ${selectedCar.id === car.id ? 'bg-[#202c33] border-blue-500' : 'bg-transparent border-white/5 hover:bg-[#202c33]'} transition-colors text-left`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-3xl drop-shadow-md">{car.icon}</span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-bold">{car.name}</span>
                                            {car.app === 'rapido' && (
                                                <span className="bg-yellow-500/20 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded font-bold">RAPIDO</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">{car.time} • {car.desc}</div>
                                    </div>
                                </div>
                                <span className="text-white font-bold text-lg">{car.price}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-[#202c33] border-t border-white/5">
                    <button
                        onClick={handleBook}
                        className={`w-full py-3.5 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg relative overflow-hidden ${
                            selectedCar.app === 'rapido'
                                ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-900/20'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/20'
                        }`}
                    >
                        {selectedCar.app === 'rapido' ? (
                            <>🏍️ Open Rapido & share plan</>
                        ) : (
                            <>Open Uber & share plan</>
                        )}
                    </button>
                    <p className="mt-2 text-center text-[10px] leading-4 text-gray-400">Prices and arrival times shown above are examples. Booking and payment happen in the partner service and are not verified by CHEETCHAT.</p>
                </div>
            </div>
        </div>
    );
};

export default RideModal;
