<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { Plus, UploadFilled, Folder, FolderAdd, ArrowLeft, Download, MoreFilled, ArrowDown, Document, Picture, Tickets, ReadingLamp, Files, Close, Star, StarFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useWorkspaceStore } from '../../store/workspace';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import FilePreviewPane from './FilePreviewPane.vue';
import CacheStatus from '../common/CacheStatus.vue';
import { updateWorkspaceActivity } from '../../utils/workspaceActivity';
import { getCleanText } from '../../utils/page-title';
import JSZip from 'jszip';
import { 
  getLatestCommitSha, 
  getCachedData, 
  setCachedData, 
  getCachedCommitSha, 
  getCommitChanges, 
  applyChangesToCache,
  clearRepositoryCache,
  createRepository,
  searchCachedData,
  searchCachedDataEnhanced,
  getAllCachedData,
  getAllCachedPaths,
  fetchAndCacheFolderData,
  getLastFetchTime
} from '../../utils/repositoryCache';

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const { currentWorkspace } = storeToRefs(workspaceStore);

// Component state
const files = ref([]);
const loading = ref(false);
const uploadDialogVisible = ref(false);
const fileList = ref([]);
const selectedFile = ref(null);
const currentFolder = ref(null);
const folders = ref([]);
const newFolderDialogVisible = ref(false);
const newFolderName = ref('');
const newDocDialogVisible = ref(false);
const newDocName = ref('');
const folderBreadcrumbs = ref([]);
const filters = ref({
  search: '',
  type: null,
  showFilters: false
});
const downloadingFiles = ref(new Set());
const isNavigating = ref(false);
const isInitializing = ref(false);
const cacheStatusRef = ref(null);
const lastFetchTime = ref(null);



// Enhanced filters search functionality
const enhancedSearchMode = ref(false);
const searchResults = ref([]);
const searchLoading = ref(false);

// Favorites functionality
const favorites = ref([]);
const favoritesDialogVisible = ref(false);

// Split view functionality - matches old app behavior
const splitPanes = ref([]);
const maxSplits = 10;

// Column visibility settings
const columnVisibility = ref({
  type: JSON.parse(localStorage.getItem('filesTable_showTypeColumn') || 'false'),
  size: JSON.parse(localStorage.getItem('filesTable_showSizeColumn') || 'false')
});

// Request tracking
const activeRequests = ref({
  loadContents: null
});

const lastRequestedPaths = ref({
  loadContents: ''
});

// Expose these refs to make them accessible from parent
defineExpose({
  uploadDialogVisible,
  newFolderDialogVisible,
  newDocDialogVisible,
  filters
});

// File types configuration
const FILE_TYPES = {
  FOLDER: 'dir',
  PDF: 'application/pdf',
  WORD: 'application/msword',
  TEXT: 'text/plain',
  IMAGE: ['image/jpeg', 'image/png', 'image/gif'],
  MD: 'text/markdown',
  UNIVER_DOC: 'application/vnd.univer-doc'
};

const activeFiltersCount = computed(() => {
  let count = 0;
  if (filters.value.search) count++;
  if (filters.value.type) count++;
  return count;
});

// Formatted last fetch time
const formattedLastFetchTime = computed(() => {
  if (!lastFetchTime.value) return null;
  const date = new Date(lastFetchTime.value);
  return date.toLocaleString();
});

// Natural sort function
function createNaturalSortKey(name) {
  return name.toLowerCase().replace(/(\d+)/g, (match) => {
    return match.padStart(10, '0');
  });
}

// Filtered items
const filteredItems = computed(() => {
  // If we have a search term, use enhanced search across all folders
  if (filters.value.search && filters.value.search.trim()) {
    return searchResults.value;
  }
  
  // Otherwise, use normal filtering for current folder
  let result = [...folders.value, ...files.value];
  
  if (filters.value.type) {
    result = result.filter(item => {
      if (filters.value.type === 'folder') return item.type === 'dir';
      if (filters.value.type === 'image') {
        const ext = item.name.toLowerCase().split('.').pop();
        return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
      }
      if (filters.value.type === 'document') {
        const ext = item.name.toLowerCase().split('.').pop();
        return ['pdf', 'doc', 'docx', 'txt', 'md', 'univer'].includes(ext);
      }
      return true;
    });
  }
  
  // Sort: files and folders mixed, natural alphanumeric order (like old app)
  result.sort((a, b) => {
    return createNaturalSortKey(a.name).localeCompare(createNaturalSortKey(b.name));
  });
  
  return result.map(item => ({
    ...item,
    sizeForSort: item.type === 'dir' ? -1 : (item.size || 0)
  }));
});

// Local search info
const localSearchInfo = computed(() => {
  if (!filters.value.search) return null;
  
  const totalItems = folders.value.length + files.value.length;
  const filteredCount = searchResults.value.length;
  
  return {
    searchTerm: filters.value.search,
    totalItems,
    filteredCount,
    isFiltered: true, // Always true when using enhanced search
    isEnhancedSearch: true
  };
});

// Update page title to format: Root < folder < subfolder ... < {workspace_name} < Ai Workspace
const updatePageTitle = () => {
  const workspaceName = currentWorkspace.value?.title || 'Workspace';

  // Build breadcrumbs starting with Root
  const crumbs = ['Root'];
  if (Array.isArray(folderBreadcrumbs.value) && folderBreadcrumbs.value.length > 0) {
    const names = folderBreadcrumbs.value.map(b => getCleanText(b.name)).filter(Boolean);
    crumbs.push(...names);
  }

  // crumbs should be in descending order
  crumbs.reverse();

  // Compose final title and set document.title directly
  const title = `${crumbs.join(' < ')} < ${getCleanText(workspaceName)} < Ai Workspace`;
  document.title = title;
};

// Update last fetch time
const updateLastFetchTime = () => {
  if (currentWorkspace.value?.git_repo) {
    const path = currentFolder.value?.path || '';
    const fetchTime = getLastFetchTime(currentWorkspace.value.git_repo, path);
    lastFetchTime.value = fetchTime;
  }
};

// Watch workspace changes
watch(currentWorkspace, async (newWorkspace, oldWorkspace) => {
  // Skip if already initializing
  if (isInitializing.value) {
    return;
  }
  
  // Skip if workspace didn't actually change
  if (newWorkspace?.id === oldWorkspace?.id) {
    return;
  }
  
      if (newWorkspace) {
      updatePageTitle();
      updateLastFetchTime();
      
      // Load favorites for this workspace
      loadFavorites();
      
      // Check if we have cached content for this workspace before resetting
      const repoName = newWorkspace.git_repo;
      const cachedRootData = getCachedData(repoName, '');
      
      if (cachedRootData) {
        // Load cached content immediately while initializing
        files.value = cachedRootData.files || [];
        folders.value = cachedRootData.folders || [];
      } else {
        // Reset state only if no cache
        files.value = [];
        folders.value = [];
      }
    
    // Reset navigation state
    currentFolder.value = null;
    folderBreadcrumbs.value = [];
    selectedFile.value = null;
    
    // Initialize immediately without delay
    isInitializing.value = true;
    try {
      await initializeFromUrl();
      
      // Pre-load subfolders for better search performance
      setTimeout(() => {
        preloadSubfolders();
      }, 1000); // Small delay to let initial load complete
      
    } finally {
      isInitializing.value = false;
    }
  }
}, { immediate: true });

// Watch route changes for URL navigation and browser back/forward
watch(() => route.query, async (newQuery, oldQuery) => {
  console.log('Route watcher triggered:', { newQuery, oldQuery, isInitializing: isInitializing.value, isNavigating: isInitializing.value });
  
  // Prevent multiple initializations
  if (isInitializing.value || isNavigating.value) {
    console.log('Route watcher blocked - isInitializing or isNavigating');
    return;
  }
  
  const queryChanged = JSON.stringify(newQuery) !== JSON.stringify(oldQuery);
  if (queryChanged && currentWorkspace.value) {
    console.log('URL changed, updating navigation state:', {
      oldQuery,
      newQuery
    });
    
    // Check if this is a browser back/forward navigation
    const newFolderParam = newQuery.folder;
    const oldFolderParam = oldQuery.folder;
    const newFileParam = newQuery.file;
    
    // Handle browser navigation for folder changes
    if (newFolderParam !== oldFolderParam) {
      console.log('Browser navigation detected - folder change:', {
        from: oldFolderParam,
        to: newFolderParam
      });
      
      // Additional check: if we're navigating and the new folder matches our current navigation, skip
      if (isNavigating.value && currentFolder.value && newFolderParam === encodeURIComponent(currentFolder.value.path)) {
        console.log('Skipping route watcher - we are already navigating to this folder');
        return;
      }
      
      // Set flag to prevent our own URL updates from triggering this watcher
      isNavigating.value = true;
      
      try {
        // Handle the folder navigation based on URL
        if (newFolderParam) {
          const folderPath = decodeURIComponent(newFolderParam);
          console.log('Browser navigating to folder:', folderPath);
          await navigateToFolderByPath(folderPath, false); // Don't update URL during browser navigation
        } else {
          console.log('Browser navigating to root');
          currentFolder.value = null;
          folderBreadcrumbs.value = [];
        }
        
        // Handle file selection
        if (newFileParam) {
          const fileName = decodeURIComponent(newFileParam);
          const file = files.value.find(f => f.name === fileName);
          if (file) {
            selectedFile.value = file;
          } else {
            selectedFile.value = null;
          }
        } else {
          selectedFile.value = null;
        }
        
        // Load contents for the new folder
        await loadContents();
        
      } catch (error) {
        // Silent error handling
      } finally {
        // Reset navigation flag immediately
        isNavigating.value = false;
      }
      
      return; // Exit early to avoid the debounced initialization below
    }
    
    // Handle file selection changes without folder changes
    if (newFileParam !== oldQuery.file && newFolderParam === oldFolderParam) {
      console.log('Browser navigation detected - file selection change');
      console.log('isNavigating:', isNavigating.value, 'newFileParam:', newFileParam, 'oldQuery.file:', oldQuery.file);
      
      // Only handle file deselection if we're not currently navigating
      if (!newFileParam && !isNavigating.value) {
        console.log('Clearing file selection due to URL change');
        console.log('Current selectedFile before clearing:', selectedFile.value?.name);
        selectedFile.value = null;
      } else if (newFileParam) {
        const fileName = decodeURIComponent(newFileParam);
        // Try to find file in current files array, but don't fail if not found yet
        const file = files.value.find(f => f.name === fileName);
        if (file) {
          selectedFile.value = file;
          console.log('Browser restored file selection:', fileName);
        } else {
          console.log('File not found in current files array, will be restored after contents load:', fileName);
          // Set a flag to restore file selection after contents load
          selectedFile.value = { name: fileName, pending: true };
        }
      }
      return; // Exit early
    }
    
    // Initialize immediately if not already initializing
    if (!isInitializing.value) {
      isInitializing.value = true;
      try {
        await initializeFromUrl();
      } finally {
        isInitializing.value = false;
      }
    }
  }
}, { deep: true });

// Ensure page title updates when breadcrumbs or selected file change
watch(folderBreadcrumbs, () => {
  updatePageTitle();
}, { deep: true });

watch(selectedFile, (newFile, oldFile) => {
  console.log('selectedFile watcher triggered:', { 
    newFile: newFile?.name, 
    oldFile: oldFile?.name,
    isNavigating: isNavigating.value 
  });
  updatePageTitle();
});

// Initialize from URL parameters
async function initializeFromUrl() {
  if (!currentWorkspace.value) {
    return;
  }
  
  if (!currentWorkspace.value.git_repo) {
    return;
  }
  
  const folderParam = route.query.folder;
  const fileParam = route.query.file;
  
  // Set navigation flag to prevent route updates during initialization
  isNavigating.value = true;
  
  try {
    // Handle folder navigation - rely entirely on URL parameters
    if (folderParam) {
      const folderPath = decodeURIComponent(folderParam);
      await navigateToFolderByPath(folderPath, false); // Don't update URL during initialization
    } else {
      currentFolder.value = null;
      folderBreadcrumbs.value = [];
    }
    
    // Load files and folders for current path
    await loadContents();
    
    // Handle file selection after contents are loaded
    if (fileParam) {
      const fileName = decodeURIComponent(fileParam);
      const file = files.value.find(f => f.name === fileName);
      if (file) {
        selectedFile.value = file;
      } else {
        selectedFile.value = null;
      }
    } else {
      selectedFile.value = null;
    }
    
    // Update title now that breadcrumbs and selection have been established
    updatePageTitle();
    
  } catch (error) {
    ElMessage.error('Error loading folder: ' + error.message);
    
    // Fallback: load root contents
    try {
      currentFolder.value = null;
      folderBreadcrumbs.value = [];
      selectedFile.value = null;
      await loadContents();
    } catch (fallbackError) {
      // Silent fallback error
    }
  } finally {
    isNavigating.value = false;
  }
}

// Navigate to folder by path
async function navigateToFolderByPath(folderPath, updateUrl = true) {
  console.log('navigateToFolderByPath called with:', folderPath, 'updateUrl:', updateUrl);
  
  if (!folderPath || folderPath.trim() === '') {
    currentFolder.value = null;
    folderBreadcrumbs.value = [];
    return;
  }
  
  // Clean the path and split into parts
  const cleanPath = folderPath.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
  const pathParts = cleanPath.split('/').filter(part => part.trim() !== '');
  
  console.log('Path parts:', pathParts);
  
  // Check if we're already at this path to prevent unnecessary updates
  if (currentFolder.value && currentFolder.value.path === cleanPath) {
    console.log('Already at this path, skipping navigation');
    return;
  }
  
  // Reset breadcrumbs and folder
  folderBreadcrumbs.value = [];
  currentFolder.value = null;
  
  if (pathParts.length === 0) {
    console.log('No path parts, staying at root');
    return;
  }
  
  // Build breadcrumbs
  let currentPath = '';
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    currentPath += (currentPath ? '/' : '') + part;
    
    folderBreadcrumbs.value.push({
      name: part,
      path: currentPath
    });
    
    console.log(`Added breadcrumb ${i + 1}:`, { name: part, path: currentPath });
  }
  
  // Set current folder to the last part
  const lastPart = pathParts[pathParts.length - 1];
  currentFolder.value = {
    name: lastPart,
    path: cleanPath,
    type: 'dir'
  };
  
  console.log('Set current folder:', currentFolder.value);
  console.log('Final breadcrumbs:', folderBreadcrumbs.value);
  
  // Update URL to reflect the current navigation state
  // This ensures that when users reload the page, they stay in the same folder
  // Only update URL if explicitly requested (not during initialization)
  if (updateUrl) {
    await nextTick();
    await updateUrlForNavigation();
  }
}

// Lifecycle hooks
onMounted(async () => {
  updatePageTitle();
  updateLastFetchTime();
  
  // Load favorites for current workspace
  loadFavorites();
  
  // IMMEDIATE CACHE CHECK - Try to show cached content if commit matches
  if (currentWorkspace.value?.git_repo) {
    const repoName = currentWorkspace.value.git_repo;
    const cachedData = getCachedData(repoName, '');
    const storedCommitSha = getCachedCommitSha(repoName);
    
    if (cachedData && storedCommitSha) {
      // Don't set loading to true yet - let loadContents handle the commit check
    } else {
      loading.value = true; // Show loading for fresh data fetch
    }
  }
  
  // Add browser back/forward navigation listener
  const handlePopState = (event) => {
    // The route watcher will handle the actual navigation
  };
  
  window.addEventListener('popstate', handlePopState);
  

  
  // Store the cleanup function
  const cleanup = () => {
    window.removeEventListener('popstate', handlePopState);
  };
  
  // Return cleanup function for component unmounting
  return cleanup;
});

onUnmounted(() => {
  if (activeRequests.value.loadContents) {
    activeRequests.value.loadContents.abort();
  }
  lastRequestedPaths.value.loadContents = '';
});

// Validate Gitea configuration
function validateGiteaConfig() {
  const errors = [];
  
  if (!import.meta.env.VITE_GITEA_HOST) {
    errors.push('VITE_GITEA_HOST environment variable is not set');
  }
  
  if (!import.meta.env.VITE_GITEA_TOKEN) {
    errors.push('VITE_GITEA_TOKEN environment variable is not set');
  }
  
  if (errors.length > 0) {
    ElMessage.error('Gitea configuration is incomplete. Check environment variables.');
    return false;
  }
  
  return true;
}

// Load files and folders from Gitea (improved commit-based caching)
async function loadContents() {
  if (!currentWorkspace.value) {
    return;
  }
  if (!validateGiteaConfig()) {
    return;
  }
  
  const path = currentFolder.value?.path || '';
  const repoName = currentWorkspace.value.git_repo;
  
  // Cancel previous request if different path
  if (activeRequests.value.loadContents && lastRequestedPaths.value.loadContents !== path) {
    activeRequests.value.loadContents.abort();
  } else if (activeRequests.value.loadContents && lastRequestedPaths.value.loadContents === path) {
    // Same request already in progress, wait for it
    try {
      await new Promise((resolve) => {
        const checkComplete = () => {
          if (!activeRequests.value.loadContents) {
            resolve();
          } else {
            requestAnimationFrame(checkComplete);
          }
        };
        checkComplete();
      });
      return;
    } catch (error) {
      // Continue with new request
    }
  }
  
  lastRequestedPaths.value.loadContents = path;
  
  const abortController = new AbortController();
  activeRequests.value.loadContents = abortController;
  
  try {
    const startTime = performance.now();
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    // Step 1: Get latest commit SHA from Gitea first
    const latestCommitSha = await getLatestCommitSha(giteaHost, giteaToken, repoName);
    
    if (!latestCommitSha) {
      // Show a one-time notification about caching being disabled
      if (!sessionStorage.getItem('cache-fallback-notified')) {
        ElMessage({
          message: 'Repository not found. Smart caching is disabled. Files will load normally.',
          type: 'warning',
          duration: 8000,
          showClose: true
        });
        sessionStorage.setItem('cache-fallback-notified', 'true');
        
        // Also show a notification with action to create repository
        setTimeout(() => {
          ElMessage({
            message: 'Would you like to initialize the repository? Check console for details.',
            type: 'info',
            duration: 10000,
            showClose: true
          });
        }, 1000);
      }
      
      return await loadContentsDirectly(path, abortController);
    }
    
    // Step 2: Check stored commit ID in localStorage
    const storedCommitSha = getCachedCommitSha(repoName);
    
    // Step 3: Compare commit IDs and decide action
    if (storedCommitSha && storedCommitSha === latestCommitSha) {
      // ✅ Commit IDs match - load from cache
      const cachedData = getCachedData(repoName, path);
      if (cachedData) {
        files.value = cachedData.files || [];
        folders.value = cachedData.folders || [];
        
        // Restore pending file selection if any
        if (selectedFile.value && selectedFile.value.pending) {
          const pendingFileName = selectedFile.value.name;
          const actualFile = files.value.find(f => f.name === pendingFileName);
          if (actualFile) {
            console.log('Restoring pending file selection from cache:', pendingFileName);
            selectedFile.value = actualFile;
          } else {
            console.log('Pending file not found in cached contents, clearing selection:', pendingFileName);
            selectedFile.value = null;
          }
        }
        
        updateLastFetchTime();
        return;
      }
    }
    
    // Step 4: Fetch fresh data from Gitea
    loading.value = true;
    
    const freshData = await loadContentsDirectly(path, abortController);
    
    if (freshData) {
      // Step 5: Store commit ID and content in cache
      setCachedData(repoName, path, latestCommitSha, files.value, folders.value);
      // Update last fetch time display
      updateLastFetchTime();
    }
    
  } catch (error) {
    if (error.name !== 'AbortError') {
      // Fallback to direct loading
      return await loadContentsDirectly(path, abortController);
    }
  } finally {
    loading.value = false;
    if (activeRequests.value.loadContents === abortController) {
      activeRequests.value.loadContents = null;
    }
  }
}

// Silent background content loading (doesn't affect UI loading state)
async function loadContentsSilently(path, repoName, commitSha) {
  try {
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    const url = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/contents/${path}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getGiteaHeaders(giteaToken)
    });
    
    if (response.ok) {
      const data = await response.json();
      const items = Array.isArray(data) ? data : [data];
      
      // Separate files and folders
      const fileItems = items.filter(item => item.type === 'file');
      const folderItems = items.filter(item => item.type === 'dir');
      
      // Map to our format
      const newFiles = fileItems.map(item => ({
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
      
      const newFolders = folderItems.map(item => ({
        id: item.sha,
        name: item.name,
        type: 'dir',
        path: item.path,
        repository: `associateattorney/${repoName}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      // Check if content actually changed
      const currentFileNames = files.value.map(f => f.name).sort();
      const newFileNames = newFiles.map(f => f.name).sort();
      const currentFolderNames = folders.value.map(f => f.name).sort();
      const newFolderNames = newFolders.map(f => f.name).sort();
      
      if (JSON.stringify(currentFileNames) !== JSON.stringify(newFileNames) ||
          JSON.stringify(currentFolderNames) !== JSON.stringify(newFolderNames)) {
        files.value = newFiles;
        folders.value = newFolders;
        
        // Update cache with fresh data and commit SHA
        setCachedData(repoName, path, commitSha, newFiles, newFolders);
      } else {
        setCachedData(repoName, path, commitSha, newFiles, newFolders);
      }
    }
  } catch (error) {
    // Silent error handling
  }
}

// Direct API call without caching (fallback method)
async function loadContentsDirectly(path, abortController) {
  try {
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    const url = `${giteaHost}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents/${path}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getGiteaHeaders(giteaToken),
      signal: abortController.signal
    });
    
    if (response.status === 404) {
      // Repository or path doesn't exist yet
      files.value = [];
      folders.value = [];
      
      // If we were trying to load a specific folder path but it doesn't exist,
      // reset to root and show a message
      if (path && currentFolder.value) {
        ElMessage.warning(`Folder "${currentFolder.value.name}" not found. Redirecting to root.`);
        
        // Reset to root
        currentFolder.value = null;
        folderBreadcrumbs.value = [];
        
        // Update URL to reflect root state
        if (!isNavigating.value) {
          updateUrl();
        }
        
        // Try loading root contents
        const rootAbortController = new AbortController();
        activeRequests.value.loadContents = rootAbortController;
        
        const rootUrl = `${import.meta.env.VITE_GITEA_HOST}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents/`;
        const rootResponse = await fetch(rootUrl, {
          method: 'GET',
          headers: getGiteaHeaders(import.meta.env.VITE_GITEA_TOKEN),
          signal: rootAbortController.signal
        });
        
        if (rootResponse.ok) {
          const rootData = await rootResponse.json();
          const rootItems = Array.isArray(rootData) ? rootData : [rootData];
          
          const fileItems = rootItems.filter(item => item.type === 'file');
          const folderItems = rootItems.filter(item => item.type === 'dir');
          
          files.value = fileItems.map(item => {
            // Create raw download URL with token parameter (like your old app)
            const giteaHost = import.meta.env.VITE_GITEA_HOST;
            const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
            const rawDownloadUrl = `${giteaHost}/associateattorney/${currentWorkspace.value.git_repo}/raw/branch/main/${item.path}?token=${giteaToken}`;
            
            return {
              id: item.sha,
              name: item.name,
              type: 'file',
              size: item.size,
              path: item.path,
              download_url: rawDownloadUrl,
              repository: `associateattorney/${currentWorkspace.value.git_repo}`,
              sha: item.sha,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          });
          
          folders.value = folderItems.map(item => ({
            id: item.sha,
            name: item.name,
            type: 'dir',
            path: item.path,
            repository: `associateattorney/${currentWorkspace.value.git_repo}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
          
          // Restore pending file selection if any
          if (selectedFile.value && selectedFile.value.pending) {
            const pendingFileName = selectedFile.value.name;
            const actualFile = files.value.find(f => f.name === pendingFileName);
            if (actualFile) {
              console.log('Restoring pending file selection:', pendingFileName);
              selectedFile.value = actualFile;
            } else {
              console.log('Pending file not found in loaded contents, clearing selection:', pendingFileName);
              selectedFile.value = null;
            }
          }
        }
      }
      return true;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to load contents: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const items = Array.isArray(data) ? data : [data];
    
    // Separate files and folders from the single response
    const fileItems = items.filter(item => item.type === 'file');
    const folderItems = items.filter(item => item.type === 'dir');
    
    // Map files
    files.value = fileItems.map(item => {
      // Create raw download URL with token parameter (like your old app)
      const giteaHost = import.meta.env.VITE_GITEA_HOST;
      const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
      const rawDownloadUrl = `${giteaHost}/associateattorney/${currentWorkspace.value.git_repo}/raw/branch/main/${item.path}?token=${giteaToken}`;
      
      return {
        id: item.sha,
        name: item.name,
        type: 'file',
        size: item.size,
        path: item.path,
        download_url: rawDownloadUrl,
        repository: `associateattorney/${currentWorkspace.value.git_repo}`,
        sha: item.sha,
        created_at: new Date().toISOString(), // Gitea doesn't provide creation time in contents API
        updated_at: new Date().toISOString()
      };
    });
    
    // Restore pending file selection if any
    if (selectedFile.value && selectedFile.value.pending) {
      const pendingFileName = selectedFile.value.name;
      const actualFile = files.value.find(f => f.name === pendingFileName);
      if (actualFile) {
        console.log('Restoring pending file selection:', pendingFileName);
        selectedFile.value = actualFile;
      } else {
        console.log('Pending file not found in loaded contents, clearing selection:', pendingFileName);
        selectedFile.value = null;
      }
    }
    
    // Map folders
    folders.value = folderItems.map(item => ({
      id: item.sha,
      name: item.name,
      type: 'dir',
      path: item.path,
      repository: `associateattorney/${currentWorkspace.value.git_repo}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    // Update last fetch time since we fetched from server
    updateLastFetchTime();
    
    return true;
    
  } catch (error) {
    if (error.name !== 'AbortError') {
      ElMessage.error('Error loading contents: ' + error.message);
    }
    return false;
  }
}

// Keep these functions for backward compatibility
async function loadFiles() {
  return await loadContents();
}

async function loadFolders() {
  return await loadContents();
}

// Get file type for display
function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'univer': 'application/vnd.univer-doc'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Get file icon
function getFileIcon(file) {
  if (file.type === 'dir') {
    return Folder;
  }
  
  const filename = file.name.toLowerCase();
  const ext = filename.split('.').pop();
  
  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    return Picture;
  }
  
  // Document files
  if (['pdf', 'doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return Document;
  }
  
  // Spreadsheet files
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return Tickets;
  }
  
  // Text files
  if (['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yaml', 'yml'].includes(ext)) {
    return ReadingLamp;
  }
  
  // Univer documents
  if (ext === 'univer') {
    return Document;
  }
  
  // Default file icon
  return Files;
}

// Handle file upload
async function handleFileUpload() {
  if (!currentWorkspace.value) {
    ElMessage.error('No workspace selected');
    return;
  }

  // Create file input element
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = '*/*';
  
  fileInput.onchange = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    loading.value = true;
    
    try {
      for (const file of files) {
        await uploadSingleFile(file);
      }
      
      // Reload files after upload
      await loadContents();
      ElMessage.success(`Uploaded ${files.length} file(s) successfully`);
      
    } catch (error) {
      ElMessage.error('Error uploading files: ' + error.message);
    } finally {
      loading.value = false;
    }
  };
  
  fileInput.click();
}

// Upload single file
async function uploadSingleFile(file) {
  const giteaHost = import.meta.env.VITE_GITEA_HOST;
  const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
  
  // Convert file to base64
  const fileContent = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // Remove data:... prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  
  const filePath = currentFolder.value ? `${currentFolder.value.path}/${file.name}` : file.name;
  
  const response = await fetch(
    `${giteaHost}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents/${filePath}`,
    {
      method: 'POST',
      headers: getGiteaHeaders(giteaToken),
      body: JSON.stringify({
        message: `Add ${file.name}`,
        content: fileContent,
        branch: 'main'
      })
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to upload ${file.name}`);
  }
}

// Delete file
async function deleteFile(file) {
  try {
    const confirmed = await ElMessageBox.confirm(
      `Are you sure you want to delete "${file.name}"?`,
      'Confirm Delete',
      {
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        type: 'warning'
      }
    );
    
    if (!confirmed) return;
    
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    const response = await fetch(
      `${giteaHost}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents/${file.path}`,
      {
        method: 'DELETE',
        headers: getGiteaHeaders(giteaToken),
        body: JSON.stringify({
          message: `Delete ${file.name}`,
          sha: file.sha,
          branch: 'main'
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to delete ${file.name}`);
    }
    
    // Reload files
    await loadContents();
    ElMessage.success(`Deleted ${file.name}`);
    
    // Clear selection if deleted file was selected
    if (selectedFile.value?.id === file.id) {
      selectedFile.value = null;
      updateUrl();
    }
    
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('Error deleting file: ' + error.message);
    }
  }
}

// Create folder
async function createFolder() {
  if (!currentWorkspace.value || !newFolderName.value.trim()) return;
  
  try {
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    // Create a placeholder file in the new folder (Gitea doesn't support empty folders)
    const folderPath = currentFolder.value ? `${currentFolder.value.path}/${newFolderName.value}` : newFolderName.value;
    const placeholderPath = `${folderPath}/.gitkeep`;
    
    const response = await fetch(
      `${giteaHost}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents/${placeholderPath}`,
      {
        method: 'POST',
        headers: getGiteaHeaders(giteaToken),
        body: JSON.stringify({
          message: `Create folder ${newFolderName.value}`,
          content: btoa(''), // Empty file
          branch: 'main'
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to create folder ${newFolderName.value}`);
    }
    
    newFolderDialogVisible.value = false;
    newFolderName.value = '';
    await loadContents();
    ElMessage.success('Folder created successfully');
    
  } catch (error) {
    ElMessage.error('Error creating folder: ' + error.message);
  }
}

// Create Univer document
async function createUniverDocument() {
  if (!currentWorkspace.value || !newDocName.value.trim()) return;
  
  try {
    const docName = newDocName.value.endsWith('.univer') ? newDocName.value : `${newDocName.value}.univer`;
    const docPath = currentFolder.value ? `${currentFolder.value.path}/${docName}` : docName;
    
    // Create default Univer document structure
    const defaultDoc = {
      id: `doc-${Date.now()}`,
      title: newDocName.value,
      content: `# ${newDocName.value}\n\nThis is your new Univer document.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    const response = await fetch(
      `${giteaHost}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents/${docPath}`,
      {
        method: 'POST',
        headers: getGiteaHeaders(giteaToken),
        body: JSON.stringify({
          message: `Create Univer document ${docName}`,
          content: btoa(JSON.stringify(defaultDoc, null, 2)),
          branch: 'main'
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to create Univer document ${docName}`);
    }
    
    newDocDialogVisible.value = false;
    newDocName.value = '';
    await loadContents();
    ElMessage.success('Univer document created successfully');
    
  } catch (error) {
    ElMessage.error('Error creating Univer document: ' + error.message);
  }
}

// Navigate to folder
async function navigateToFolder(folder, fromUserAction = true) {
  try {
    console.log('Navigating to folder:', folder.name, 'path:', folder.path);
    
    // Set navigation flag to prevent route watcher from triggering
    if (fromUserAction) {
      isNavigating.value = true;
    }
    
    // Check if we're already in this folder to prevent duplicate breadcrumbs
    if (currentFolder.value && currentFolder.value.path === folder.path) {
      console.log('Already in this folder, but still updating URL if needed');
      // Still update URL even if we're already in the folder, in case URL is out of sync
      if (fromUserAction) {
        await nextTick();
        if (isNavigating.value) {
          await updateUrlForNavigation();
        }
      }
      return;
    }
    
    // Build new breadcrumbs
    const newBreadcrumbs = [...folderBreadcrumbs.value];
    
    // Only add breadcrumb if it's not already the last one
    const lastBreadcrumb = newBreadcrumbs[newBreadcrumbs.length - 1];
    if (!lastBreadcrumb || lastBreadcrumb.path !== folder.path) {
      newBreadcrumbs.push({
        name: folder.name,
        path: folder.path
      });
    }
    
    folderBreadcrumbs.value = newBreadcrumbs;
    currentFolder.value = folder;
    selectedFile.value = null;
    
    console.log('Updated breadcrumbs:', folderBreadcrumbs.value);
    console.log('Current folder set to:', currentFolder.value);
    
    // Load contents first
    await loadContents();
    
    // Then update URL after content is loaded (avoid race conditions)
    if (fromUserAction) {
      // Use a small delay to ensure state is fully updated
      await nextTick();
      
      // Double-check that we're still navigating to prevent race conditions
      if (isNavigating.value) {
        await updateUrlForNavigation();
      }
    }
    
  } catch (error) {
    console.error('Error navigating to folder:', error);
    ElMessage.error('Error navigating to folder: ' + error.message);
  } finally {
    if (fromUserAction) {
      // Reset navigation flag after a longer delay to allow URL update to complete
      setTimeout(() => {
        isNavigating.value = false;
      }, 300); // Increased from 200ms to 300ms
    }
  }
}

// Handle file selection
async function handleFileSelect(file) {
  try {
    console.log('handleFileSelect called with:', file.name);
    
    // Prevent rapid double-clicks that cause deselection
    if (isNavigating.value) {
      console.log('Navigation in progress, ignoring file selection');
      return;
    }
    
    // Set navigation flag to prevent route watcher from triggering
    isNavigating.value = true;
    
    // Always select the file (don't toggle off if already selected)
    selectedFile.value = file;
    console.log('File selected:', selectedFile.value?.name || 'none');
    console.log('isInSplitView:', isInSplitView.value);
    console.log('totalPanes:', totalPanes.value);
    console.log('About to update URL for file selection...');
    
    await updateUrlForNavigation();
    
    console.log('URL update completed for file selection');
    
    if (selectedFile.value) {
      updateWorkspaceActivity(currentWorkspace.value.id, 'file_view');
    }
    
    // Force a layout update
    nextTick(() => {
      console.log('Layout updated, selectedFile:', selectedFile.value?.name);
      console.log('isInSplitView after update:', isInSplitView.value);
    });
    
    // Reset navigation flag after a longer delay to prevent double-clicks and allow URL update to complete
    setTimeout(() => {
      console.log('Resetting navigation flag after file selection');
      isNavigating.value = false;
    }, 1000); // Increased to 1000ms to ensure URL update completes
  } catch (error) {
    console.error('Error selecting file:', error);
    isNavigating.value = false;
  }
}

// Handle file deselection
async function handleFileDeselect() {
  try {
    console.log('handleFileDeselect called');
    
    // Set navigation flag to prevent route watcher from triggering
    isNavigating.value = true;
    
    selectedFile.value = null;
    console.log('File deselected');
    
    await updateUrlForNavigation();
    
    // Reset navigation flag after a delay
    setTimeout(() => {
      isNavigating.value = false;
    }, 200);
  } catch (error) {
    console.error('Error deselecting file:', error);
    isNavigating.value = false;
  }
}

// Update URL with current state
function updateUrl() {
  if (isNavigating.value) return;
  
  isNavigating.value = true;
  
  try {
    const query = {};
    
    if (currentFolder.value) {
      query.folder = encodeURIComponent(currentFolder.value.path);
    }
    
    if (selectedFile.value) {
      query.file = encodeURIComponent(selectedFile.value.name);
    }
    
    console.log('Updating URL with query:', query);
    
    // Use replace to avoid creating history entries for internal navigation
    // This keeps the browser history clean while still allowing URL sharing
    router.replace({
      name: route.name,
      params: route.params,
      query: Object.keys(query).length > 0 ? query : undefined
    });
    
  } catch (error) {
    console.error('Error updating URL:', error);
  } finally {
    // Use nextTick to ensure the navigation flag is reset after Vue's reactivity cycle
    nextTick(() => {
      isNavigating.value = false;
    });
  }
}

// Update URL for navigation (bypasses isNavigating check for user actions)
async function updateUrlForNavigation() {
  try {
    console.log('updateUrlForNavigation called');
    console.log('Current folder:', currentFolder.value);
    console.log('Current route query:', route.query);
    console.log('selectedFile:', selectedFile.value?.name);
    
    const query = {};
    
    if (currentFolder.value) {
      query.folder = encodeURIComponent(currentFolder.value.path);
      console.log('Setting folder param to:', query.folder);
    }
    
    if (selectedFile.value) {
      query.file = encodeURIComponent(selectedFile.value.name);
      console.log('Setting file param to:', query.file);
    }
    
    console.log('Navigation URL update with query:', query);
    console.log('Current URL before update:', window.location.href);
    
    // Check if the URL actually needs to be updated
    const currentQuery = route.query;
    const newFolderParam = query.folder;
    const currentFolderParam = currentQuery.folder;
    const newFileParam = query.file;
    const currentFileParam = currentQuery.file;
    
    console.log('File selection details:', {
      selectedFile: selectedFile.value?.name,
      newFileParam,
      currentFileParam,
      needsUpdate: newFileParam !== currentFileParam
    });
    
    // Check if either folder or file parameters need updating
    if (newFolderParam === currentFolderParam && newFileParam === currentFileParam) {
      console.log('URL is already up to date, no need to update');
      return;
    }
    
    // Use router.replace to avoid creating multiple history entries for the same navigation
    console.log('Calling router.replace with query:', query);
    
    try {
      await router.replace({
        name: route.name,
        params: route.params,
        query: Object.keys(query).length > 0 ? query : undefined
      });
      
      console.log('URL update completed successfully');
      console.log('New URL after update:', window.location.href);
      console.log('Route query after update:', route.query);
      
    } catch (error) {
      // Handle duplicate navigation gracefully
      if (error.name === 'NavigationDuplicated' || error.message.includes('Avoided redundant navigation')) {
        console.log('Navigation was duplicate, ignoring error');
      } else {
        console.error('Router replace failed:', error);
        throw error; // Re-throw to be caught by outer try-catch
      }
    }
    
  } catch (error) {
    console.error('Error updating URL for navigation:', error);
  }
}

// Generate shareable URL for current state
function generateShareableUrl() {
  try {
    const query = {};
    
    if (currentFolder.value) {
      query.folder = encodeURIComponent(currentFolder.value.path);
    }
    
    if (selectedFile.value) {
      query.file = encodeURIComponent(selectedFile.value.name);
    }
    
    const resolved = router.resolve({
      name: route.name,
      params: route.params,
      query: Object.keys(query).length > 0 ? query : undefined
    });
    
    // Return full URL for sharing
    return `${window.location.origin}${resolved.href}`;
  } catch (error) {
    console.error('Error generating shareable URL:', error);
    return window.location.href;
  }
}

// Copy current URL to clipboard
async function copyCurrentUrl() {
  try {
    const shareableUrl = generateShareableUrl();
    await navigator.clipboard.writeText(shareableUrl);
    ElMessage.success({
      message: 'URL copied! You can share this link to open this exact folder and file.',
      duration: 4000
    });
  } catch (error) {
    console.error('Error copying URL:', error);
    // Fallback for browsers that don't support clipboard API
    const shareableUrl = generateShareableUrl();
    const textArea = document.createElement('textarea');
    textArea.value = shareableUrl;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      ElMessage.success('URL copied to clipboard');
    } catch (fallbackError) {
      ElMessage.error('Failed to copy URL. Please copy it manually from the address bar.');
    }
    document.body.removeChild(textArea);
  }
}

// Get Gitea headers
function getGiteaHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };
}

// Handle back navigation
/*function handleBackNavigation() {
  try {
    console.log('Back navigation triggered');
    
    // Set navigation flag to prevent route watcher from triggering
    isNavigating.value = true;
    
    if (selectedFile.value) {
      selectedFile.value = null;
      console.log('Cleared file selection');
    } else if (folderBreadcrumbs.value.length > 0) {
      folderBreadcrumbs.value.pop();
      if (folderBreadcrumbs.value.length > 0) {
        const parentFolder = folderBreadcrumbs.value[folderBreadcrumbs.value.length - 1];
        currentFolder.value = {
          name: parentFolder.name,
          path: parentFolder.path
        };
        console.log('Navigated back to parent folder:', parentFolder.name);
      } else {
        currentFolder.value = null;
        console.log('Navigated back to root');
      }
      loadContents();
    }
    updateUrlForNavigation();
    
    // Reset navigation flag after a small delay
    setTimeout(() => {
      isNavigating.value = false;
    }, 200);
  } catch (error) {
    console.error('Error in back navigation:', error);
    isNavigating.value = false;
  }
}*/

// Navigate to root directory
async function navigateToRoot() {
  console.log('Navigating to root');
  
  // Set navigation flag to prevent route watcher from triggering
  isNavigating.value = true;
  
  try {
    currentFolder.value = null;
    folderBreadcrumbs.value = [];
    selectedFile.value = null;
    
    console.log('Reset to root state');
    
    // Load root contents first
    await loadContents();
    
    // Then update URL
    await nextTick();
    await updateUrlForNavigation();
    
  } catch (error) {
    console.error('Error navigating to root:', error);
    ElMessage.error('Error navigating to root: ' + error.message);
  } finally {
    // Reset navigation flag after a small delay to allow URL update to complete
    setTimeout(() => {
      isNavigating.value = false;
    }, 200);
  }
}

// Navigate to specific breadcrumb folder
async function navigateToBreadcrumb(breadcrumbIndex) {
  console.log('Navigating to breadcrumb index:', breadcrumbIndex);
  
  if (breadcrumbIndex < 0 || breadcrumbIndex >= folderBreadcrumbs.value.length) {
    console.error('Invalid breadcrumb index:', breadcrumbIndex);
    return;
  }
  
  // Set navigation flag to prevent route watcher from triggering
  isNavigating.value = true;
  
  try {
    // Slice breadcrumbs to the clicked index
    folderBreadcrumbs.value = folderBreadcrumbs.value.slice(0, breadcrumbIndex + 1);
    
    // Set current folder to the clicked breadcrumb
    const targetBreadcrumb = folderBreadcrumbs.value[breadcrumbIndex];
    currentFolder.value = {
      name: targetBreadcrumb.name,
      path: targetBreadcrumb.path,
      type: 'dir'
    };
    
    selectedFile.value = null;
    
    console.log('Navigated to breadcrumb:', targetBreadcrumb);
    
    // Load contents first
    await loadContents();
    
    // Then update URL
    await nextTick();
    await updateUrlForNavigation();
    
  } catch (error) {
    console.error('Error navigating to breadcrumb:', error);
    ElMessage.error('Error navigating to folder: ' + error.message);
  } finally {
    // Reset navigation flag after a small delay to allow URL update to complete
    setTimeout(() => {
      isNavigating.value = false;
    }, 200);
  }
}

// Check if back button should be shown
const showBackButton = computed(() => {
  return selectedFile.value || folderBreadcrumbs.value.length > 0;
});

// Download file
async function downloadFile(file) {
  try {
    downloadingFiles.value.add(file.id);
    
    // Create raw download URL with token parameter (like your old app)
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const rawDownloadUrl = `${giteaHost}/associateattorney/${currentWorkspace.value.git_repo}/raw/branch/main/${file.path}?token=${giteaToken}`;
    
    console.log('Downloading file:', file.name, 'from URL:', rawDownloadUrl);
    
    const response = await fetch(rawDownloadUrl);
    if (!response.ok) {
      console.error('Download failed:', response.status, response.statusText);
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log('Downloaded file blob size:', blob.size, 'bytes');
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    ElMessage.success(`Downloaded ${file.name}`);
  } catch (error) {
    console.error('Error downloading file:', error);
    ElMessage.error('Failed to download file: ' + error.message);
  } finally {
    downloadingFiles.value.delete(file.id);
  }
}

// Download folder as ZIP
async function downloadFolder(folder) {
  try {
    downloadingFiles.value.add(folder.id);
    console.log('Starting folder download:', folder.name, 'path:', folder.path);
    
    // Get all files in the folder recursively
    const allFiles = await getAllFilesInFolder(folder.path);
    console.log(`Found ${allFiles.length} files in folder ${folder.name}:`, allFiles.map(f => f.path));
    
    if (allFiles.length === 0) {
      ElMessage.warning('Folder is empty, nothing to download');
      return;
    }
    
    // Create ZIP file
    const zip = new JSZip();
    let addedFiles = 0;
    
    // Add each file to the ZIP
    for (const file of allFiles) {
      try {
        console.log('Adding file to ZIP:', file.path, 'download URL:', file.download_url);
        
        // Fetch file content using the raw download URL with token
        const response = await fetch(file.download_url);
        if (!response.ok) {
          console.warn(`Failed to fetch file ${file.name}:`, response.status, response.statusText);
          continue;
        }
        
        const fileBlob = await response.blob();
        console.log('File blob size:', fileBlob.size, 'bytes for file:', file.name);
        
        // Calculate relative path within the folder
        let relativePath;
        if (file.path.startsWith(folder.path + '/')) {
          relativePath = file.path.substring(folder.path.length + 1);
        } else if (file.path === folder.path) {
          relativePath = file.name;
        } else {
          relativePath = file.path;
        }
        
        console.log('Adding to ZIP with relative path:', relativePath);
        zip.file(relativePath, fileBlob);
        addedFiles++;
      } catch (error) {
        console.warn(`Failed to add file ${file.name} to ZIP:`, error);
      }
    }
    
    console.log(`Added ${addedFiles} files to ZIP out of ${allFiles.length} total files`);
    
    if (addedFiles === 0) {
      ElMessage.error('Failed to add any files to ZIP');
      return;
    }
    
    // Generate ZIP file
    console.log('Generating ZIP file...');
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    console.log('ZIP file generated, size:', zipBlob.size, 'bytes');
    
    // Download the ZIP file
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${folder.name}.zip`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    ElMessage.success(`Downloaded ${folder.name}.zip with ${addedFiles} files`);
  } catch (error) {
    console.error('Error downloading folder:', error);
    ElMessage.error('Failed to download folder: ' + error.message);
  } finally {
    downloadingFiles.value.delete(folder.id);
  }
}

// Get all files in a folder recursively
async function getAllFilesInFolder(folderPath) {
  const allFiles = [];
  
  try {
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    // Build the API URL - handle empty path for root folder
    const apiPath = folderPath ? `/${folderPath}` : '';
    const apiUrl = `${giteaHost}/api/v1/repos/associateattorney/${currentWorkspace.value.git_repo}/contents${apiPath}`;
    
    console.log('Fetching folder contents from:', apiUrl);
    
    // Get contents of the folder
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: getGiteaHeaders(giteaToken)
    });
    
    if (!response.ok) {
      console.error(`API call failed: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch folder contents: ${response.status}`);
    }
    
    const contents = await response.json();
    const items = Array.isArray(contents) ? contents : [contents];
    
    console.log(`Found ${items.length} items in folder:`, folderPath || 'root');
    
    for (const item of items) {
      console.log('Processing item:', item.name, 'type:', item.type, 'path:', item.path);
      
      if (item.type === 'file') {
        // Create raw download URL with token parameter (like your old app)
        const rawDownloadUrl = `${giteaHost}/associateattorney/${currentWorkspace.value.git_repo}/raw/branch/main/${item.path}?token=${giteaToken}`;
        
        // Add file to the list
        allFiles.push({
          name: item.name,
          path: item.path,
          download_url: rawDownloadUrl,
          size: item.size
        });
        console.log('Added file:', item.name, 'with raw URL:', rawDownloadUrl);
      } else if (item.type === 'dir') {
        // Recursively get files from subdirectory
        console.log('Recursing into directory:', item.name);
        const subFolderFiles = await getAllFilesInFolder(item.path);
        allFiles.push(...subFolderFiles);
        console.log(`Added ${subFolderFiles.length} files from subdirectory:`, item.name);
      }
    }
    
    console.log(`Returning ${allFiles.length} files from folder:`, folderPath || 'root');
  } catch (error) {
    console.error(`Error getting files from folder ${folderPath || 'root'}:`, error);
    throw error;
  }
  
  return allFiles;
}

// Download entire workspace as ZIP
async function downloadWorkspace() {
  if (!currentWorkspace.value) {
    ElMessage.error('No workspace selected');
    return;
  }

  try {
    loading.value = true;
    console.log('Starting workspace download:', currentWorkspace.value.title);
    
    // Get all files in the workspace (root level)
    const allFiles = await getAllFilesInFolder('');
    console.log(`Found ${allFiles.length} files in workspace ${currentWorkspace.value.title}`);
    
    if (allFiles.length === 0) {
      ElMessage.warning('Workspace is empty, nothing to download');
      return;
    }
    
    // Create ZIP file
    const zip = new JSZip();
    
    // Add each file to the ZIP
    for (const file of allFiles) {
      try {
        console.log('Adding file to ZIP:', file.path);
        
        // Fetch file content
        const response = await fetch(file.download_url);
        if (!response.ok) {
          console.warn(`Failed to fetch file ${file.name}:`, response.status);
          continue;
        }
        
        const fileBlob = await response.blob();
        
        // Use the full path as the path in ZIP
        zip.file(file.path, fileBlob);
      } catch (error) {
        console.warn(`Failed to add file ${file.name} to ZIP:`, error);
      }
    }
    
    // Generate ZIP file
    console.log('Generating workspace ZIP file...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Download the ZIP file
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentWorkspace.value.title || 'workspace'}.zip`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    ElMessage.success(`Downloaded ${currentWorkspace.value.title || 'workspace'}.zip`);
  } catch (error) {
    console.error('Error downloading workspace:', error);
    ElMessage.error('Failed to download workspace: ' + error.message);
  } finally {
    loading.value = false;
  }
}

// Toggle column visibility
function toggleColumnVisibility(column) {
  columnVisibility.value[column] = !columnVisibility.value[column];
  
  if (column === 'type') {
    localStorage.setItem('filesTable_showTypeColumn', JSON.stringify(columnVisibility.value.type));
  } else if (column === 'size') {
    localStorage.setItem('filesTable_showSizeColumn', JSON.stringify(columnVisibility.value.size));
  }
}

// Format file size
function formatFileSize(bytes) {
  if (!bytes) return '-';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Generate folder navigation href
function generateFolderHref(folder) {
  try {
    const query = { ...route.query };
    query.folder = encodeURIComponent(folder.path);
    delete query.file;
    
    const resolved = router.resolve({
      name: route.name,
      params: route.params,
      query
    });
    
    return resolved.href;
  } catch (error) {
    console.error('Error generating folder href:', error);
    return '#';
  }
}

// Split view functionality - matches old app behavior
const canAddSplit = computed(() => splitPanes.value.length < maxSplits);
const totalPanes = computed(() => {
  // Always have files listing pane + selected file pane + additional split panes
  return 1 + (selectedFile.value ? 1 : 0) + splitPanes.value.length;
});

function addSplitPane() {
  if (canAddSplit.value) {
    splitPanes.value.push({
      id: Date.now(),
      selectedFile: null,
      currentFolder: null,
      folderBreadcrumbs: []
    });
  }
}

function removeSplitPane(index) {
  splitPanes.value.splice(index, 1);
}

function handleSplitFileSelect(file, splitIndex) {
  if (splitPanes.value[splitIndex]) {
    splitPanes.value[splitIndex].selectedFile = file;
  }
}

async function navigateInSplit(folder, splitIndex) {
  if (!splitPanes.value[splitIndex]) return;
  
  try {
    // Build new breadcrumbs for this split
    const newBreadcrumbs = [...splitPanes.value[splitIndex].folderBreadcrumbs];
    newBreadcrumbs.push({
      name: folder.name,
      path: folder.path
    });
    
    splitPanes.value[splitIndex].folderBreadcrumbs = newBreadcrumbs;
    splitPanes.value[splitIndex].currentFolder = folder;
    splitPanes.value[splitIndex].selectedFile = null;
    
  } catch (error) {
    console.error('Error navigating in split:', error);
    ElMessage.error('Error navigating to folder: ' + error.message);
  }
}

function handleSplitBackNavigation(splitIndex) {
  if (!splitPanes.value[splitIndex]) return;
  
  const split = splitPanes.value[splitIndex];
  
  if (split.selectedFile) {
    split.selectedFile = null;
  } else if (split.folderBreadcrumbs.length > 0) {
    split.folderBreadcrumbs.pop();
    if (split.folderBreadcrumbs.length > 0) {
      const previousFolder = split.folderBreadcrumbs[split.folderBreadcrumbs.length - 1];
      split.currentFolder = {
        name: previousFolder.name,
        path: previousFolder.path
      };
    } else {
      split.currentFolder = null;
    }
  }
}

function navigateToRootInSplit(splitIndex) {
  if (!splitPanes.value[splitIndex]) return;
  
  const split = splitPanes.value[splitIndex];
  split.folderBreadcrumbs = [];
  split.currentFolder = null;
  split.selectedFile = null;
}

function navigateToBreadcrumbInSplit(splitIndex, breadcrumbIndex) {
  if (!splitPanes.value[splitIndex]) return;
  
  const split = splitPanes.value[splitIndex];
  
  split.folderBreadcrumbs = split.folderBreadcrumbs.slice(0, breadcrumbIndex + 1);
  
  if (split.folderBreadcrumbs.length > 0) {
    const targetFolder = split.folderBreadcrumbs[breadcrumbIndex];
    split.currentFolder = {
      name: targetFolder.name,
      path: targetFolder.path
    };
  } else {
    split.currentFolder = null;
  }
  
  split.selectedFile = null;
}

function closeAllSplits() {
  splitPanes.value = [];
  selectedFile.value = null;
  updateUrl();
}

// Check if we're in split view mode
const isInSplitView = computed(() => selectedFile.value || splitPanes.value.length > 0);

// Cache management functions
async function refreshCache() {
  if (!currentWorkspace.value) {
    ElMessage.error('No workspace selected');
    return;
  }

  try {
    // Show loading state
    loading.value = true;
    
    // Clear cache for current repository
    clearRepositoryCache(currentWorkspace.value.git_repo);
    
    // Force reload contents from server (bypassing cache)
    await loadContents();
    
    // Update last fetch time and cache status display
    updateLastFetchTime();
    if (cacheStatusRef.value) {
      cacheStatusRef.value.updateStats();
    }
    
    ElMessage.success('Cache refreshed with latest data from server');
  } catch (error) {
    ElMessage.error('Failed to refresh cache: ' + error.message);
  } finally {
    loading.value = false;
  }
}



// Enhanced search functions
async function performEnhancedSearch() {
  if (!currentWorkspace.value?.git_repo || !filters.value.search.trim()) {
    searchResults.value = [];
    return;
  }
  
  searchLoading.value = true;
  
  try {
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    
    const results = await searchCachedDataEnhanced(
      giteaHost,
      giteaToken,
      currentWorkspace.value.git_repo,
      filters.value.search.trim(),
      {
        includeFiles: true,
        includeFolders: true,
        caseSensitive: false,
        maxResults: 200 // Allow more results for enhanced search
      }
    );
    
    searchResults.value = results;
    
  } catch (error) {
    console.error('Enhanced search error:', error);
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
}

// Pre-load all subfolders for better search performance
async function preloadSubfolders() {
  if (!currentWorkspace.value?.git_repo) {
    return;
  }
  
  try {
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const repoName = currentWorkspace.value.git_repo;
    
    // Get root data to see what subfolders exist
    let rootData = getCachedData(repoName, '');
    if (!rootData) {
      rootData = await fetchAndCacheFolderData(giteaHost, giteaToken, repoName, '');
    }
    
    if (rootData && rootData.folders && rootData.folders.length > 0) {
      console.log('Pre-loading subfolders for better search performance...');
      
      // Only pre-load actual subfolders that exist in the repository
      for (const folder of rootData.folders) {
        // Check if already cached
        const cachedData = getCachedData(repoName, folder.name);
        if (!cachedData) {
          // Fetch and cache in background
          fetchAndCacheFolderData(giteaHost, giteaToken, repoName, folder.name)
            .then(() => {
              console.log(`Pre-loaded subfolder: ${folder.name}`);
            })
            .catch(error => {
              // Only log as warning, not error, since folder might not exist
              console.warn(`Could not pre-load subfolder ${folder.name}:`, error.message);
            });
        }
      }
    } else {
      console.log('No subfolders found in root directory');
    }
  } catch (error) {
    console.error('Error pre-loading subfolders:', error);
  }
}

// Debounced enhanced search function
let enhancedSearchTimeout = null;
function debouncedEnhancedSearch() {
  if (enhancedSearchTimeout) {
    clearTimeout(enhancedSearchTimeout);
  }
  
  enhancedSearchTimeout = setTimeout(() => {
    if (filters.value.search.trim()) {
      performEnhancedSearch();
    } else {
      searchResults.value = [];
    }
  }, 300); // 300ms delay
}

// Watch for filters search term changes
watch(() => filters.value.search, () => {
  debouncedEnhancedSearch();
});

// Navigate to enhanced search result
function navigateToEnhancedSearchResult(result) {
  if (!result) return;
  
  try {
    // Set navigation flag to prevent route watcher from triggering
    isNavigating.value = true;
    
    // Navigate to the folder containing the result
    if (result.searchPath) {
      // Navigate to the folder path
      navigateToFolderByPath(result.searchPath, true); // Update URL for search result navigation
      
      // Load contents for that folder
      loadContents().then(() => {
        // Select the file/folder if it exists in current view
        const item = files.value.find(f => f.name === result.name) || 
                    folders.value.find(f => f.name === result.name);
        
        if (item) {
          if (item.type === 'dir') {
            navigateToFolder(item);
          } else {
            handleFileSelect(item);
          }
        }
      });
    } else {
      // Root level item
      navigateToRoot().then(() => {
        const item = files.value.find(f => f.name === result.name) || 
                    folders.value.find(f => f.name === result.name);
        
        if (item) {
          if (item.type === 'dir') {
            navigateToFolder(item);
          } else {
            handleFileSelect(item);
          }
        }
      });
    }
    
  } catch (error) {
    console.error('Error navigating to enhanced search result:', error);
    ElMessage.error('Failed to navigate to search result');
  } finally {
    // Reset navigation flag after a delay
    setTimeout(() => {
      isNavigating.value = false;
    }, 200);
  }
}

// Favorites management functions
function loadFavorites() {
  try {
    const stored = localStorage.getItem(`favorites_${currentWorkspace.value?.id}`);
    if (stored) {
      favorites.value = JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading favorites:', error);
    favorites.value = [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(`favorites_${currentWorkspace.value?.id}`, JSON.stringify(favorites.value));
  } catch (error) {
    console.error('Error saving favorites:', error);
  }
}

function isFavorite(item) {
  return favorites.value.some(fav => 
    fav.id === item.id && fav.type === item.type && fav.path === item.path
  );
}

function toggleFavorite(item) {
  const existingIndex = favorites.value.findIndex(fav => 
    fav.id === item.id && fav.type === item.type && fav.path === item.path
  );
  
  if (existingIndex >= 0) {
    // Remove from favorites
    favorites.value.splice(existingIndex, 1);
    ElMessage.success(`Removed "${item.name}" from favorites`);
  } else {
    // Add to favorites
    favorites.value.push({
      id: item.id,
      name: item.name,
      type: item.type,
      path: item.path,
      addedAt: new Date().toISOString()
    });
    ElMessage.success(`Added "${item.name}" to favorites`);
  }
  
  saveFavorites();
}

function navigateToFavorite(favorite) {
  try {
    // Set navigation flag to prevent route watcher from triggering
    isNavigating.value = true;
    
    if (favorite.type === 'dir') {
      // Navigate to folder
      navigateToFolderByPath(favorite.path, true);
      loadContents();
    } else {
      // Navigate to file's parent folder and select the file
      const parentPath = favorite.path.substring(0, favorite.path.lastIndexOf('/'));
      if (parentPath) {
        navigateToFolderByPath(parentPath, true);
        loadContents().then(() => {
          const file = files.value.find(f => f.name === favorite.name);
          if (file) {
            handleFileSelect(file);
          }
        });
      } else {
        // File is in root
        navigateToRoot();
        loadContents().then(() => {
          const file = files.value.find(f => f.name === favorite.name);
          if (file) {
            handleFileSelect(file);
          }
        });
      }
    }
    
    // Close favorites dialog
    favoritesDialogVisible.value = false;
    
  } catch (error) {
    console.error('Error navigating to favorite:', error);
    ElMessage.error('Failed to navigate to favorite');
  } finally {
    // Reset navigation flag after a delay
    setTimeout(() => {
      isNavigating.value = false;
    }, 200);
  }
}

function removeFavorite(favorite) {
  const index = favorites.value.findIndex(fav => 
    fav.id === favorite.id && fav.type === favorite.type && fav.path === favorite.path
  );
  
  if (index >= 0) {
    favorites.value.splice(index, 1);
    saveFavorites();
    ElMessage.success(`Removed "${favorite.name}" from favorites`);
  }
}
</script>

<template>
  <div class="manage-files">
    <!-- Dynamic Layout: matches old app behavior -->
    <div class="content" :class="{ 'split-mode': isInSplitView }">
      <!-- Main Container with dynamic columns -->
      <div class="main-container" :style="{ 
        display: 'grid', 
        gridTemplateColumns: isInSplitView ? `repeat(${totalPanes}, 1fr)` : '1fr',
        gap: isInSplitView ? '20px' : '0',
        height: 'calc(100vh - 80px)',
        minHeight: '600px'
      }">
        
        <!-- Files Section - Always present -->
        <div class="files-pane">
          <div class="pane-header">
            <div class="breadcrumbs">
              <div class="breadcrumb-container">
                <!-- Back Button -->
                <!--el-button 
                  v-if="showBackButton"
                  class="back-button"
                  :icon="ArrowLeft"
                  @click="handleBackNavigation"
                  size="small"
                  :disabled="isNavigating"
                /-->
                
                <!-- Breadcrumb Navigation -->
                <el-breadcrumb separator="/" v-if="folderBreadcrumbs.length > 0">
                  <el-breadcrumb-item>
                    <span
                      @click="navigateToRoot"
                      class="breadcrumb-link"
                      :class="{ disabled: isNavigating }"
                      style="cursor: pointer;"
                    >
                      Root
                    </span>
                  </el-breadcrumb-item>
                  <el-breadcrumb-item 
                    v-for="(crumb, index) in folderBreadcrumbs" 
                    :key="index"
                  >
                    <span
                      v-if="index < folderBreadcrumbs.length - 1"
                      @click="navigateToBreadcrumb(index)"
                      class="breadcrumb-link"
                      :class="{ disabled: isNavigating }"
                      style="cursor: pointer;"
                    >
                      {{ crumb.name }}
                    </span>
                    <span v-else class="current-folder">
                      {{ crumb.name }}
                      <!--el-tooltip content="This folder URL is shareable">
                        <span class="shareable-indicator">🔗</span>
                      </el-tooltip-->
                    </span>
                  </el-breadcrumb-item>
                </el-breadcrumb>
                <h2 v-else>
                  Root
                  <!--el-tooltip content="This URL is shareable - you can copy it to share this folder with others">
                    <span class="shareable-indicator">🔗</span>
                  </el-tooltip-->
                </h2>
              </div>
            </div>

            <!-- Actions -->
            <div class="actions">
              <!-- Last Fetch Time Info -->
              <div v-if="formattedLastFetchTime" class="last-fetch-time">
                <el-text size="small" type="info">
                  📅 Last updated: {{ formattedLastFetchTime }}
                </el-text>
              </div>

              <!-- Filters Toggle -->
              <el-badge :value="activeFiltersCount" :hidden="activeFiltersCount === 0" type="primary">
                <el-button 
                  @click="filters.showFilters = !filters.showFilters"
                  :type="filters.showFilters ? 'primary' : 'default'"
                  size="small"
                >
                  Filters
                </el-button>
              </el-badge>

              <!-- Favorites Button -->
              <el-badge :value="favorites.length" :hidden="favorites.length === 0" type="primary">
                <el-button 
                  @click="favoritesDialogVisible = true"
                  :type="favorites.length > 0 ? 'warning' : 'default'"
                  size="small"
                  :icon="StarFilled"
                >
                  Favorites
                </el-button>
              </el-badge>

              <!-- Actions Dropdown -->
              <el-dropdown trigger="click">
                <el-button type="primary" :icon="Plus" size="small">
                  New <el-icon><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="handleFileUpload">
                      <el-icon><UploadFilled /></el-icon>
                      Upload Files
                    </el-dropdown-item>
                    <el-dropdown-item @click="newFolderDialogVisible = true">
                      <el-icon><FolderAdd /></el-icon>
                      New Folder
                    </el-dropdown-item>
                    <el-dropdown-item @click="newDocDialogVisible = true">
                      <el-icon><Document /></el-icon>
                      New Document
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <!-- View Options -->
              <el-dropdown trigger="click">
                <el-button :icon="MoreFilled" size="small" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="copyCurrentUrl">
                      📋 Copy Current URL
                    </el-dropdown-item>
                    <el-dropdown-item @click="downloadWorkspace">
                      📦 Download Workspace (ZIP)
                    </el-dropdown-item>
                    <el-dropdown-item divided @click="refreshCache">
                      🔄 Refresh Cache
                    </el-dropdown-item>
                    <el-dropdown-item divided @click="toggleColumnVisibility('type')">
                      {{ columnVisibility.type ? '✓' : '' }} Show Type Column
                    </el-dropdown-item>
                    <el-dropdown-item @click="toggleColumnVisibility('size')">
                      {{ columnVisibility.size ? '✓' : '' }} Show Size Column
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>

          <!-- Cache Status - Hidden for cleaner UI -->
          <CacheStatus 
            :repo-name="currentWorkspace?.git_repo" 
            :show-info="false"
            ref="cacheStatusRef"
          />

          <!-- Filters -->
          <div v-if="filters.showFilters" class="filters-section">
            <div class="filter-form">
              <el-input
                v-model="filters.search"
                placeholder="Search all files and folders..."
                clearable
                size="small"
                v-loading="searchLoading"
              />
              <el-select
                v-model="filters.type"
                placeholder="File Type"
                clearable
                size="small"
              >
                <el-option label="Folders" value="folder" />
                <el-option label="Images" value="image" />
                <el-option label="Documents" value="document" />
              </el-select>
            </div>
            
            <!-- Local Search Info -->
            <div v-if="localSearchInfo" class="local-search-info">
              <div class="search-stats">
                <span class="search-term">"{{ localSearchInfo.searchTerm }}"</span>
                <span class="search-count">
                  {{ localSearchInfo.filteredCount }} result(s) found
                </span>
              </div>
              <div class="search-hint-text">
                <span>🔍 Searching across all folders in workspace</span>
               
                <!--el-button 
                  type="text" 
                  size="small" 
                  @click="preloadSubfolders"
                  style="margin-left: 4px; color: #409EFF; font-size: 11px;"
                >
                  Preload All
                </el-button-->
              </div>
            </div>
          </div>

          <!-- Files Table -->
          <el-table
            :data="filteredItems"
            v-loading="loading"
            @row-click="(row) => row.fullPath ? navigateToEnhancedSearchResult(row) : (row.type === 'dir' ? navigateToFolder(row) : handleFileSelect(row))"
            :row-style="{ cursor: 'pointer' }"
            empty-text="No files or folders found"
          >
            <el-table-column prop="name" label="Name" min-width="200">
              <template #default="{ row }">
                <div class="name-cell">
                  <div class="icon-group">
                    <el-icon 
                      v-if="!isFavorite(row)"
                      @click.stop="toggleFavorite(row)"
                      class="star-icon clickable-star"
                      :title="'Add to Favorites'"
                    >
                      <Star />
                    </el-icon>
                    <el-icon 
                      v-else
                      @click.stop="toggleFavorite(row)"
                      class="star-icon clickable-star favorited"
                      :title="'Remove from Favorites'"
                    >
                      <StarFilled />
                    </el-icon>
                    <el-icon class="file-icon">
                      <component :is="getFileIcon(row)" />
                    </el-icon>
                  </div>
                  <div class="file-info">
                    <span 
                      class="clickable-filename"
                      :class="{ 
                        disabled: isNavigating,
                        selected: selectedFile?.id === row.id
                      }"
                      @click="row.fullPath ? navigateToEnhancedSearchResult(row) : (row.type === 'dir' ? navigateToFolder(row) : handleFileSelect(row))"
                    >
                      {{ row.name }}
                    </span>
                    <span v-if="row.fullPath && row.searchPath" class="file-path">
                      {{ row.searchPath }}
                    </span>
                  </div>
                </div>
              </template>
            </el-table-column>

            <el-table-column 
              v-if="columnVisibility.type" 
              prop="type" 
              label="Type" 
              width="100"
            >
              <template #default="{ row }">
                {{ row.type === 'dir' ? 'Folder' : getFileType(row.name).split('/')[1] || 'File' }}
              </template>
            </el-table-column>

            <el-table-column 
              v-if="columnVisibility.size" 
              prop="size" 
              label="Size" 
              width="100"
            >
              <template #default="{ row }">
                {{ row.type === 'dir' ? '-' : formatFileSize(row.size) }}
              </template>
            </el-table-column>

            <el-table-column prop="updated_at" label="Modified" width="150">
              <template #default="{ row }">
                {{ new Date(row.updated_at).toLocaleDateString() }}
              </template>
            </el-table-column>

            <el-table-column width="100" align="right">
              <template #default="{ row }">
                <div @click.stop>
                  <el-dropdown trigger="click">
                    <el-button :icon="MoreFilled" size="small" text />
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-if="row.type !== 'dir'" @click="downloadFile(row)">
                          <el-icon><Download /></el-icon>
                          Download File
                        </el-dropdown-item>
                        <el-dropdown-item v-if="row.type === 'dir'" @click="downloadFolder(row)">
                          <el-icon><Download /></el-icon>
                          Download Folder (ZIP)
                        </el-dropdown-item>
                        <el-dropdown-item v-if="row.type !== 'dir'" @click="deleteFile(row)" class="danger">
                          Delete
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- Main File Preview Pane - Shows when file is selected -->
        <div v-if="selectedFile" class="preview-pane" :key="`preview-${selectedFile.id}`">
          <div class="pane-header">
            <h3>{{ selectedFile.name }}</h3>
            <div class="pane-actions">
              <el-button 
                v-if="canAddSplit"
                @click="addSplitPane"
                size="small"
                type="primary"
                title="Split view"
              >
                Split
              </el-button>
              <el-button 
                @click="handleFileDeselect"
                size="small"
                :icon="Close"
              >
                Close
              </el-button>
            </div>
          </div>
          
          <FilePreviewPane
            :file="selectedFile"
            @close="handleFileDeselect"
            @update:file="(updatedFile) => { selectedFile = updatedFile }"
            :key="`preview-component-${selectedFile.id}`"
          />
        </div>

        <!-- Additional Split Panes -->
        <div 
          v-for="(split, index) in splitPanes" 
          :key="split.id"
          class="split-pane"
        >
          <div class="pane-header">
            <div class="split-nav">
              <h3>Split {{ index + 1 }}</h3>
              <el-button 
                v-if="split.selectedFile || split.folderBreadcrumbs.length > 0"
                @click="handleSplitBackNavigation(index)"
                :icon="ArrowLeft"
                size="small"
                title="Go back"
              />
            </div>
            
            <div class="pane-actions">
              <el-button 
                v-if="canAddSplit"
                @click="addSplitPane"
                size="small"
                type="success"
                title="Add another split"
              >
                Split
              </el-button>
              <el-button 
                @click="removeSplitPane(index)"
                size="small"
                type="danger"
                :icon="Close"
              />
            </div>
          </div>

          <!-- File Browser for Split -->
          <div v-if="!split.selectedFile" class="split-file-browser">
            <!-- Breadcrumbs for Split -->
            <div v-if="split.folderBreadcrumbs.length > 0" class="split-breadcrumbs">
              <el-breadcrumb separator="/">
                <el-breadcrumb-item>
                  <span @click="navigateToRootInSplit(index)" class="breadcrumb-link">
                    Files
                  </span>
                </el-breadcrumb-item>
                <el-breadcrumb-item 
                  v-for="(crumb, breadIndex) in split.folderBreadcrumbs" 
                  :key="breadIndex"
                >
                  <span 
                    v-if="breadIndex < split.folderBreadcrumbs.length - 1"
                    @click="navigateToBreadcrumbInSplit(index, breadIndex)"
                    class="breadcrumb-link"
                  >
                    {{ crumb.name }}
                  </span>
                  <span v-else>{{ crumb.name }}</span>
                </el-breadcrumb-item>
              </el-breadcrumb>
            </div>
            
            <!-- Files Table for Split -->
            <el-table
              :data="filteredItems"
              v-loading="loading"
              @row-click="(row) => row.type === 'dir' ? navigateInSplit(row, index) : handleSplitFileSelect(row, index)"
              :row-style="{ cursor: 'pointer' }"
              empty-text="No files or folders found"
              size="small"
            >
              <el-table-column prop="name" label="Name" min-width="150">
                <template #default="{ row }">
                  <div class="name-cell">
                    <el-icon class="file-icon">
                      <component :is="getFileIcon(row)" />
                    </el-icon>
                    <span class="clickable-filename">
                      {{ row.name }}
                    </span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
          
          <!-- File Preview for Split -->
          <div v-else class="split-preview">
            <FilePreviewPane
              :file="split.selectedFile"
              @close="split.selectedFile = null"
              @update:file="(updatedFile) => { split.selectedFile = updatedFile }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- New Folder Dialog -->
    <el-dialog v-model="newFolderDialogVisible" title="Create New Folder" width="400px">
      <el-form>
        <el-form-item label="Folder Name">
          <el-input 
            v-model="newFolderName" 
            placeholder="Enter folder name"
            @keyup.enter="createFolder"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newFolderDialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="createFolder" :disabled="!newFolderName.trim()">
          Create
        </el-button>
      </template>
    </el-dialog>

    <!-- New Document Dialog -->
    <el-dialog v-model="newDocDialogVisible" title="Create New Document" width="400px">
      <el-form>
        <el-form-item label="Document Name">
          <el-input 
            v-model="newDocName" 
            placeholder="Enter document name"
            @keyup.enter="createUniverDocument"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newDocDialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="createUniverDocument" :disabled="!newDocName.trim()">
          Create
        </el-button>
      </template>
    </el-dialog>

    <!-- Favorites Dialog -->
    <el-dialog v-model="favoritesDialogVisible" title="Favorites" width="700px">
      <div v-if="favorites.length === 0" class="empty-favorites">
        <el-empty description="No favorites yet">
          <template #image>
            <el-icon size="60" color="#c0c4cc">
              <Star />
            </el-icon>
          </template>
          <p>Add files and folders to your favorites by clicking the star icon in their actions menu.</p>
        </el-empty>
      </div>
      
      <div v-else class="favorites-list">
        <el-table :data="favorites" size="small" max-height="400">
          <el-table-column prop="name" label="Name" min-width="200">
            <template #default="{ row }">
              <div class="favorite-item">
                <el-icon class="favorite-icon">
                  <component :is="row.type === 'dir' ? Folder : getFileIcon(row)" />
                </el-icon>
                <span class="favorite-name">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column prop="type" label="Type" width="80">
            <template #default="{ row }">
              <el-tag :type="row.type === 'dir' ? 'primary' : 'default'" size="small">
                {{ row.type === 'dir' ? 'Folder' : 'File' }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column prop="path" label="Path" min-width="200">
            <template #default="{ row }">
              <span class="favorite-path">{{ row.path || 'Root' }}</span>
            </template>
          </el-table-column>
          
          <el-table-column label="Actions" width="120" align="right">
            <template #default="{ row }">
              <div class="favorite-actions">
                <el-button 
                  @click="navigateToFavorite(row)"
                  size="small"
                  type="primary"
                  text
                >
                  Open
                </el-button>
                <el-button 
                  @click="removeFavorite(row)"
                  size="small"
                  type="danger"
                  text
                  :icon="StarFilled"
                />
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      
      <template #footer>
        <el-button @click="favoritesDialogVisible = false">Close</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.manage-files {
  min-height: 100vh;
  background-color: #f5f7fa;
  font-family: 'Roboto', sans-serif;
}

.content {
  max-width: none;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.content.split-mode {
  padding: 20px;
}

.main-container {
  height: calc(100vh - 80px);
  min-height: 600px;
}

/* Pane Styles */
.files-pane,
.preview-pane,
.split-pane {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  overflow: hidden;
  min-height: 0;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #dcdfe6;
  flex-shrink: 0;
}

.pane-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.split-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pane-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Files pane specific styles */
.files-pane {
  min-height: 0;
}

.files-pane .el-table {
  flex: 1;
  min-height: 0;
}

/* Preview pane styles */
.preview-pane {
  position: relative;
}

.preview-pane .file-preview-pane {
  border: none;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-pane .file-preview-pane .preview-header {
  display: none; /* Hide duplicate header */
}

.preview-pane .file-preview-pane .preview-content {
  flex: 1;
  padding: 0;
}

/* Split pane styles */
.split-file-browser {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-breadcrumbs {
  padding: 12px 16px;
  border-bottom: 1px solid #dcdfe6;
  background: #fafbfc;
  flex-shrink: 0;
}

.split-file-browser .el-table {
  flex: 1;
  min-height: 0;
}

.split-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-preview .file-preview-pane {
  border: none;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.split-preview .file-preview-pane .preview-header {
  display: none; /* Hide duplicate header */
}

.split-preview .file-preview-pane .preview-content {
  flex: 1;
  padding: 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
}

.breadcrumbs {
  flex: 1;
  min-width: 0;
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-button {
  flex-shrink: 0;
}

.back-button:hover {
  background-color: #ecf5ff;
}
.breadcrumb-container h2 {
    margin: 0;
    font-size: 1.2rem;
}
.header h2 {
  margin: 0;
  color: #303133;
  font-size: 24px;
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.filters-section {
  margin-bottom: 16px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
}

.filter-form {
  display: flex;
  gap: 16px;
  align-items: center;
}

.filter-form > * {
  flex: 1;
  max-width: 200px;
}

/* Dropdown menu styling */
:deep(.el-dropdown-menu) {
  min-width: 160px;
}

:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.el-dropdown-menu__item.danger) {
  color: #f56c6c;
}

:deep(.el-dropdown-menu__item.danger:hover) {
  background-color: #fef0f0;
  color: #f56c6c;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: #606266;
}

.clickable-filename {
  color: inherit;
  text-decoration: none;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clickable-filename.selected {
  color: #409EFF;
  font-weight: 500;
}

.clickable-filename:hover {
  color: #409EFF;
}

.clickable-filename.disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.clickable-filename.disabled:hover {
  color: #c0c4cc;
}

.breadcrumb-link {
  color: #409EFF;
  text-decoration: none;
}

.breadcrumb-link:hover {
  text-decoration: underline;
}

.breadcrumb-link.disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.breadcrumb-link.disabled:hover {
  text-decoration: none;
}

.shareable-indicator {
  margin-left: 8px;
  font-size: 14px;
  opacity: 0.7;
  cursor: help;
}

.shareable-indicator:hover {
  opacity: 1;
}

.current-folder {
  display: inline-flex;
  align-items: center;
  font-weight: 500;
}

.filter-badge {
  position: relative;
}

/* Responsive styles */
@media (max-width: 768px) {
  .content {
    padding: 10px;
  }
  
  .main-container {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  
  .pane-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .pane-actions {
    justify-content: center;
  }
  
  .actions {
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .last-fetch-time {
    margin-right: 4px;
    margin-bottom: 4px;
  }
  
  .filter-form {
    flex-direction: column;
  }
  
  .filter-form > * {
    max-width: none;
  }
}

@media (max-width: 1024px) {
  .main-container[style*="repeat(3"] {
    grid-template-columns: 1fr 1fr !important;
  }
  
  .main-container[style*="repeat(4"], 
  .main-container[style*="repeat(5"],
  .main-container[style*="repeat(6"],
  .main-container[style*="repeat(7"],
  .main-container[style*="repeat(8"],
  .main-container[style*="repeat(9"],
  .main-container[style*="repeat(10"] {
    grid-template-columns: 1fr 1fr !important;
  }
}

@media (max-width: 480px) {
  .name-cell {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .clickable-filename {
    font-size: 14px;
  }
}



/* Last Fetch Time in Actions Row */
.last-fetch-time {
  display: flex;
  align-items: center;
  margin-right: 8px;
  padding: 4px 8px;
  background: #f0f9ff;
  border-radius: 4px;
  border: 1px solid #e1f5fe;
}

/* Local Search Info Styles */
.local-search-info {
  margin-top: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border-left: 3px solid #409EFF;
}

.search-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.search-term {
  font-weight: 500;
  color: #303133;
}

.search-count {
  font-size: 12px;
  color: #909399;
}

.search-hint-text {
  font-size: 12px;
  color: #606266;
}

/* Dropdown menu styling */
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-path {
  font-size: 11px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Favorites styles */
.icon-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.star-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.clickable-star {
  cursor: pointer;
  color: #c0c4cc;
  opacity: 0.6;
}

.clickable-star:hover {
  opacity: 1;
  transform: scale(1.1);
}

.clickable-star.favorited {
  color: #f39c12;
  opacity: 1;
}

.clickable-star.favorited:hover {
  color: #e67e22;
  transform: scale(1.1);
}

.empty-favorites {
  text-align: center;
  padding: 20px;
}

.empty-favorites p {
  margin-top: 16px;
  color: #606266;
  font-size: 14px;
}

.favorites-list {
  max-height: 400px;
  overflow-y: auto;
}

.favorite-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.favorite-icon {
  font-size: 16px;
  color: #606266;
  flex-shrink: 0;
}

.favorite-name {
  font-weight: 500;
  color: #303133;
}

.favorite-path {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}

.favorite-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
</style>
