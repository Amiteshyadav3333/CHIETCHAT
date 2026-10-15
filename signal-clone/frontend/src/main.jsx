import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from './utils/clientRouter';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
const Login = React.lazy(() => import('./pages/Login'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const Home = React.lazy(() => import('./pages/Home'));
const LegalPage = React.lazy(() => import('./pages/LegalPage'));
const About = React.lazy(() => import('./pages/About'));
const ProfileSetup = React.lazy(() => import('./pages/ProfileSetup'));
const PublicReel = React.lazy(() => import('./pages/PublicReel'));
const RecoveryCode = React.lazy(() => import('./pages/RecoveryCode'));
const FounderPage = React.lazy(() => import('./pages/FounderPage'));
const AdminLogin = React.lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
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
        (message.includes('/api/chats') && (message.includes('404') || message.includes('502')))
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
    <div className="flex flex-col items-center" aria-label="Ducor">
        <img src="/lion-logo.png" alt="" className="h-24 w-24 rounded-[1.75rem] object-cover shadow-[0_0_48px_rgba(255,101,51,0.2)]" />
        <span className="mt-4 bg-gradient-to-r from-sky-400 via-violet-400 to-orange-400 bg-clip-text text-xl font-black tracking-[0.24em] text-transparent">Ducor</span>
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
                    <React.Suspense fallback={<SplashScreen />}>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/signup" element={<Login />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/terms" element={<LegalPage type="terms" />} />
                            <Route path="/privacy" element={<LegalPage type="privacy" />} />
                            <Route path="/about" element={<About />} />
                            <Route path="/founder" element={<FounderPage />} />
                            <Route path="/reels/:reelId" element={<PublicReel />} />
                            <Route path="/chats" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/social" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/reels" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/podlive" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/smart-space" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/settings" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/ai-chat" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/saskat-ai" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                            <Route path="/setup-profile" element={
                                <ProtectedRoute>
                                    <ProfileSetup />
                                </ProtectedRoute>
                            } />
                            <Route path="/recovery-code" element={
                                <ProtectedRoute><RecoveryCode /></ProtectedRoute>
                            } />
                            <Route path="/admin/login" element={<AdminLogin />} />
                            <Route path="/admin/dashboard" element={<AdminDashboard />} />
                            <Route path="/" element={
                                <ProtectedRoute>
                                    <Home />
                                </ProtectedRoute>
                            } />
                        </Routes>
                    </React.Suspense>
                </SocketProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>,
)
