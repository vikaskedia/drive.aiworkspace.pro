<template>
  <div class="files-view">
    <!-- Show content immediately if we think user is authenticated -->
    <div v-if="isAuthenticated === true">
      <FilesCt />
    </div>
    <!-- Only show login screen if explicitly not authenticated (not during checking) -->
    <div v-else-if="isAuthenticated === false" class="login-required">
      <div class="login-inner">
        <strong>Authentication required.</strong>
        <p>Please log in to access files.</p>
        <a :href="loginUrl" class="login-link1" rel="noopener">Log in at login.aiworkspace.pro</a>
      </div>
    </div>
    <!-- Show minimal loading indicator only during initial check (isAuthenticated === null) -->
    <div v-else class="checking-auth">
      <div class="checking-inner">
        <div class="spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkspaceStore } from '../store/workspace'
import FilesCt from '../components/single-workspace/FilesCt.vue'
import { supabase } from '../supabase'

const route = useRoute()
const workspaceStore = useWorkspaceStore()
const isAuthenticated = ref(null) // null = checking, true = auth, false = not auth
const loginUrl = 'https://login.aiworkspace.pro'

onMounted(async () => {
  // Optimistic auth check - check multiple Supabase storage keys
  const authKeys = [
    'sb-aiworkspace-auth-token',
    'supabase.auth.token', 
    'sb-aiworkspace-supabase-auth-token'
  ]
  
  let foundCachedAuth = false
  for (const key of authKeys) {
    const cachedAuth = localStorage.getItem(key)
    if (cachedAuth) {
      try {
        const parsed = JSON.parse(cachedAuth)
        if (parsed.access_token || parsed.user) {
          console.log('⚡ Found cached auth, assuming authenticated')
          isAuthenticated.value = true
          foundCachedAuth = true
          break
        }
      } catch (e) {
        // Invalid JSON, continue checking other keys
      }
    }
  }
  
  // If no cached auth found, start with checking state
  if (!foundCachedAuth) {
    isAuthenticated.value = null // Show minimal spinner
  }
  
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && session.user) {
      isAuthenticated.value = true
      // Workspace initialization may be handled inside FilesCt or the store
    } else {
      // If no active session, try to restore from cookies
      console.log('[auth][files] No active session, attempting to restore from cookies...')
      const { restoreSessionWithRetry } = await import('../plugins/crossSubdomainAuth')
      const restoreResult = await restoreSessionWithRetry()
      
      if (restoreResult.success && restoreResult.session) {
        console.log('[auth][files] Session restored successfully')
        isAuthenticated.value = true
      } else {
        console.log('[auth][files] Failed to restore session:', restoreResult.error)
        isAuthenticated.value = false
      }
    }
  } catch (e) {
    console.error('Error checking Supabase session:', e)
    // Try to restore session even if getSession fails
    try {
      const { restoreSessionWithRetry } = await import('../plugins/crossSubdomainAuth')
      const restoreResult = await restoreSessionWithRetry()
      if (restoreResult.success && restoreResult.session) {
        console.log('[auth][files] Session restored after error')
        isAuthenticated.value = true
      } else {
        isAuthenticated.value = false
      }
    } catch (restoreError) {
      console.error('Error restoring session:', restoreError)
      isAuthenticated.value = false
    }
  }
})
</script>

<style scoped>
.files-view {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
.login-required {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #fffaf8;
  color: #6b2b1f;
}
.login-inner { text-align: center; }
.login-link {
  display: inline-block;
  margin-top: 8px;
  padding: 8px 12px;
  background: #007bff;
  color: white;
  border-radius: 6px;
  text-decoration: none;
}
.login-link:hover { opacity: 0.95 }

/* Minimal checking indicator */
.checking-auth {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f5f7fa;
}

.checking-inner {
  text-align: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e1e6ef;
  border-top: 2px solid #409EFF;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
