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
              type="primary" 
              size="large"
              @click="navigateToWorkspace('demo')"
            >
              <el-icon><Folder /></el-icon>
              Open File System
            </el-button>
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
import { useRouter } from 'vue-router'
import { Folder } from '@element-plus/icons-vue'

const router = useRouter()

const navigateToWorkspace = (workspaceId) => {
  router.push(`/all-workspace/files`)
}
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