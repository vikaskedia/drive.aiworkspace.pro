<template>
  <div class="home">
    <div class="home-container">
      <h1>File System Workspace</h1>
      <p>Manage your files and documents with Gitea integration</p>
      
      <div class="workspace-actions">
        <el-card class="workspace-card">
          <h3>Quick Access</h3>
          <div class="action-buttons">
            <el-button 
              v-if="workspaces.length > 0"
              type="primary" 
              size="large"
              @click="navigateToFirstWorkspace"
            >
              <el-icon><Folder /></el-icon>
              Open File System
            </el-button>
            <el-button 
              v-else
              type="primary" 
              size="large"
              @click="loadWorkspaces"
            >
              <el-icon><Folder /></el-icon>
              Load Workspaces
            </el-button>
          </div>
          
          <!-- Show available workspaces -->
          <div v-if="workspaces.length > 0" class="workspace-list">
            <h4>Available Workspaces:</h4>
            <div class="workspace-item" v-for="workspace in workspaces" :key="workspace.id">
              <span>{{ workspace.title }}</span>
              <el-button 
                size="small" 
                type="text"
                @click="navigateToWorkspace(workspace.id)"
              >
                Open
              </el-button>
            </div>
          </div>
        </el-card>
        
        <el-card class="info-card">
          <h3>Features</h3>
          <ul>
            <li>File upload and management</li>
            <li>Folder organization</li>
            <li>Document preview and editing</li>
            <li>Markdown support</li>
            <li>Univer document integration</li>
            <li>Gitea backend storage</li>
          </ul>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../store/workspace'
import { Folder } from '@element-plus/icons-vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const workspaces = ref([])

const loadWorkspaces = async () => {
  try {
    const loadedWorkspaces = await workspaceStore.loadWorkspaces()
    workspaces.value = loadedWorkspaces || []
    console.log('Loaded workspaces:', workspaces.value)
  } catch (error) {
    console.error('Error loading workspaces:', error)
  }
}

const navigateToFirstWorkspace = () => {
  if (workspaces.value.length > 0) {
    navigateToWorkspace(workspaces.value[0].id)
  }
}

const navigateToWorkspace = (workspaceId) => {
  // Navigate to a specific workspace instead of the all-workspace route
  router.push(`/single-workspace/${workspaceId}/files`)
}

onMounted(async () => {
  // Load workspaces on mount
  await loadWorkspaces()
})
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.home-container {
  max-width: 800px;
  width: 100%;
  text-align: center;
  color: white;
}

.home-container h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.home-container p {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  opacity: 0.9;
}

.workspace-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-top: 2rem;
}

.workspace-card, .info-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 2rem;
  color: #333;
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
}

.workspace-card h3, .info-card h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.action-buttons .el-button {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workspace-list {
  margin-top: 1rem;
  text-align: left;
}

.workspace-list h4 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
  font-size: 1rem;
}

.workspace-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  margin: 0.25rem 0;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.workspace-item span {
  font-weight: 500;
  color: #495057;
}

.info-card ul {
  text-align: left;
  margin: 0;
  padding-left: 1.5rem;
}

.info-card li {
  margin-bottom: 0.5rem;
  color: #555;
}

@media (max-width: 768px) {
  .home-container h1 {
    font-size: 2rem;
  }
  
  .workspace-actions {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .workspace-card, .info-card {
    padding: 1.5rem;
  }
}
</style>