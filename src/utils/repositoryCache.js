/**
 * Repository Cache System for Gitea
 * Implements commit-based caching to improve file loading performance
 */

const CACHE_PREFIX = 'gitea_repo_cache_';
const CACHE_VERSION = '1.0';
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// In-memory cache for ultra-fast access (cleared on page refresh)
const memoryCache = new Map();
const commitCache = new Map();

/**
 * Generate cache key for a repository and path
 */
function getCacheKey(repoName, path = '') {
  const normalizedPath = path.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
  return `${CACHE_PREFIX}${repoName}_${normalizedPath || 'root'}`;
}

/**
 * Generate commit cache key for a repository
 */
function getCommitCacheKey(repoName) {
  return `${CACHE_PREFIX}commit_${repoName}`;
}

/**
 * Get latest commit SHA from Gitea API
 * Tries multiple approaches to handle different repository states
 */
export async function getLatestCommitSha(giteaHost, giteaToken, repoName, branch = 'main') {
  try {
    // Validate repoName before making API calls
    if (!repoName) {
      console.error('❌ getLatestCommitSha: No repoName provided, cannot make API call');
      return null;
    }
    
    console.log('🔗 getLatestCommitSha: Making API call with repoName:', repoName);
    
    // Method 1: Use branches endpoint (FAST - only returns commit ID, no files)
    let url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/branches/${branch}`;
    
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const branchData = await response.json();
      if (branchData && branchData.commit && branchData.commit.id) {
        return branchData.commit.id;
      }
    }
    
    // Method 2: Fallback to commits endpoint (SLOWER - returns files)
    url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/commits?limit=1&sha=${branch}`;
    
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const commitsData = await response.json();
      if (commitsData && commitsData.length > 0) {
        return commitsData[0].sha;
      }
    }
    
    // Method 2: If all commit-related endpoints fail, try getting repository info
    url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}`;
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const repoData = await response.json();
      
      if (repoData.default_branch) {
        // Try with the actual default branch using branches endpoint (FAST)
        url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/branches/${repoData.default_branch}`;
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `token ${giteaToken}`,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const branchData = await response.json();
          if (branchData && branchData.commit && branchData.commit.id) {
            return branchData.commit.id;
          }
        }
        
        // Fallback to commits endpoint if branches endpoint fails
        url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/commits?limit=1&sha=${repoData.default_branch}`;
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `token ${giteaToken}`,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const commitsData = await response.json();
          if (commitsData && commitsData.length > 0) {
            return commitsData[0].sha;
          }
        }
      }
      
      // Method 3: If repository exists but no commits, generate a pseudo-commit ID
      if (repoData.empty) {
        const pseudoCommit = `empty-repo-${Date.now()}`;
        return pseudoCommit;
      }
    }
    
    // Method 4: Try getting contents endpoint to see if repo has any files
    url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/contents/`;
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      // Repository exists and has content, but we can't get commits
      // Generate a time-based pseudo-commit ID
      const pseudoCommit = `contents-based-${Date.now()}`;
      return pseudoCommit;
    }
    
    return null;
    
  } catch (error) {
    return null;
  }
}

/**
 * Attempt to create a repository in Gitea
 */
export async function createRepository(giteaHost, giteaToken, repoName, description = '') {
  try {
    const url = `${giteaHost}/api/v1/orgs/associateattorney/repos`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: description || `Workspace repository for ${repoName}`,
        private: true,
        auto_init: true, // This will create an initial commit
        default_branch: 'main'
      })
    });
    
    if (response.ok) {
      const repoData = await response.json();
      return repoData;
    } else {
      const errorData = await response.json().catch(() => ({}));
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Get cached data for a repository path (optimized with memory cache)
 */
export function getCachedData(repoName, path = '') {
  try {
    const cacheKey = getCacheKey(repoName, path);
    
    // Check memory cache first (ultra-fast)
    if (memoryCache.has(cacheKey)) {
      const memoryCached = memoryCache.get(cacheKey);
      const now = Date.now();
      
      // Check if memory cache is still valid (same session validity)
      if (memoryCached.version === CACHE_VERSION && 
          (now - memoryCached.timestamp) < MAX_CACHE_AGE) {
        return memoryCached;
      } else {
        // Remove expired memory cache
        memoryCache.delete(cacheKey);
      }
    }
    
    // Fallback to localStorage cache
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const parsedCache = JSON.parse(cached);
    
    // Check cache version
    if (parsedCache.version !== CACHE_VERSION) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    // Check cache age
    const now = Date.now();
    if (now - parsedCache.timestamp > MAX_CACHE_AGE) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    // Store in memory cache for next access
    memoryCache.set(cacheKey, parsedCache);
    
    return parsedCache;
  } catch (error) {
    return null;
  }
}

/**
 * Set cached data for a repository path (optimized with memory cache)
 */
export function setCachedData(repoName, path = '', commitSha, files, folders) {
  const startTime = performance.now();
  
  try {
    const cacheKey = getCacheKey(repoName, path);
    const now = Date.now();
    const cacheData = {
      version: CACHE_VERSION,
      timestamp: now,
      lastFetched: now, // Track when data was fetched from server
      commitSha,
      path,
      files: files || [],
      folders: folders || [],
      repoName
    };
    
    // Store in memory cache first for immediate access
    memoryCache.set(cacheKey, cacheData);
    
    // Store in localStorage for persistence (asynchronous to avoid blocking)
    setTimeout(() => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        
        // Also store the latest commit SHA for quick access
        const commitCacheKey = getCommitCacheKey(repoName);
        const commitData = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          commitSha
        };
        
        localStorage.setItem(commitCacheKey, JSON.stringify(commitData));
        commitCache.set(repoName, commitData);
        
      } catch (storageError) {
        // Silent error handling
      }
    }, 0);
    
  } catch (error) {
    // Silent error handling
  }
}

/**
 * Get cached commit SHA for a repository (optimized with memory cache)
 */
export function getCachedCommitSha(repoName) {
  try {
    // Check memory cache first
    if (commitCache.has(repoName)) {
      const memoryCached = commitCache.get(repoName);
      const now = Date.now();
      
      if (memoryCached.version === CACHE_VERSION && 
          (now - memoryCached.timestamp) < MAX_CACHE_AGE) {
        return memoryCached.commitSha;
      } else {
        commitCache.delete(repoName);
      }
    }
    
    // Fallback to localStorage
    const commitCacheKey = getCommitCacheKey(repoName);
    const cached = localStorage.getItem(commitCacheKey);
    
    if (!cached) {
      return null;
    }
    
    const parsedCache = JSON.parse(cached);
    
    // Check cache age
    const now = Date.now();
    if (now - parsedCache.timestamp > MAX_CACHE_AGE) {
      localStorage.removeItem(commitCacheKey);
      return null;
    }
    
    // Store in memory cache for next access
    commitCache.set(repoName, parsedCache);
    
    return parsedCache.commitSha;
  } catch (error) {
    return null;
  }
}

/**
 * Get the last fetch time for a repository (when data was last retrieved from server)
 */
export function getLastFetchTime(repoName, path = '') {
  try {
    const cachedData = getCachedData(repoName, path);
    return cachedData?.lastFetched || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get changes between two commits
 */
export async function getCommitChanges(giteaHost, giteaToken, repoName, fromCommit, toCommit) {
  try {
    // Skip comparison for pseudo-commits (empty repos, contents-based, etc.)
    if (fromCommit.startsWith('empty-repo-') || fromCommit.startsWith('contents-based-') ||
        toCommit.startsWith('empty-repo-') || toCommit.startsWith('contents-based-')) {
      // Return a result indicating we should refresh the cache
      return {
        files: [{ status: 'refresh-needed' }], // Special marker for cache refresh
        commits: []
      };
    }
    
    // Use compare API to get changes between commits
    const url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/compare/${fromCommit}...${toCommit}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.warn(`Commit comparison failed: ${response.status} ${response.statusText}`);
      // If comparison fails, assume changes and refresh cache
      return {
        files: [{ status: 'refresh-needed' }],
        commits: []
      };
    }
    
    const compareData = await response.json();
    
    return {
      files: compareData.files || [],
      commits: compareData.commits || []
    };
  } catch (error) {
    // On error, assume changes and refresh cache
    return {
      files: [{ status: 'refresh-needed' }],
      commits: []
    };
  }
}

/**
 * Apply changeset to cached data
 */
export function applyChangesToCache(repoName, path, changes, cachedData) {
  try {
    const pathPrefix = path ? `${path}/` : '';
    let { files, folders } = cachedData;
    
    for (const change of changes.files) {
      const filePath = change.filename;
      
      // Only process files in the current path
      if (path && !filePath.startsWith(pathPrefix)) {
        continue;
      }
      
      // Get relative path within current folder
      const relativePath = path ? filePath.substring(pathPrefix.length) : filePath;
      
      // Skip if this is a file in a subdirectory (we only want direct children)
      if (relativePath.includes('/')) {
        continue;
      }
      
      switch (change.status) {
        case 'added':
        case 'modified':
          // For directories, we need to check if this file should create a folder entry
          const pathParts = relativePath.split('/');
          if (pathParts.length === 1) {
            // This is a direct file in current path
            updateFileInCache(files, change, filePath);
          }
          break;
          
        case 'removed':
          // Remove file from cache
          removeFileFromCache(files, folders, relativePath);
          break;
      }
    }
    
    return { files, folders };
  } catch (error) {
    return cachedData;
  }
}

/**
 * Update or add file in cache
 */
function updateFileInCache(files, change, fullPath) {
  const fileName = fullPath.split('/').pop();
  
  // Remove existing file with same name
  const existingIndex = files.findIndex(f => f.name === fileName);
  if (existingIndex !== -1) {
    files.splice(existingIndex, 1);
  }
  
  // Add updated file (we'll need to fetch full file data from API)
  // This is a placeholder - in practice, you'd need to fetch the full file metadata
  files.push({
    id: change.sha || Date.now().toString(),
    name: fileName,
    type: 'file',
    size: change.additions + change.deletions, // Rough estimate
    path: fullPath,
    repository: null, // Will be set when fetching from API
    sha: change.sha,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

/**
 * Remove file from cache
 */
function removeFileFromCache(files, folders, relativePath) {
  const fileName = relativePath.split('/').pop();
  
  // Remove from files
  const fileIndex = files.findIndex(f => f.name === fileName);
  if (fileIndex !== -1) {
    files.splice(fileIndex, 1);
  }
  
  // If it was a folder, remove from folders too
  const folderIndex = folders.findIndex(f => f.name === fileName);
  if (folderIndex !== -1) {
    folders.splice(folderIndex, 1);
  }
}

/**
 * Clear all cache for a repository (localStorage + memory)
 */
export function clearRepositoryCache(repoName) {
  try {
    // Clear memory cache
    const memoryKeysToDelete = [];
    for (const [key, value] of memoryCache.entries()) {
      if (value.repoName === repoName) {
        memoryKeysToDelete.push(key);
      }
    }
    memoryKeysToDelete.forEach(key => memoryCache.delete(key));
    
    // Clear commit memory cache
    commitCache.delete(repoName);
    
    // Clear localStorage cache
    const keys = Object.keys(localStorage);
    const repoKeys = keys.filter(key => key.startsWith(`${CACHE_PREFIX}${repoName}_`) || key === getCommitCacheKey(repoName));
    
    repoKeys.forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    // Silent error handling
  }
}

/**
 * Get cache statistics (including memory cache)
 */
export function getCacheStats() {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    
    let totalSize = 0;
    let repositories = new Set();
    
    cacheKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length;
        
        // Extract repo name from key
        const match = key.match(new RegExp(`^${CACHE_PREFIX}([^_]+)_`));
        if (match) {
          repositories.add(match[1]);
        }
      }
    });
    
    // Add memory cache stats
    let memoryCacheSize = 0;
    for (const [key, value] of memoryCache.entries()) {
      memoryCacheSize += JSON.stringify(value).length;
      if (value.repoName) {
        repositories.add(value.repoName);
      }
    }
    
    return {
      totalEntries: cacheKeys.length,
      totalSize,
      repositories: Array.from(repositories),
      memoryEntries: memoryCache.size,
      memoryCacheSize,
      commitCacheEntries: commitCache.size
    };
  } catch (error) {
    return { 
      totalEntries: 0, 
      totalSize: 0, 
      repositories: [],
      memoryEntries: 0,
      memoryCacheSize: 0,
      commitCacheEntries: 0
    };
  }
}

/**
 * Get all cached paths for a repository
 */
export function getAllCachedPaths(repoName) {
  try {
    const paths = new Set();
    
    // Check memory cache first
    for (const [key, value] of memoryCache.entries()) {
      if (value.repoName === repoName) {
        paths.add(value.path);
      }
    }
    
    // Check localStorage cache
    const keys = Object.keys(localStorage);
    const repoKeys = keys.filter(key => key.startsWith(`${CACHE_PREFIX}${repoName}_`));
    
    repoKeys.forEach(key => {
      const match = key.match(new RegExp(`^${CACHE_PREFIX}${repoName}_(.+)$`));
      if (match) {
        const path = match[1];
        if (path === 'root') {
          paths.add('');
        } else {
          paths.add(path);
        }
      }
    });
    
    return Array.from(paths);
  } catch (error) {
    return [];
  }
}

/**
 * Search all cached data for files and folders matching a search term
 * Returns results with full paths and metadata
 */
export function searchCachedData(repoName, searchTerm, options = {}) {
  const {
    includeFiles = true,
    includeFolders = true,
    caseSensitive = false,
    maxResults = 100
  } = options;
  
  try {
    const results = [];
    const normalizedSearchTerm = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    
    // Get all cached paths for this repository
    const cachedPaths = getAllCachedPaths(repoName);
    
    for (const path of cachedPaths) {
      const cachedData = getCachedData(repoName, path);
      if (!cachedData) continue;
      
      // Search through files
      if (includeFiles) {
        for (const file of cachedData.files || []) {
          const fileName = caseSensitive ? file.name : file.name.toLowerCase();
          if (fileName.includes(normalizedSearchTerm)) {
            results.push({
              ...file,
              searchPath: path,
              fullPath: path ? `${path}/${file.name}` : file.name,
              matchType: 'file',
              matchScore: calculateMatchScore(file.name, searchTerm, path)
            });
          }
        }
      }
      
      // Search through folders
      if (includeFolders) {
        for (const folder of cachedData.folders || []) {
          const folderName = caseSensitive ? folder.name : folder.name.toLowerCase();
          if (folderName.includes(normalizedSearchTerm)) {
            results.push({
              ...folder,
              searchPath: path,
              fullPath: path ? `${path}/${folder.name}` : folder.name,
              matchType: 'folder',
              matchScore: calculateMatchScore(folder.name, searchTerm, path)
            });
          }
        }
      }
    }
    
    // Sort by relevance (exact matches first, then by path depth, then alphabetically)
    results.sort((a, b) => {
      // First by match score (higher is better)
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      
      // Then by path depth (shorter paths first)
      const aDepth = a.fullPath.split('/').length;
      const bDepth = b.fullPath.split('/').length;
      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }
      
      // Finally alphabetically
      return a.fullPath.localeCompare(b.fullPath);
    });
    
    // Limit results
    return results.slice(0, maxResults);
    
  } catch (error) {
    console.error('Error searching cached data:', error);
    return [];
  }
}

/**
 * Calculate match score for search relevance
 * Higher score = better match
 */
function calculateMatchScore(itemName, searchTerm, path) {
  let score = 0;
  const normalizedName = itemName.toLowerCase();
  const normalizedSearch = searchTerm.toLowerCase();
  
  // Exact match gets highest score
  if (normalizedName === normalizedSearch) {
    score += 100;
  }
  
  // Starts with search term
  else if (normalizedName.startsWith(normalizedSearch)) {
    score += 50;
  }
  
  // Contains search term
  else if (normalizedName.includes(normalizedSearch)) {
    score += 25;
  }
  
  // Bonus for shorter paths (root level items)
  const pathDepth = path ? path.split('/').length : 0;
  score += Math.max(0, 10 - pathDepth);
  
  // Bonus for exact case match
  if (itemName.includes(searchTerm)) {
    score += 5;
  }
  
  return score;
}

/**
 * Get cached data for all paths in a repository
 */
export function getAllCachedData(repoName) {
  try {
    const allData = {
      files: [],
      folders: [],
      paths: []
    };
    
    const cachedPaths = getAllCachedPaths(repoName);
    
    for (const path of cachedPaths) {
      const cachedData = getCachedData(repoName, path);
      if (cachedData) {
        allData.paths.push(path);
        
        // Add files with full path information
        for (const file of cachedData.files || []) {
          allData.files.push({
            ...file,
            searchPath: path,
            fullPath: path ? `${path}/${file.name}` : file.name
          });
        }
        
        // Add folders with full path information
        for (const folder of cachedData.folders || []) {
          allData.folders.push({
            ...folder,
            searchPath: path,
            fullPath: path ? `${path}/${folder.name}` : folder.name
          });
        }
      }
    }
    
    return allData;
  } catch (error) {
    console.error('Error getting all cached data:', error);
    return { files: [], folders: [], paths: [] };
  }
}

/**
 * Fetch and cache folder data on-demand for search
 * This ensures we can find files in subfolders that haven't been visited yet
 */
export async function fetchAndCacheFolderData(giteaHost, giteaToken, repoName, folderPath) {
  try {
    // Validate repoName before making API call
    if (!repoName) {
      console.error('❌ fetchAndCacheFolderData: No repoName provided, cannot make API call');
      return null;
    }
    
    console.log('🔗 fetchAndCacheFolderData: Making API call with repoName:', repoName, 'folderPath:', folderPath);
    const url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/contents/${folderPath}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      // Don't log 404 errors as they're expected for non-existent folders
      if (response.status !== 404) {
        console.warn(`Failed to fetch folder ${folderPath}: ${response.status} ${response.statusText}`);
      }
      return null;
    }
    
    const data = await response.json();
    const items = Array.isArray(data) ? data : [data];
    
    // Separate files and folders
    const fileItems = items.filter(item => item.type === 'file');
    const folderItems = items.filter(item => item.type === 'dir');
    
    // Map to our format
    const files = fileItems.map(item => ({
      id: item.sha,
      name: item.name,
      type: 'file',
      size: item.size,
      path: item.path,
      download_url: `${giteaHost}/associateattorney/${repoName}/raw/branch/main/${item.path}?token=${giteaToken}`,
      repository: `associateattorney/${repoName}`,
      sha: item.sha,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    const folders = folderItems.map(item => ({
      id: item.sha,
      name: item.name,
      type: 'dir',
      path: item.path,
      repository: `associateattorney/${repoName}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    // Cache the data
    const commitSha = await getLatestCommitSha(giteaHost, giteaToken, repoName);
    if (commitSha) {
      setCachedData(repoName, folderPath, commitSha, files, folders);
    }
    
    return { files, folders };
  } catch (error) {
    // Don't log network errors as they're expected for non-existent folders
    return null;
  }
}

/**
 * Enhanced search that fetches uncached folders on-demand
 */
export async function searchCachedDataEnhanced(giteaHost, giteaToken, repoName, searchTerm, options = {}) {
  const {
    includeFiles = true,
    includeFolders = true,
    caseSensitive = false,
    maxResults = 200
  } = options;
  
  try {
    const results = [];
    const normalizedSearchTerm = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    
    // First, search through existing cached data
    const cachedResults = searchCachedData(repoName, searchTerm, options);
    results.push(...cachedResults);
    
    // If we have a search term and not enough results, try to fetch more folders
    if (searchTerm.trim() && results.length < maxResults) {
      // Get all cached paths to see what we have
      const cachedPaths = getAllCachedPaths(repoName);
      
      // First, try to get root folder data to see what subfolders exist
      let rootData = getCachedData(repoName, '');
      if (!rootData) {
        // If root is not cached, fetch it first
        rootData = await fetchAndCacheFolderData(giteaHost, giteaToken, repoName, '');
      }
      
      // Get list of subfolders from root
      const subfolders = [];
      if (rootData && rootData.folders) {
        subfolders.push(...rootData.folders.map(f => f.name));
      }
      
      // Only try to fetch folders that are likely to exist based on the search term
      const searchTermLower = searchTerm.toLowerCase();
      const relevantFolders = [];
      
      // Add actual subfolders from root
      relevantFolders.push(...subfolders);
      
      // Only add common folders if the search term suggests they might be relevant
      if (searchTermLower.includes('external') || searchTermLower.includes('comment')) {
        relevantFolders.push('external_comments');
      }
      if (searchTermLower.includes('doc') || searchTermLower.includes('pdf')) {
        relevantFolders.push('documents');
      }
      if (searchTermLower.includes('file')) {
        relevantFolders.push('files');
      }
      if (searchTermLower.includes('image') || searchTermLower.includes('pic') || searchTermLower.includes('screenshot')) {
        relevantFolders.push('images', 'assets');
      }
      if (searchTermLower.includes('data')) {
        relevantFolders.push('data');
      }
      if (searchTermLower.includes('content')) {
        relevantFolders.push('content');
      }
      if (searchTermLower.includes('src') || searchTermLower.includes('code')) {
        relevantFolders.push('src');
      }
      if (searchTermLower.includes('public')) {
        relevantFolders.push('public');
      }
      if (searchTermLower.includes('private')) {
        relevantFolders.push('private');
      }
      if (searchTermLower.includes('shared')) {
        relevantFolders.push('shared');
      }
      
      // Remove duplicates and already cached folders
      const foldersToCheck = [...new Set(relevantFolders)].filter(folder => !cachedPaths.includes(folder));
      
      for (const folderName of foldersToCheck) {
        // Try to fetch this folder
        const folderData = await fetchAndCacheFolderData(giteaHost, giteaToken, repoName, folderName);
        if (folderData) {
          // Search through the newly fetched data
          if (includeFiles) {
            for (const file of folderData.files || []) {
              const fileName = caseSensitive ? file.name : file.name.toLowerCase();
              if (fileName.includes(normalizedSearchTerm)) {
                results.push({
                  ...file,
                  searchPath: folderName,
                  fullPath: `${folderName}/${file.name}`,
                  matchType: 'file',
                  matchScore: calculateMatchScore(file.name, searchTerm, folderName)
                });
              }
            }
          }
          
          if (includeFolders) {
            for (const folder of folderData.folders || []) {
              const folderName = caseSensitive ? folder.name : folder.name.toLowerCase();
              if (folderName.includes(normalizedSearchTerm)) {
                results.push({
                  ...folder,
                  searchPath: folderName,
                  fullPath: `${folderName}/${folder.name}`,
                  matchType: 'folder',
                  matchScore: calculateMatchScore(folder.name, searchTerm, folderName)
                });
              }
            }
          }
          
          // Stop if we have enough results
          if (results.length >= maxResults) {
            break;
          }
        }
      }
      
      // If still no results, try to get all repository contents
      if (results.length === 0) {
        const allContents = await getAllRepositoryContents(giteaHost, giteaToken, repoName);
        if (allContents) {
          for (const item of allContents) {
            if (includeFiles && item.type === 'file') {
              const fileName = caseSensitive ? item.name : item.name.toLowerCase();
              if (fileName.includes(normalizedSearchTerm)) {
                const pathParts = item.path.split('/');
                const folderPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
                
                results.push({
                  ...item,
                  searchPath: folderPath,
                  fullPath: item.path,
                  matchType: 'file',
                  matchScore: calculateMatchScore(item.name, searchTerm, folderPath)
                });
              }
            }
            
            if (includeFolders && item.type === 'dir') {
              const folderName = caseSensitive ? item.name : item.name.toLowerCase();
              if (folderName.includes(normalizedSearchTerm)) {
                const pathParts = item.path.split('/');
                const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
                
                results.push({
                  ...item,
                  searchPath: parentPath,
                  fullPath: item.path,
                  matchType: 'folder',
                  matchScore: calculateMatchScore(item.name, searchTerm, parentPath)
                });
              }
            }
            
            if (results.length >= maxResults) {
              break;
            }
          }
        }
      }
    }
    
    // Sort by relevance
    results.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      
      const aDepth = a.fullPath.split('/').length;
      const bDepth = b.fullPath.split('/').length;
      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }
      
      return a.fullPath.localeCompare(b.fullPath);
    });
    
    return results.slice(0, maxResults);
    
  } catch (error) {
    console.error('Error in enhanced search:', error);
    // Fallback to regular search
    return searchCachedData(repoName, searchTerm, options);
  }
}

/**
 * Get all repository contents recursively
 * This is a fallback method to ensure we can find files in any subfolder
 */
export async function getAllRepositoryContents(giteaHost, giteaToken, repoName) {
  try {
    // Use the Git API to get all files in the repository
    const url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/git/trees/main?recursive=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.tree || [];
    
  } catch (error) {
    console.error('Error getting all repository contents:', error);
    return null;
  }
}
