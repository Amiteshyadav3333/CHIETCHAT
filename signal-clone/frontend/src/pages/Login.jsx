import React, { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { generateKeys } from '../utils/encryption';

const Login = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isLogin) {
                const res = await axios.post('/api/login', { phone, password });
                login(res.data.user, res.data.token);
                navigate('/');
            } else {
                // Register
                const keys = await generateKeys();
                await axios.post('/api/register', {
                    username,
                    phone,
                    password,
                    publicKey: keys.publicKeyString
                });
                alert('Account created! Please login.');
                setIsLogin(true);
            }
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || 'An error occurred');
        }
    };

    return (
        <div className="min-h-screen bg-signal-bg flex items-center justify-center p-4">
            <div className="bg-signal-secondary p-8 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-signal-text mb-2">Signal</h1>
                    <p className="text-gray-400">Secure Messenger</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <input
                                type="text"
                                placeholder="Username"
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
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-signal-input text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-signal-accent"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-signal-accent text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                        {isLogin ? 'Log In' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-signal-accent text-sm hover:underline"
                    >
                        {isLogin ? 'New to Signal? Sign up' : 'Already have an account? Log in'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
