import { ref } from 'vue'
import { supabase } from '@aiworkspace/shared-header'

// Global authentication state
export const globalAuthState = ref({
  isAuthenticated: null, // null = checking, true = authenticated, false = not authenticated
  user: null,
  session: null
})

// Authentication state manager
class AuthStateManager {
  constructor() {
    this.subscription = null
    this.listeners = new Set()
  }

  // Initialize auth state and set up listeners
  async initialize() {
    try {
      // Check current session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session && session.user) {
        globalAuthState.value = {
          isAuthenticated: true,
          user: session.user,
          session: session
        }
        console.log('✅ Global auth state initialized - user authenticated:', session.user.id)
      } else {
        globalAuthState.value = {
          isAuthenticated: false,
          user: null,
          session: null
        }
        console.log('❌ Global auth state initialized - no active session')
      }

      // Set up auth state change listener
      this.setupAuthListener()
      
    } catch (error) {
      console.error('Error initializing auth state:', error)
      globalAuthState.value = {
        isAuthenticated: false,
        user: null,
        session: null
      }
    }
  }

  // Set up Supabase auth state change listener
  setupAuthListener() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }

    this.subscription = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Global auth state changed:', event, session?.user?.id)
      
      if (event === 'SIGNED_IN' && session) {
        globalAuthState.value = {
          isAuthenticated: true,
          user: session.user,
          session: session
        }
      } else if (event === 'SIGNED_OUT') {
        globalAuthState.value = {
          isAuthenticated: false,
          user: null,
          session: null
        }
      } else if (event === 'TOKEN_REFRESHED' && session) {
        globalAuthState.value = {
          isAuthenticated: true,
          user: session.user,
          session: session
        }
      }

      // Notify all listeners
      this.notifyListeners(event, session)
    })
  }

  // Add a listener for auth state changes
  addListener(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // Notify all listeners
  notifyListeners(event, session) {
    this.listeners.forEach(callback => {
      try {
        callback(event, session, globalAuthState.value)
      } catch (error) {
        console.error('Error in auth state listener:', error)
      }
    })
  }

  // Get current auth state
  getAuthState() {
    return globalAuthState.value
  }

  // Check if user is authenticated
  isAuthenticated() {
    return globalAuthState.value.isAuthenticated === true
  }

  // Get current user
  getCurrentUser() {
    return globalAuthState.value.user
  }

  // Get current session
  getCurrentSession() {
    return globalAuthState.value.session
  }

  // Cleanup
  destroy() {
    if (this.subscription) {
      this.subscription.unsubscribe()
      this.subscription = null
    }
    this.listeners.clear()
  }
}

// Create singleton instance
export const authStateManager = new AuthStateManager()

// Helper functions for easy access
export const useAuthState = () => {
  return {
    authState: globalAuthState,
    isAuthenticated: () => authStateManager.isAuthenticated(),
    getCurrentUser: () => authStateManager.getCurrentUser(),
    getCurrentSession: () => authStateManager.getCurrentSession(),
    addAuthListener: (callback) => authStateManager.addListener(callback)
  }
}
