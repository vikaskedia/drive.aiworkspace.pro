<template>
  <div class="files-view">
    <!-- Not authenticated message (shown immediately before auth check completes) -->
    <div v-if="!isAuthenticated && authCheckDone" class="login-required">
      <div class="login-inner">
        <strong>Authentication required.</strong>
        <p>Click on login/signup button in header to access this file.</p>
        <p>If you already logged in, reload this page.</p>
      </div>
    </div>
    <div v-else-if="!authCheckDone" class="checking-auth">
      <div class="checking-inner">
        <div class="spinner"></div>
      </div>
    </div>

    <!-- Files content only when authenticated -->
    <div v-else>
      <FilesCt />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkspaceStore } from '../store/workspace'
import FilesCt from '../components/single-workspace/FilesCt.vue'
import { supabase } from '@aiworkspace/shared-header'

const route = useRoute()
const workspaceStore = useWorkspaceStore()
const isAuthenticated = ref(false)
const authCheckDone = ref(false)
//const loginUrl = 'https://login.aiworkspace.pro'

// Function to fetch workspace by ID
const fetchWorkspaceById = async (workspaceId, retryCount = 0) => {
  authCheckDone.value = false // reset before each load
  if (!workspaceId) { 
    authCheckDone.value = true
    return
  }
  
  try {
    console.log('Fetching workspace by ID:', workspaceId)
    
    // Check if supabase client is properly initialized
    if (!supabase || !supabase.auth) {
      if (retryCount < 10) { // Max 10 retries
        const delay = Math.min(100 * Math.pow(2, retryCount), 2000); // Exponential backoff, max 2s
        console.warn(`Supabase client not ready, retrying in ${delay}ms... (attempt ${retryCount + 1}/10)`);
        setTimeout(() => fetchWorkspaceById(workspaceId, retryCount + 1), delay);
        return;
      } else {
        console.error('Supabase client failed to initialize after 10 attempts');
        isAuthenticated.value = false;
        authCheckDone.value = true;
        return;
      }
    }
    
    // Validate workspace ID
    if (!workspaceId || isNaN(parseInt(workspaceId))) {
      console.error('Invalid workspace ID:', workspaceId)
      isAuthenticated.value = false;
      authCheckDone.value = true;
      return
    }
    
    const workspaceIdNum = parseInt(workspaceId)
    console.log('Parsed workspace ID:', workspaceIdNum)
    
    // Check authentication first
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      console.log('❌ No authenticated user found')
      isAuthenticated.value = false;
      authCheckDone.value = true;
      return
    }
    isAuthenticated.value = true;
    
    // First try to get from existing workspaces in store
    const existingWorkspace = workspaceStore.workspaces.find(w => w.id === workspaceIdNum)
    if (existingWorkspace && existingWorkspace.git_repo) {
      console.log('Found workspace in store with git_repo:', existingWorkspace)
      workspaceStore.setCurrentWorkspace(existingWorkspace)
      authCheckDone.value = true;
      return
    }
    
    // If not in store or missing git_repo, fetch directly from Supabase
    console.log('Fetching workspace directly from Supabase...')
    
    try {
      
      console.log('Fetching workspace for user:', authUser.id)
      
      // Simple direct query - let RLS handle the access control
      const { data: workspace, error } = await supabase
        .from('workspaces')
        .select('id, title, description, parent_workspace_id, created_by, archived, created_at, git_repo')
        .eq('id', workspaceIdNum)
        .single()
      
      if (error) {
        console.error('Error fetching workspace:', error)
        
        // If RLS is blocking access, try to understand why
        if (error.code === 'PGRST116') {
          console.error('RLS policy blocked access. User may not have access to this workspace.')
        }
        return
      }
      
      console.log('Raw workspace data from Supabase:', workspace)
      
      if (workspace) {
        // Check if git_repo exists
        if (!workspace.git_repo) {
          console.warn('Workspace found but git_repo is missing:', workspace)
          // Try to create a default git_repo based on the workspace title
          const defaultGitRepo = `workspace-${workspace.id}-${workspace.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
          console.log('Using default git_repo:', defaultGitRepo)
          
          // Process the workspace data with default git_repo
          const processedWorkspace = {
            id: workspace.id,
            title: workspace.title,
            description: workspace.description || 'No description',
            parent_workspace_id: workspace.parent_workspace_id,
            created_by: workspace.created_by,
            archived: workspace.archived,
            created_at: workspace.created_at,
            git_repo: defaultGitRepo,
            latest_activity: workspace.created_at,
            hasAccess: true,
            accessType: 'edit'
          }
          
          console.log('Processed workspace with default git_repo:', processedWorkspace)
          
          // Always save git_repo to localStorage for persistence using dedicated key
          try {
            const gitRepoKey = `workspace_git_repo_${processedWorkspace.id}`;
            const gitRepoData = {
              workspaceId: processedWorkspace.id,
              git_repo: processedWorkspace.git_repo,
              savedAt: new Date().toISOString()
            };
            localStorage.setItem(gitRepoKey, JSON.stringify(gitRepoData));
            console.log('💾 Saved default git_repo to dedicated localStorage key in Files.vue:', gitRepoKey, 'value:', processedWorkspace.git_repo);
          } catch (error) {
            console.error('Error saving default git_repo to localStorage in Files.vue:', error);
          }
          
          workspaceStore.setCurrentWorkspace(processedWorkspace)
          return
        }
        
        // Process the workspace data
        const processedWorkspace = {
          id: workspace.id,
          title: workspace.title,
          description: workspace.description || 'No description',
          parent_workspace_id: workspace.parent_workspace_id,
          created_by: workspace.created_by,
          archived: workspace.archived,
          created_at: workspace.created_at,
          git_repo: workspace.git_repo,
          latest_activity: workspace.created_at,
          hasAccess: true,
          accessType: 'edit'
        }
        
        console.log('✅ Successfully fetched and processed workspace:', processedWorkspace)
        console.log('✅ git_repo value:', processedWorkspace.git_repo)
        
        // Always save git_repo to localStorage for persistence using dedicated key
        try {
          const gitRepoKey = `workspace_git_repo_${processedWorkspace.id}`;
          const gitRepoData = {
            workspaceId: processedWorkspace.id,
            git_repo: processedWorkspace.git_repo,
            savedAt: new Date().toISOString()
          };
          localStorage.setItem(gitRepoKey, JSON.stringify(gitRepoData));
          console.log('💾 Saved git_repo to dedicated localStorage key in Files.vue:', gitRepoKey, 'value:', processedWorkspace.git_repo);
        } catch (error) {
          console.error('Error saving git_repo to localStorage in Files.vue:', error);
        }
        
        workspaceStore.setCurrentWorkspace(processedWorkspace)
      }
    } catch (fetchError) {
      console.error('Error in fetchWorkspaceById:', fetchError)
    }
  } catch (error) {
    console.error('Error in fetchWorkspaceById:', error)
  }
  
  authCheckDone.value = true;
}

onMounted(async () => {
  console.log('Files.vue onMounted - route params:', route.params)
  
  // Wait a bit for the shared header to initialize supabase
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Fetch workspace if we have workspace_id in route
  if (route.params.workspace_id) {
    await fetchWorkspaceById(route.params.workspace_id)
  }
  
  // Load workspaces in background if authenticated
  if (isAuthenticated.value) {
    workspaceStore.loadWorkspaces().catch(error => {
      console.log('Background workspace loading failed:', error)
    })
  }
})

// Watch for route changes to handle workspace switching
watch(() => route.params.workspace_id, async (newWorkspaceId, oldWorkspaceId) => {
  if (newWorkspaceId && newWorkspaceId !== oldWorkspaceId) {
    console.log('🚀 Workspace ID changed, fetching new workspace:', newWorkspaceId)
    await fetchWorkspaceById(newWorkspaceId)
  }
})

// Watch for changes in the currentWorkspace store to debug
watch(() => workspaceStore.currentWorkspace, (newWorkspace, oldWorkspace) => {
  console.log('🔄 Store currentWorkspace changed:', { 
    newWorkspace, 
    oldWorkspace,
    newGitRepo: newWorkspace?.git_repo,
    oldGitRepo: oldWorkspace?.git_repo
  })
}, { immediate: true })
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
