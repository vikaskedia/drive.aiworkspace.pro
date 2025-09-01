import { createClient } from '@supabase/supabase-js'
import { ensureCrossSubdomainCookies, ACCESS_COOKIE, REFRESH_COOKIE } from './utils/authRedirect'
import { setupAuthStateListener } from './plugins/crossSubdomainAuth'

if (typeof window !== 'undefined') {
  try {
    ensureCrossSubdomainCookies([ACCESS_COOKIE, REFRESH_COOKIE])
  } catch (e) {
    console.log('[auth][cookie][promote] error (pre-init)', e)
  }
}

// Use environment variables for Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-url.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Enable automatic token refresh
    autoRefreshToken: true,
    // Persist session in localStorage
    persistSession: true,
    // Detect session in URL (for OAuth callbacks)
    detectSessionInUrl: true
  }
})

// Set up auth state listener for automatic token refresh
if (typeof window !== 'undefined') {
  setupAuthStateListener()
}

// Log configuration status (remove in production)
console.log('Supabase Configuration:', {
  url: supabaseUrl,
  hasKey: !!supabaseKey,
  autoRefreshToken: true,
  persistSession: true
})
console.log('URL:', supabaseUrl.replace(/https:\/\/(.+)\.supabase\.co/, 'https://*****.supabase.co'))
console.log('Key configured:', !!supabaseKey && !supabaseKey.includes('your-anon-key'))
console.log('Environment mode:', import.meta.env.MODE)

// TODO: Required database tables for workspace functionality:
// 
// CREATE TABLE workspaces (
//   id BIGSERIAL PRIMARY KEY,
//   title TEXT NOT NULL,
//   description TEXT,
//   created_by UUID REFERENCES auth.users(id),
//   created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
// );
// 
// CREATE TABLE workspace_users (
//   id BIGSERIAL PRIMARY KEY,
//   user_id UUID REFERENCES auth.users(id),
//   workspace_id BIGINT REFERENCES workspaces(id),
//   access_type TEXT CHECK (access_type IN ('view', 'edit')),
//   status TEXT DEFAULT 'active',
//   created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
// );
