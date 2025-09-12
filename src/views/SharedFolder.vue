<template>
  <div class="shared-folder-view">
    <!-- Header for shared folder -->
    <div class="shared-header">
      <div class="header-content">
        <h1>Shared Folder</h1>
        <div v-if="shareInfo" class="share-details">
          <p class="folder-name">
            <el-icon><Folder /></el-icon>
            {{ getFolderName(shareInfo.folder_path) }}
          </p>
          <p v-if="shareInfo.shared_with_description" class="shared-with">
            Shared with: {{ shareInfo.shared_with_description }}
          </p>
          <p v-if="shareInfo.expires_at" class="expiry-info">
            Expires: {{ formatExpiryDate(shareInfo.expires_at) }}
          </p>
          <div class="access-info">
            <el-alert
              title="View-only access"
              description="You can browse this folder and its subfolders, but cannot edit or upload files."
              type="info"
              :closable="false"
              show-icon
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-container">
      <el-result
        :icon="errorIcon"
        :title="errorTitle"
        :sub-title="errorMessage"
      >
        <template #extra>
          <el-button type="primary" @click="retry">Try Again</el-button>
        </template>
      </el-result>
    </div>

    <!-- Folder content -->
    <div v-else-if="shareInfo" class="folder-content">
      <FilesCt 
        :workspace-id="shareInfo.workspace_id"
        :initial-folder="shareInfo.folder_path"
        :is-shared-view="true"
        :share-token="shareToken"
        :on-file-view="trackFileView"
        :on-folder-navigation="trackFolderNavigation"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Folder } from '@element-plus/icons-vue'
import { supabase } from '@aiworkspace/shared-header'
import FilesCt from '../components/single-workspace/FilesCt.vue'

const props = defineProps({
  shareToken: {
    type: String,
    required: true
  }
})

const route = useRoute()
const loading = ref(true)
const error = ref(null)
const shareInfo = ref(null)
const accessLogId = ref(null)
const sessionStartTime = ref(null)
const filesViewed = ref(0)
const foldersNavigated = ref(0)

const errorIcon = computed(() => {
  if (error.value?.type === 'expired') return 'warning'
  if (error.value?.type === 'not_found') return 'error'
  return 'error'
})

const errorTitle = computed(() => {
  if (error.value?.type === 'expired') return 'Share Link Expired'
  if (error.value?.type === 'not_found') return 'Share Link Not Found'
  return 'Error Loading Share'
})

const errorMessage = computed(() => {
  if (error.value?.type === 'expired') return 'This share link has expired and is no longer accessible.'
  if (error.value?.type === 'not_found') return 'The share link you are trying to access does not exist or has been removed.'
  return error.value?.message || 'An unexpected error occurred while loading the shared folder.'
})

// Load share information
async function loadShareInfo(retryCount = 0) {
  try {
    loading.value = true
    error.value = null

    // Wait for supabase client to be ready
    if (!supabase) {
      if (retryCount < 5) {
        console.log(`Supabase client not ready, retrying in ${100 * (retryCount + 1)}ms... (attempt ${retryCount + 1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1)));
        return loadShareInfo(retryCount + 1);
      }
      throw new Error('Supabase client not initialized after multiple attempts')
    }

    // Get share information
    const { data: share, error: shareError } = await supabase
      .from('folder_shares')
      .select(`
        id,
        workspace_id,
        folder_path,
        shared_with_description,
        expires_at,
        created_at,
        access_count
      `)
      .eq('share_token', props.shareToken)
      .eq('is_active', true)
      .single()

    if (shareError) {
      if (shareError.code === 'PGRST116') {
        error.value = { type: 'not_found', message: 'Share not found' }
      } else {
        throw shareError
      }
      return
    }

    // Check if share has expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      error.value = { type: 'expired', message: 'Share has expired' }
      return
    }

    // Log detailed access with IP address
    const ipAddress = await getClientIPAddress()
    const userAgent = navigator.userAgent
    
    const { data: logId, error: logError } = await supabase.rpc('log_share_access', {
      share_token_param: props.shareToken,
      ip_address_param: ipAddress,
      user_agent_param: userAgent
    })
    
    if (logError) {
      console.error('Error logging share access:', logError)
      // Fallback to old method if new logging fails
      await supabase.rpc('increment_share_access', { share_token_param: props.shareToken })
    } else {
      accessLogId.value = logId
      sessionStartTime.value = Date.now()
      console.log('✅ Share access logged with ID:', logId, 'IP:', ipAddress)
    }

    shareInfo.value = share

  } catch (err) {
    console.error('Error loading share info:', err)
    error.value = { 
      type: 'error', 
      message: err.message || 'Failed to load shared folder' 
    }
  } finally {
    loading.value = false
  }
}

// Retry loading
function retry() {
  loadShareInfo()
}

// Format expiry date
function formatExpiryDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString()
}

// Get folder name from path
function getFolderName(folderPath) {
  if (!folderPath) return 'Root'
  
  // Split the path and get the last part (folder name)
  const pathParts = folderPath.split('/').filter(part => part.trim() !== '')
  return pathParts[pathParts.length - 1] || 'Root'
}

// Get client IP address
async function getClientIPAddress() {
  try {
    // Try to get IP from a public service
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    return data.ip
  } catch (error) {
    console.warn('Could not get public IP, using fallback:', error)
    // Fallback: try to get from headers or use a default
    return 'unknown'
  }
}

// Track file view
function trackFileView() {
  if (accessLogId.value) {
    filesViewed.value++
  }
}

// Track folder navigation
function trackFolderNavigation() {
  if (accessLogId.value) {
    foldersNavigated.value++
  }
}

// Update session duration when user leaves
async function updateSessionDuration() {
  if (accessLogId.value && sessionStartTime.value) {
    const sessionDuration = Math.floor((Date.now() - sessionStartTime.value) / 1000)
    
    try {
      await supabase.rpc('update_session_duration', {
        access_log_id_param: accessLogId.value,
        session_duration_seconds_param: sessionDuration,
        files_viewed_param: filesViewed.value,
        folders_navigated_param: foldersNavigated.value
      })
      console.log('✅ Session duration updated:', sessionDuration, 'seconds')
    } catch (error) {
      console.error('Error updating session duration:', error)
    }
  }
}

onMounted(async () => {
  // Wait a bit for the shared header to initialize supabase
  await new Promise(resolve => setTimeout(resolve, 100));
  
  loadShareInfo()
  
  // Add event listener to track when user leaves
  window.addEventListener('beforeunload', updateSessionDuration)
  window.addEventListener('pagehide', updateSessionDuration)
})

onUnmounted(() => {
  // Remove event listeners and update session duration
  window.removeEventListener('beforeunload', updateSessionDuration)
  window.removeEventListener('pagehide', updateSessionDuration)
  updateSessionDuration()
})
</script>

<style scoped>
.shared-folder-view {
  min-height: 100vh;
  background: #f8f9fa;
}

.shared-header {
  background: white;
  border-bottom: 1px solid #e4e7ed;
  padding: 20px;
  margin-bottom: 20px;
}

.header-content h1 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 24px;
}

.share-details {
  color: #606266;
}

.folder-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-weight: 500;
  color: #303133;
}

.shared-with,
.expiry-info {
  margin: 4px 0;
  font-size: 0.9rem;
}

.access-info {
  margin-top: 16px;
}

.loading-container,
.error-container {
  padding: 40px 20px;
  max-width: 600px;
  margin: 0 auto;
}

.folder-content {
  padding: 0 20px;
}

/* Responsive design */
@media (max-width: 768px) {
  .shared-header {
    padding: 16px;
  }
  
  .folder-content {
    padding: 0 16px;
  }
}
</style>
