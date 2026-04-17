import React, { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { generateKeys } from '../utils/encryption';

const Login = () => {
    const [mode, setMode] = useState('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [phone, setPhone] = useState('');
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const isLogin = mode === 'login';
    const isRegister = mode === 'register';
    const isReset = mode === 'reset';

    const handleSubmit = async (e) => {
        e.preventDefault();

        const cleanPhone = phone.trim();
        const cleanUsername = username.trim();

        try {
            if (isLogin) {
                const res = await axios.post('/api/login', { phone: cleanPhone, password });
                login(res.data.user, res.data.token);
                navigate('/');
            } else if (isRegister) {
                // Register
                const keys = await generateKeys();
                await axios.post('/api/register', {
                    username: cleanUsername,
                    phone: cleanPhone,
                    password,
                    publicKey: keys.publicKeyString
                });

                // Save keys locally so we can decrypt later
                localStorage.setItem(`privKey_${cleanUsername}`, keys.privateKeyString);
                localStorage.setItem(`pubKey_${cleanUsername}`, keys.publicKeyString);

                alert('Account created! Please login.');
                setMode('login');
            } else {
                if (password !== confirmPassword) {
                    alert('New password and confirm password do not match');
                    return;
                }

                const res = await axios.post('/api/forgot-password', {
                    phone: cleanPhone,
                    username: cleanUsername,
                    newPassword: password
                });

                alert(res.data.message || 'Password reset successfully. Please login.');
                setMode('login');
                setPassword('');
                setConfirmPassword('');
            }
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || 'An error occurred');
        }
    };

    return (
        <div className="min-h-[100dvh] bg-signal-bg flex items-center justify-center p-4">
            <div className="bg-signal-secondary p-8 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-signal-text mb-2">Signal</h1>
                    <p className="text-gray-400">Secure Messenger</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {(isRegister || isReset) && (
                        <div>
                            <input
                                type="text"
                                placeholder={isReset ? "Registered Username" : "Username"}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-signal-input text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-signal-accent"
                                required
                            />
                        </div>
                    )}
                    <div>
                        <input
                            type="text"
                            placeholder="Phone Number"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full bg-signal-input text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-signal-accent"
                            required
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder={isReset ? "New Password" : "Password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-signal-input text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-signal-accent"
                            required
                            minLength={isReset ? 6 : undefined}
                        />
                    </div>
                    {isReset && (
                        <div>
                            <input
                                type="password"
                                placeholder="Confirm New Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-signal-input text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-signal-accent"
                                required
                                minLength={6}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-signal-accent text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                        {isLogin ? 'Log In' : isRegister ? 'Create Account' : 'Reset Password'}
                    </button>
                </form>

                <div className="mt-6 flex flex-col items-center gap-3 text-center">
                    <button
                        onClick={() => {
                            setMode(isLogin ? 'register' : 'login');
                            setPassword('');
                            setConfirmPassword('');
                        }}
                        className="text-signal-accent text-sm hover:underline"
                    >
                        {isLogin ? 'New to Signal? Sign up' : 'Already have an account? Log in'}
                    </button>
                    {isLogin && (
                        <button
                            onClick={() => {
                                setMode('reset');
                                setPassword('');
                                setConfirmPassword('');
                            }}
                            className="text-gray-400 text-sm hover:text-signal-accent hover:underline"
                        >
                            Forgot password?
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
