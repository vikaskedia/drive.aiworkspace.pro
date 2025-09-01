import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../supabase'
import { 
  getCachedWorkspaces, 
  setCachedWorkspaces, 
  getCachedUser, 
  setCachedUser,
  clearWorkspaceCache,
  shouldRefreshWorkspaceCache 
} from '../utils/workspaceCache'

export const useWorkspaceStore = defineStore('workspace', () => {
  const currentWorkspace = ref(null)
  const workspaces = ref([])
  const user = ref(null)

  const setCurrentWorkspace = (workspace) => {
    currentWorkspace.value = workspace
    localStorage.setItem('current_workspace', JSON.stringify(workspace))
  }

  const setWorkspaces = (newWorkspaces) => {
    workspaces.value = newWorkspaces
    localStorage.setItem('available_workspaces', JSON.stringify(newWorkspaces))
  }

  const setUser = (userData) => {
    user.value = userData
    localStorage.setItem('user_info', JSON.stringify(userData))
  }

  const loadPersistedData = () => {
    const storedWorkspace = localStorage.getItem('current_workspace')
    if (storedWorkspace) {
      try { currentWorkspace.value = JSON.parse(storedWorkspace) } catch (error) { console.error('Error loading persisted workspace:', error) }
    }
    const storedWorkspaces = localStorage.getItem('available_workspaces')
    if (storedWorkspaces) {
      try { workspaces.value = JSON.parse(storedWorkspaces) } catch (error) { console.error('Error loading persisted workspaces:', error) }
    }
    const storedUser = localStorage.getItem('user_info')
    if (storedUser) {
      try { user.value = JSON.parse(storedUser) } catch (error) { console.error('Error loading persisted user:', error) }
    }
  }

  const clearData = () => {
    currentWorkspace.value = null
    workspaces.value = []
    user.value = null
    localStorage.removeItem('current_workspace')
    localStorage.removeItem('available_workspaces')
    localStorage.removeItem('user_info')
    
    // Clear workspace cache as well
    if (user.value?.id) {
      clearWorkspaceCache(user.value.id)
    }
  }

  // Load workspaces from cache only (no API calls)
  const loadWorkspacesFromCache = async () => {
    const startTime = performance.now()
    
    try {
      // Try to get user from cache first  
      const storedUser = localStorage.getItem('user_info')
      let userId = null
      
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser)
          userId = userData.id
          setUser(userData)
        } catch (error) {
          console.error('Error loading cached user:', error)
        }
      }
      
      if (!userId) {
        console.log('No cached user found, cannot load cached workspaces')
        return []
      }
      
      // Load cached workspaces
      const cachedWorkspaces = getCachedWorkspaces(userId)
      if (cachedWorkspaces && cachedWorkspaces.length > 0) {
        const duration = performance.now() - startTime
        console.log(`⚡ Instant workspace load from cache in ${Math.round(duration)}ms: ${cachedWorkspaces.length} workspaces`)
        
        setWorkspaces(cachedWorkspaces)
        return cachedWorkspaces
      } else {
        console.log('No cached workspaces found')
        return []
      }
    } catch (e) {
      const duration = performance.now() - startTime
      console.error(`loadWorkspacesFromCache error (${duration.toFixed(2)}ms):`, e)
      return []
    }
  }

  // Force refresh workspaces (bypasses cache)
  const refreshWorkspaces = async (includeArchived = false) => {
    console.log('🔄 Force refreshing workspaces...')
    return await loadWorkspaces(includeArchived, true) // forceRefresh = true
  }

  // Optimistic workspace loading - instant cache + background refresh
  const loadWorkspaces = async (includeArchived = false, forceRefresh = false, backgroundRefresh = false) => {
    const startTime = performance.now()
    
    try {
      // Step 1: Get user (with caching)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return []
      
      // Check cached user data first
      const cachedUserData = getCachedUser(authUser.id)
      if (cachedUserData && !forceRefresh) {
        console.log('⚡ Using cached user data')
        setUser(cachedUserData)
      } else {
        console.log('💾 Caching fresh user data')
        setCachedUser(authUser.id, authUser)
        setUser(authUser)
      }
      
      // Step 2: OPTIMISTIC LOADING - Load cache immediately if available
      if (!forceRefresh) {
        const cachedWorkspaces = getCachedWorkspaces(authUser.id)
        if (cachedWorkspaces && cachedWorkspaces.length > 0) {
          const duration = performance.now() - startTime
          console.log(`🚀 Ultra-fast workspace load from cache in ${Math.round(duration)}ms: ${cachedWorkspaces.length} workspaces`)
          
          // Set workspaces immediately for instant UI
          setWorkspaces(cachedWorkspaces)
          
          // If this is not a background refresh call, schedule background update
          if (!backgroundRefresh) {
            console.log('🔄 Scheduling background workspace refresh...')
            setTimeout(async () => {
              try {
                console.log('🔄 Starting background workspace refresh')
                await loadWorkspacesDirect(authUser, includeArchived, true, true) // silent = true
              } catch (error) {
                console.log('Background workspace refresh failed:', error)
              }
            }, 500) // Small delay to let UI render
          }
          
          return cachedWorkspaces
        }
      }
      
      // Step 3: Cache miss or force refresh - load from API
      console.log('💾 Loading workspaces from API and caching...')
      return await loadWorkspacesDirect(authUser, includeArchived, true, false)
      
    } catch (e) {
      const duration = performance.now() - startTime
      console.error(`loadWorkspaces error (${duration.toFixed(2)}ms):`, e)
      return []
    }
  }
  
  // Direct workspace loading (separated for caching logic)
  const loadWorkspacesDirect = async (authUser, includeArchived = false, shouldCache = false, silent = false) => {
    try {
      let query = supabase
        .from('workspaces')
        .select(`
          id, title, description, parent_workspace_id, created_by, archived, created_at, git_repo,
          workspace_access!inner ( access_type, shared_with_user_id ),
          workspace_activities!left ( updated_at )
        `)
        .eq('workspace_access.shared_with_user_id', authUser.id)

      if (!includeArchived) query = query.eq('archived', false)

      const { data: userWorkspaces, error: userError } = await query
      if (userError) throw userError

      // Build access map
      const userAccess = new Map()
      ;(userWorkspaces || []).forEach(w => {
        ;(w.workspace_access || []).forEach(acc => {
          if (acc.shared_with_user_id === authUser.id) {
            userAccess.set(w.id, acc)
          }
        })
      })

      // Collect parent IDs missing
      const parentIds = [...new Set(
        (userWorkspaces || [])
          .filter(w => w.parent_workspace_id)
          .map(w => w.parent_workspace_id)
          .filter(pid => !userAccess.has(pid))
      )]

      let parentWorkspaces = []
      if (parentIds.length) {
        let parentQuery = supabase
          .from('workspaces')
          .select('id, title, description, parent_workspace_id, created_by, archived, created_at, git_repo')
          .in('id', parentIds)
        if (!includeArchived) parentQuery = parentQuery.eq('archived', false)
        const { data: parents, error: parentError } = await parentQuery
        if (parentError) throw parentError
        parentWorkspaces = parents || []
      }

      const combined = [...(userWorkspaces || []), ...parentWorkspaces]

      const processed = combined.map(w => ({
        id: w.id,
        title: w.title,
        description: w.description || 'No description',
        parent_workspace_id: w.parent_workspace_id,
        created_by: w.created_by,
        archived: w.archived,
        created_at: w.created_at,
        git_repo: w.git_repo,
        latest_activity: w.workspace_activities?.[0]?.updated_at || w.created_at,
        hasAccess: userAccess.has(w.id),
        accessType: userAccess.get(w.id)?.access_type || null
      }))

      processed.sort((a, b) => new Date(b.latest_activity) - new Date(a.latest_activity))

      // Cache the results if requested
      if (shouldCache) {
        setCachedWorkspaces(authUser.id, processed)
        if (!silent) {
          console.log(`💾 Cached ${processed.length} workspaces for user: ${authUser.id}`)
        } else {
          console.log(`🔄 Background refresh: Updated cache with ${processed.length} workspaces`)
        }
      }

      // Always update store data, but handle UI updates differently for silent refresh
      if (!silent) {
        setWorkspaces(processed)
      } else {
        // For silent refresh, always update cache and UI with fresh data
        // Check for ANY changes (not just structure) like descriptions, activity, etc.
        const currentData = JSON.stringify(workspaces.value.map(w => ({ 
          id: w.id, 
          title: w.title, 
          description: w.description, 
          latest_activity: w.latest_activity 
        })).sort((a, b) => String(a.id).localeCompare(String(b.id))))
        
        const newData = JSON.stringify(processed.map(w => ({ 
          id: w.id, 
          title: w.title, 
          description: w.description, 
          latest_activity: w.latest_activity 
        })).sort((a, b) => String(a.id).localeCompare(String(b.id))))
        
        if (currentData !== newData) {
          console.log('🔄 Background refresh: Detected workspace data changes, updating UI')
          setWorkspaces(processed)
        } else {
          console.log('🔄 Background refresh: No data changes detected, but cache updated with fresh server data')
          // Still update the store to ensure we have the latest server data
          setWorkspaces(processed)
        }
      }

      return processed
    } catch (error) {
      console.error('Error in loadWorkspacesDirect:', error)
      throw error
    }
  }

  return {
    currentWorkspace,
    workspaces,
    user,
    setCurrentWorkspace,
    setWorkspaces,
    setUser,
    loadPersistedData,
    clearData,
    loadWorkspaces,
    loadWorkspacesFromCache,
    refreshWorkspaces
  }
})
