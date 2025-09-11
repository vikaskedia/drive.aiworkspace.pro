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
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
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

    // Increment access count
    await supabase.rpc('increment_share_access', { share_token_param: props.shareToken })

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

onMounted(async () => {
  // Wait a bit for the shared header to initialize supabase
  await new Promise(resolve => setTimeout(resolve, 100));
  
  loadShareInfo()
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
