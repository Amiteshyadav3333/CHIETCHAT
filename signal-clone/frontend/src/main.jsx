import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from './utils/clientRouter';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import LegalPage from './pages/LegalPage';
import ProfileSetup from './pages/ProfileSetup';
import PublicReel from './pages/PublicReel';
import RecoveryCode from './pages/RecoveryCode';
import './index.css';
import axios from 'axios';
import { API_BASE_URL } from './utils/apiBaseUrl';

axios.defaults.withCredentials = true;
axios.interceptors.request.use(config => {
    const csrfToken = sessionStorage.getItem('cheetchat_csrf_token');
    if (csrfToken && !['get', 'head', 'options'].includes(String(config.method || 'get').toLowerCase())) {
        config.headers.set('X-CSRF-Token', csrfToken);
    }
    return config;
});

// Suppress expected 401 errors from /api/auth/me during initial auth check
const originalError = console.error;
const originalWarn = console.warn;
const shouldSuppress = (args) => {
    const message = String(args[0] || '');
    return message.includes('/api/auth/me') && message.includes('401');
};
console.error = function(...args) {
    if (!shouldSuppress(args)) originalError.apply(console, args);
};
console.warn = function(...args) {
    if (!shouldSuppress(args)) originalWarn.apply(console, args);
};

// Set base URL for production; Vite proxy handles local dev if this is empty/undefined
if (API_BASE_URL) {
    axios.defaults.baseURL = API_BASE_URL;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.warn('Offline app shell registration failed', error);
        });
    });
}

const ProtectedRoute = ({ children }) => {
    const { token, loading } = React.useContext(AuthContext);
    if (loading) {
        return (
            <div className="flex h-[100dvh] items-center justify-center bg-[#111b21]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[#00a884]/20 border-t-[#00a884] animate-spin" />
                    <p className="text-gray-400 text-sm font-medium">Loading...</p>
                </div>
            </div>
        );
    }
    return token ? children : <Navigate to="/login" />;
};

const SplashScreen = () => {
    const [render, setRender] = React.useState(() => !sessionStorage.getItem('app_shell_seen'));
    const [fade, setFade] = React.useState(false);
    
    React.useEffect(() => {
        if (!render) return undefined;
        sessionStorage.setItem('app_shell_seen', '1');
        const timer1 = setTimeout(() => setFade(true), 120);
        const timer2 = setTimeout(() => setRender(false), 280);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, [render]);

    if (!render) return null;

    return (
        <div className={`fixed inset-0 flex flex-col items-center justify-center bg-[#111b21] z-[9999] transition-opacity duration-500 ease-in-out ${fade ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex-1 flex items-center justify-center">
                <img src="/cheetchat-logo.png" alt="CHEETCHAT" className="h-24 w-24 rounded-3xl object-cover shadow-[0_0_40px_rgba(20,125,245,0.45)] animate-pulse" />
            </div>
            <div className="pb-10 flex flex-col items-center">
                <span className="text-gray-400 text-xs font-medium mb-1 tracking-wider uppercase">from</span>
                <span className="text-[#00a884] text-xl font-bold tracking-widest uppercase">CHEETCHAT</span>
                <span className="mt-1 text-[10px] text-gray-500">Super all-in-one platform · Developed in India 🇮🇳</span>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <SplashScreen />
        <BrowserRouter>
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
                        <Route path="/recovery-code" element={
                            <ProtectedRoute><RecoveryCode /></ProtectedRoute>
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
