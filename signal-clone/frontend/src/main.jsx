import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import LegalPage from './pages/LegalPage';
import ProfileSetup from './pages/ProfileSetup';
import PublicReel from './pages/PublicReel';
import './index.css';
import axios from 'axios';

// Set base URL for production; Vite proxy handles local dev if this is empty/undefined
if (import.meta.env.VITE_API_URL) {
    axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

const ProtectedRoute = ({ children }) => {
    const { token, loading } = React.useContext(AuthContext);
    if (loading) return <div>Loading...</div>;
    return token ? children : <Navigate to="/login" />;
};

const SplashScreen = () => {
    const [render, setRender] = React.useState(true);
    const [fade, setFade] = React.useState(false);
    
    React.useEffect(() => {
        const timer1 = setTimeout(() => setFade(true), 1500);
        const timer2 = setTimeout(() => setRender(false), 2000);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, []);

    if (!render) return null;

    return (
        <div className={`fixed inset-0 flex flex-col items-center justify-center bg-[#111b21] z-[9999] transition-opacity duration-500 ease-in-out ${fade ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex-1 flex items-center justify-center">
                <div className="w-20 h-20 bg-[#00a884] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(0,168,132,0.4)] animate-pulse">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
            </div>
            <div className="pb-10 flex flex-col items-center">
                <span className="text-gray-400 text-xs font-medium mb-1 tracking-wider uppercase">from</span>
                <span className="text-[#00a884] text-xl font-bold tracking-widest uppercase">CHEETCHAT</span>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <SplashScreen />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
                <SocketProvider>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/terms" element={<LegalPage type="terms" />} />
                        <Route path="/privacy" element={<LegalPage type="privacy" />} />
                        <Route path="/reels/:reelId" element={<PublicReel />} />
                        <Route path="/setup-profile" element={
                            <ProtectedRoute>
                                <ProfileSetup />
                            </ProtectedRoute>
                        } />
                        <Route path="/" element={
                            <ProtectedRoute>
                                <Home />
                            </ProtectedRoute>
                        } />
                    </Routes>
                </SocketProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>,
)
