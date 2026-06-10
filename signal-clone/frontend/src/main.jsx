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

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
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
