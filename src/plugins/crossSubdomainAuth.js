import { supabase } from '../supabase'
import { ensureCrossSubdomainCookies, getCookie, syncCookiesToLocalStorage, setSessionCookie, ACCESS_COOKIE, REFRESH_COOKIE } from '../utils/authRedirect'

export async function restoreCrossSubdomainSession() {
  try {
    ensureCrossSubdomainCookies([ACCESS_COOKIE, REFRESH_COOKIE])
    const at = getCookie(ACCESS_COOKIE)
    const rt = getCookie(REFRESH_COOKIE)
    if (at && rt) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data, error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
        if (error) console.log('[auth][restore] error', error)
        else console.log('[auth][restore] done', !!data.session)
      }
    } else {
      console.log('[auth][restore] no cookies present')
    }
    syncCookiesToLocalStorage()
  } catch (e) {
    console.log('[auth][restore] exception', e)
  }
}

// Set up automatic token refresh and auth state management
export function setupAuthStateListener() {
  console.log('[auth][listener] Setting up auth state listener...')
  
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth][listener] Auth state changed:', event, !!session)
    
    switch (event) {
      case 'TOKEN_REFRESHED':
        console.log('[auth][listener] Token refreshed successfully')
        if (session) {
          // Update cookies with new tokens
          setSessionCookie(ACCESS_COOKIE, session.access_token, 60 * 60 * 24 * 365) // 1 year
          setSessionCookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 365) // 1 year
          syncCookiesToLocalStorage()
        }
        break
        
      case 'SIGNED_IN':
        console.log('[auth][listener] User signed in')
        if (session) {
          // Set cookies with 1 year expiration
          setSessionCookie(ACCESS_COOKIE, session.access_token, 60 * 60 * 24 * 365)
          setSessionCookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 365)
          syncCookiesToLocalStorage()
        }
        break
        
      case 'SIGNED_OUT':
        console.log('[auth][listener] User signed out')
        // Don't clear cookies here - let the logout handler do it
        break
        
      case 'USER_UPDATED':
        console.log('[auth][listener] User updated')
        break
        
      default:
        console.log('[auth][listener] Unhandled auth event:', event)
    }
  })
}

// Enhanced session restoration with automatic retry
export async function restoreSessionWithRetry() {
  try {
    // First, try to get existing session
    const { data: { session } } = await supabase.auth.getSession()
    if (session && session.user) {
      console.log('[auth][restore] Active session found')
      return { success: true, session }
    }
    
    // If no active session, try to restore from cookies
    const at = getCookie(ACCESS_COOKIE)
    const rt = getCookie(REFRESH_COOKIE)
    
    if (at && rt) {
      console.log('[auth][restore] Attempting to restore session from cookies...')
      const { data, error } = await supabase.auth.setSession({ 
        access_token: at, 
        refresh_token: rt 
      })
      
      if (error) {
        console.log('[auth][restore] Failed to restore session:', error.message)
        return { success: false, error }
      }
      
      if (data.session) {
        console.log('[auth][restore] Session restored successfully')
        // Update cookies with fresh tokens
        setSessionCookie(ACCESS_COOKIE, data.session.access_token, 60 * 60 * 24 * 365)
        setSessionCookie(REFRESH_COOKIE, data.session.refresh_token, 60 * 60 * 24 * 365)
        syncCookiesToLocalStorage()
        return { success: true, session: data.session }
      }
    }
    
    console.log('[auth][restore] No valid session or cookies found')
    return { success: false, error: 'No valid session or cookies' }
    
  } catch (e) {
    console.log('[auth][restore] Exception during session restoration:', e)
    return { success: false, error: e }
  }
}
