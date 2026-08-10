import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
let clientPromise;

const buildClient = (url, anonKey) => createClient(url, anonKey, {
        auth: {
            flowType: 'pkce',
            // Login.jsx exchanges the callback code exactly once. Leaving URL
            // detection enabled races that explicit exchange and can consume
            // the PKCE verifier before the callback handler reads it.
            detectSessionInUrl: false,
            persistSession: true,
            autoRefreshToken: true,
        },
    });

export const getSupabaseClient = async () => {
    if (!clientPromise) {
        clientPromise = (async () => {
            if (supabaseUrl && supabaseAnonKey) return buildClient(supabaseUrl, supabaseAnonKey);
            const response = await fetch('/api/auth/google/config', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Google Sign-In is temporarily unavailable');
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Google Sign-In is not configured');
            }
            return buildClient(config.supabaseUrl, config.supabaseAnonKey);
        })().catch(error => {
            clientPromise = undefined;
            throw error;
        });
    }
    return clientPromise;
};
