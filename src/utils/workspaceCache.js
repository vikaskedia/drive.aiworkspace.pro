/**
 * Workspace Cache System
 * Implements smart caching for workspace data to improve page load performance
 */

const WORKSPACE_CACHE_PREFIX = 'workspace_cache_';
const WORKSPACE_CACHE_VERSION = '1.0';
const WORKSPACE_CACHE_AGE = 5 * 60 * 1000; // 5 minutes (shorter than file cache)

// In-memory cache for ultra-fast access
const workspaceMemoryCache = new Map();
const userMemoryCache = new Map();

/**
 * Generate cache key for user workspaces
 */
function getWorkspaceCacheKey(userId) {
  return `${WORKSPACE_CACHE_PREFIX}user_${userId}`;
}

/**
 * Generate cache key for user data
 */
function getUserCacheKey(userId) {
  return `${WORKSPACE_CACHE_PREFIX}userdata_${userId}`;
}

/**
 * Get cached workspace data for a user
 */
export function getCachedWorkspaces(userId) {
  const startTime = performance.now();
  
  try {
    const cacheKey = getWorkspaceCacheKey(userId);
    
    // Check memory cache first (ultra-fast)
    if (workspaceMemoryCache.has(cacheKey)) {
      const memoryCached = workspaceMemoryCache.get(cacheKey);
      const now = Date.now();
      
      // Check if memory cache is still valid
      if (memoryCached.version === WORKSPACE_CACHE_VERSION && 
          (now - memoryCached.timestamp) < WORKSPACE_CACHE_AGE) {
        const duration = performance.now() - startTime;
        console.log(`⚡ Workspace memory cache hit for user: ${userId} (${duration.toFixed(2)}ms)`);
        return memoryCached.workspaces;
      } else {
        // Remove expired memory cache
        workspaceMemoryCache.delete(cacheKey);
      }
    }
    
    // Fallback to localStorage cache
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      const duration = performance.now() - startTime;
      console.log(`❌ No workspace cache found for user: ${userId} (${duration.toFixed(2)}ms)`);
      return null;
    }
    
    const parsedCache = JSON.parse(cached);
    
    // Check cache version
    if (parsedCache.version !== WORKSPACE_CACHE_VERSION) {
      console.log('Workspace cache version mismatch, clearing cache for user:', userId);
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    // Check cache age
    const now = Date.now();
    if (now - parsedCache.timestamp > WORKSPACE_CACHE_AGE) {
      console.log('Workspace cache expired for user:', userId);
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    // Store in memory cache for next access
    workspaceMemoryCache.set(cacheKey, parsedCache);
    
    const duration = performance.now() - startTime;
    console.log(`💾 Workspace localStorage cache hit for user: ${userId} (${duration.toFixed(2)}ms)`);
    console.log('📝 Cached to memory for faster next access');
    
    return parsedCache.workspaces;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Error reading workspace cache (${duration.toFixed(2)}ms):`, error);
    return null;
  }
}

/**
 * Set cached workspace data for a user
 */
export function setCachedWorkspaces(userId, workspaces) {
  const startTime = performance.now();
  
  try {
    const cacheKey = getWorkspaceCacheKey(userId);
    const cacheData = {
      version: WORKSPACE_CACHE_VERSION,
      timestamp: Date.now(),
      userId,
      workspaces: workspaces || []
    };
    
    // Store in memory cache first for immediate access
    workspaceMemoryCache.set(cacheKey, cacheData);
    
    // Store in localStorage for persistence (asynchronous to avoid blocking)
    setTimeout(() => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (storageError) {
        console.warn('localStorage workspace save failed:', storageError);
      }
    }, 0);
    
    const duration = performance.now() - startTime;
    console.log(`💾 Workspace cache saved for user: ${userId} (${duration.toFixed(2)}ms) - ${workspaces.length} workspaces`);
    
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Error saving workspace cache (${duration.toFixed(2)}ms):`, error);
  }
}

/**
 * Get cached user data
 */
export function getCachedUser(userId) {
  const startTime = performance.now();
  
  try {
    const cacheKey = getUserCacheKey(userId);
    
    // Check memory cache first
    if (userMemoryCache.has(cacheKey)) {
      const memoryCached = userMemoryCache.get(cacheKey);
      const now = Date.now();
      
      if (memoryCached.version === WORKSPACE_CACHE_VERSION && 
          (now - memoryCached.timestamp) < WORKSPACE_CACHE_AGE) {
        const duration = performance.now() - startTime;
        console.log(`⚡ User memory cache hit: ${userId} (${duration.toFixed(2)}ms)`);
        return memoryCached.userData;
      } else {
        userMemoryCache.delete(cacheKey);
      }
    }
    
    // Fallback to localStorage
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      const duration = performance.now() - startTime;
      console.log(`❌ No user cache found: ${userId} (${duration.toFixed(2)}ms)`);
      return null;
    }
    
    const parsedCache = JSON.parse(cached);
    
    // Check cache version and age
    const now = Date.now();
    if (parsedCache.version !== WORKSPACE_CACHE_VERSION || 
        (now - parsedCache.timestamp) > WORKSPACE_CACHE_AGE) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    // Store in memory cache
    userMemoryCache.set(cacheKey, parsedCache);
    
    const duration = performance.now() - startTime;
    console.log(`💾 User localStorage cache hit: ${userId} (${duration.toFixed(2)}ms)`);
    
    return parsedCache.userData;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Error reading user cache (${duration.toFixed(2)}ms):`, error);
    return null;
  }
}

/**
 * Set cached user data
 */
export function setCachedUser(userId, userData) {
  const startTime = performance.now();
  
  try {
    const cacheKey = getUserCacheKey(userId);
    const cacheData = {
      version: WORKSPACE_CACHE_VERSION,
      timestamp: Date.now(),
      userId,
      userData
    };
    
    // Store in memory cache first
    userMemoryCache.set(cacheKey, cacheData);
    
    // Store in localStorage asynchronously
    setTimeout(() => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (storageError) {
        console.warn('localStorage user save failed:', storageError);
      }
    }, 0);
    
    const duration = performance.now() - startTime;
    console.log(`💾 User cache saved: ${userId} (${duration.toFixed(2)}ms)`);
    
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Error saving user cache (${duration.toFixed(2)}ms):`, error);
  }
}

/**
 * Clear all workspace cache for a user
 */
export function clearWorkspaceCache(userId) {
  const startTime = performance.now();
  
  try {
    const workspaceCacheKey = getWorkspaceCacheKey(userId);
    const userCacheKey = getUserCacheKey(userId);
    
    // Clear memory cache
    workspaceMemoryCache.delete(workspaceCacheKey);
    userMemoryCache.delete(userCacheKey);
    
    // Clear localStorage cache
    localStorage.removeItem(workspaceCacheKey);
    localStorage.removeItem(userCacheKey);
    
    const duration = performance.now() - startTime;
    console.log(`🗑️ Cleared workspace cache for user: ${userId} (${duration.toFixed(2)}ms)`);
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Error clearing workspace cache (${duration.toFixed(2)}ms):`, error);
  }
}

/**
 * Clear all workspace caches
 */
export function clearAllWorkspaceCaches() {
  const startTime = performance.now();
  
  try {
    // Clear memory caches
    workspaceMemoryCache.clear();
    userMemoryCache.clear();
    
    // Clear localStorage caches
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(WORKSPACE_CACHE_PREFIX));
    
    cacheKeys.forEach(key => {
      localStorage.removeItem(key);
    });
    
    const duration = performance.now() - startTime;
    console.log(`🗑️ Cleared all workspace caches (${duration.toFixed(2)}ms) - ${cacheKeys.length} entries`);
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Error clearing all workspace caches (${duration.toFixed(2)}ms):`, error);
  }
}

/**
 * Get workspace cache statistics
 */
export function getWorkspaceCacheStats() {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(WORKSPACE_CACHE_PREFIX));
    
    let totalSize = 0;
    let users = new Set();
    
    cacheKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length;
        
        // Extract user ID from key
        const match = key.match(new RegExp(`^${WORKSPACE_CACHE_PREFIX}user_(.+)$`));
        if (match) {
          users.add(match[1]);
        }
      }
    });
    
    // Add memory cache stats
    let memoryCacheSize = 0;
    for (const [key, value] of workspaceMemoryCache.entries()) {
      memoryCacheSize += JSON.stringify(value).length;
    }
    
    for (const [key, value] of userMemoryCache.entries()) {
      memoryCacheSize += JSON.stringify(value).length;
    }
    
    return {
      totalEntries: cacheKeys.length,
      totalSize,
      users: Array.from(users),
      memoryEntries: workspaceMemoryCache.size + userMemoryCache.size,
      memoryCacheSize,
      workspaceMemoryEntries: workspaceMemoryCache.size,
      userMemoryEntries: userMemoryCache.size
    };
  } catch (error) {
    console.error('Error getting workspace cache stats:', error);
    return { 
      totalEntries: 0, 
      totalSize: 0, 
      users: [],
      memoryEntries: 0,
      memoryCacheSize: 0,
      workspaceMemoryEntries: 0,
      userMemoryEntries: 0
    };
  }
}

/**
 * Check if workspace data needs refresh based on activity
 */
export function shouldRefreshWorkspaceCache(userId, lastKnownActivity) {
  try {
    const cacheKey = getWorkspaceCacheKey(userId);
    
    // Check memory cache first
    if (workspaceMemoryCache.has(cacheKey)) {
      const memoryCached = workspaceMemoryCache.get(cacheKey);
      
      // If we have recent activity timestamp and it's newer than cache, refresh
      if (lastKnownActivity && memoryCached.timestamp < new Date(lastKnownActivity).getTime()) {
        console.log('🔄 Workspace cache refresh needed due to recent activity');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking workspace cache refresh need:', error);
    return true; // Refresh on error to be safe
  }
}
