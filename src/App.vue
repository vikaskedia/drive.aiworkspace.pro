<template>
  <div id="app">
    <AIWorkspaceHeader 
      :custom-logo="workspaceLogo" 
      />
    <main class="main-content">
      <!-- Loading state while checking authentication -->
      <div v-if="!authCheckDone" class="loading-container">
        <div class="loading-message">
          <h2>Loading...</h2>
          <p>Checking your session.</p>
        </div>
      </div>
      <!-- Not authenticated message -->
      <div v-else-if="!isAuthenticated" class="not-auth-message">
        <h2>Sign in required</h2>
        <p>Please log in to access the app.</p>
      </div>
      <!-- Main content when authenticated -->
      <router-view v-else/>
    </main>
  </div>
</template>

<script>
import { ref, onMounted, computed, watch } from 'vue'
import { AIWorkspaceHeader } from '@aiworkspace/shared-header'
import '@aiworkspace/shared-header/utils/universalCallback'
import { supabase } from '@aiworkspace/shared-header'
import { useWorkspaceStore } from './store/workspace'
import { useRoute } from 'vue-router'

export default {
  name: 'App',
  components: {
    AIWorkspaceHeader
  },
  setup() {
    const workspaceStore = useWorkspaceStore()
    const route = useRoute()
    const isAuthenticated = ref(false)
    const authCheckDone = ref(false)
    const currentWorkspace = ref(null)

    // Computed property for workspace logo
    const workspaceLogo = computed(() => {
      if (currentWorkspace.value?.logo_url) {
        return currentWorkspace.value.logo_url
      }
      // Fallback to default logo
      return null
    })

    // Watch for route changes to load workspace data
    watch(() => route.params.workspace_id, async (newWorkspaceId) => {
      if (newWorkspaceId && isAuthenticated.value) {
        await loadWorkspaceData(newWorkspaceId)
      }
    }, { immediate: true })

    const loadWorkspaceData = async (workspaceId) => {
      try {
        if (!supabase || !supabase.auth) return

        const { data, error } = await supabase
          .from('workspaces')
          .select('id, title, description, logo_url, parent_workspace_id, git_repo, google_calendar_id, email_storage, ai_subtask_enabled, phone_numbers, fax_numbers')
          .eq('id', workspaceId)
          .single()

        if (error) {
          console.error('Error loading workspace:', error)
          return
        }

        currentWorkspace.value = data
        workspaceStore.setCurrentWorkspace(data)
        console.log('Loaded workspace with logo:', data.logo_url)
      } catch (error) {
        console.error('Error loading workspace data:', error)
      }
    }

    const checkAuth = async () => {
      try {
        // Check if supabase client is properly initialized
        if (!supabase || !supabase.auth) {
          console.warn('Supabase client not ready, retrying...')
          setTimeout(checkAuth, 100)
          return
        }
        
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          isAuthenticated.value = true
          workspaceStore.setUser(user)
          console.log('User authenticated:', user.email)
          
          // Load workspace data if we have a workspace_id in the route
          const workspaceId = route.params.workspace_id
          if (workspaceId) {
            await loadWorkspaceData(workspaceId)
          }
        } else {
          isAuthenticated.value = false
          workspaceStore.setUser(null)
          console.log('No authenticated user')
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        isAuthenticated.value = false
        workspaceStore.setUser(null)
      } finally {
        authCheckDone.value = true
      }
    }

    onMounted(async () => {
      // Wait a bit for the shared header to initialize supabase
      await new Promise(resolve => setTimeout(resolve, 50))
      await checkAuth()
      
      // Make loadWorkspaces available globally for the shared header
      if (window) {
        window.loadWorkspaces = workspaceStore.loadWorkspaces
      }
    })

    return {
      isAuthenticated,
      authCheckDone,
      workspaceLogo
    }
  }
}
</script>

<style>
@import '@aiworkspace/shared-header/style.css';

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.main-content {
  flex: 1;
  min-height: calc(100vh - 60px);
  background: #f8f9fa;
}

/* Global button styles */
button {
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

button:focus {
  outline: 2px solid #007bff;
  outline-offset: 2px;
}

/* Element Plus dropdown customizations */
.el-dropdown-menu {
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e1e5e9;
}

.el-dropdown-menu__item {
  padding: 8px 16px;
  font-size: 0.9rem;
  line-height: 16px;
}

.el-dropdown-menu__item:hover {
  color: #2c3e50;
}

/* Badge customizations */
.el-badge__content {
  border: none;
  font-size: 0.75rem;
  height: 18px;
  line-height: 18px;
  min-width: 18px;
  padding: 0 4px;
}

/* Dialog customizations */
.el-dialog {
  border-radius: 12px;
}

.el-dialog__header {
  padding: 20px 20px 10px 20px;
}

.el-dialog__body {
  padding: 10px 20px 20px 20px;
}

.el-dialog__footer {
  padding: 10px 20px 20px 20px;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* Loading and authentication states */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 60px);
  background: #f8f9fa;
}

.loading-message {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 3rem 2rem;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.loading-message h2 {
  margin: 0 0 0.75rem;
  font-size: 1.6rem;
  color: #23272f;
}

.loading-message p {
  margin: 0;
  color: #555;
  font-size: 1rem;
}

.not-auth-message {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 3rem 2rem;
  max-width: 500px;
  margin: 3rem auto;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.not-auth-message h2 {
  margin: 0 0 0.75rem;
  font-size: 1.6rem;
  color: #23272f;
}

.not-auth-message p {
  margin: 0;
  color: #555;
  font-size: 1rem;
}

/* Logo section customization */
.logo-section img.logo-image {
    height: auto;
}

/* Responsive design */
@media (max-width: 768px) {
  .main-content {
    min-height: calc(100vh - 70px);
  }
  
  .loading-message,
  .not-auth-message {
    margin: 2rem 1rem;
    padding: 2rem 1.5rem;
  }
}
</style>
