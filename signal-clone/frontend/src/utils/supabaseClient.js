import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            flowType: 'pkce',
            // Login.jsx exchanges the callback code exactly once. Leaving URL
            // detection enabled races that explicit exchange and can consume
            // the PKCE verifier before the callback handler reads it.
            detectSessionInUrl: false,
            persistSession: true,
            autoRefreshToken: true,
        },
    })
    : null;

export const googleAuthConfigured = Boolean(supabase);
