import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from './utils/clientRouter';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import LegalPage from './pages/LegalPage';
import About from './pages/About';
import ProfileSetup from './pages/ProfileSetup';
import PublicReel from './pages/PublicReel';
import RecoveryCode from './pages/RecoveryCode';
import FounderPage from './pages/FounderPage';
import SaskatAI from './pages/SaskatAI/SaskatAI';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import './index.css';
import axios from 'axios';
import { API_BASE_URL } from './utils/apiBaseUrl';
import { usableBearerToken } from './utils/authSession';
import AppLanguage from './components/AppLanguage';

axios.defaults.withCredentials = true;
axios.interceptors.request.use(config => {
    const legacyToken = usableBearerToken(sessionStorage.getItem('cheetchat_legacy_token'));
    if (legacyToken && !config.headers.get('Authorization')) {
        config.headers.set('Authorization', `Bearer ${legacyToken}`);
    }
    const csrfToken = sessionStorage.getItem('cheetchat_csrf_token');
    if (csrfToken && !['get', 'head', 'options'].includes(String(config.method || 'get').toLowerCase())) {
        config.headers.set('X-CSRF-Token', csrfToken);
    }
    return config;
});

// Suppress expected errors from initial auth check and server cold-start
const originalError = console.error;
const originalWarn = console.warn;
const shouldSuppress = (args) => {
    const message = String(args[0] || '');
    return (
        (message.includes('/api/auth/me') && message.includes('401')) ||
        message.includes('502') ||
        message.includes('status code 502') ||
        (message.includes('/api/chats') && (message.includes('404') || message.includes('502'))) ||
        // PodLive SSO 401 — external service unavailability, not a CHEETCHAT auth error
        (message.includes('podlive') || message.includes('podlive-api'))
    );
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
        navigator.serviceWorker.register('/sw.js')
            .then(registration => registration.update())
            .catch(error => {
                console.warn('Offline app shell registration failed', error);
            });
    });
}

const WhiteCheetChatMark = () => (
    <div className="flex flex-col items-center" aria-label="CHEETCHAT">
        <svg viewBox="0 0 72 72" className="h-24 w-24 text-white" role="img" aria-hidden="true">
            <path fill="currentColor" d="M36 7C19.98 7 7 18.64 7 33c0 7.25 3.31 13.8 8.65 18.52L12.8 64l13.48-6.12A32.2 32.2 0 0 0 36 59c16.02 0 29-11.64 29-26S52.02 7 36 7Z" />
            <path fill="#000" d="M45.8 25.2c-2.35-2.18-5.26-3.27-8.74-3.27-6.92 0-11.67 4.7-11.67 11.3 0 6.63 4.7 11.34 11.67 11.34 3.5 0 6.43-1.1 8.78-3.3l-3.54-3.7a7.1 7.1 0 0 1-4.93 1.86c-3.84 0-6.4-2.55-6.4-6.2 0-3.62 2.56-6.15 6.4-6.15 1.9 0 3.53.62 4.9 1.84l3.53-3.72Z" />
        </svg>
        <span className="mt-4 text-xl font-black tracking-[0.28em] text-white">CHEETCHAT</span>
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { token, loading } = React.useContext(AuthContext);
    if (loading) return <div className="flex h-[100dvh] items-center justify-center bg-black"><WhiteCheetChatMark /></div>;
    return token ? children : <Navigate to="/login" />;
};

const SplashScreen = () => {
    const [render, setRender] = React.useState(true);
    const [fade, setFade] = React.useState(false);
    
    React.useEffect(() => {
        if (!render) return undefined;
        const timer1 = setTimeout(() => setFade(true), 260);
        const timer2 = setTimeout(() => setRender(false), 420);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, [render]);

    if (!render) return null;

    return (
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity duration-150 ease-out ${fade ? 'opacity-0' : 'opacity-100'}`}>
            <WhiteCheetChatMark />
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <SplashScreen />
        <BrowserRouter>
            <AuthProvider>
                <AppLanguage />
                <SocketProvider>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<Login />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/terms" element={<LegalPage type="terms" />} />
                        <Route path="/privacy" element={<LegalPage type="privacy" />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/founder" element={<FounderPage />} />
                        <Route path="/reels/:reelId" element={<PublicReel />} />
                        <Route path="/setup-profile" element={
                            <ProtectedRoute>
                                <ProfileSetup />
                            </ProtectedRoute>
                        } />
                        <Route path="/recovery-code" element={
                            <ProtectedRoute><RecoveryCode /></ProtectedRoute>
                        } />
                        <Route path="/saskat-ai" element={
                            <ProtectedRoute><SaskatAI onClose={() => window.history.back()} /></ProtectedRoute>
                        } />
                        <Route path="/admin/login" element={<AdminLogin />} />
                        <Route path="/admin/dashboard" element={<AdminDashboard />} />
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
