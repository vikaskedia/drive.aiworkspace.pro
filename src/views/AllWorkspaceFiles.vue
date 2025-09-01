<template>
    <div>
      <div class="message-container">
        <h2>All Files</h2>
        <p>This feature is coming soon! We're working hard to bring you a comprehensive view of all files across your workspaces.</p>
        <el-button type="primary" @click="goToAllWorkspaces">
          Return to All Workspaces
        </el-button>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'AllWorkspaceFiles',
    methods: {
      goToAllWorkspaces() {
        window.location.href = 'https://all-ws-dashboard.aiworkspace.pro/all-workspace/dashboard'
      }
    }
  };
  </script>
  
  <style scoped>
  /* Remove these styles as they're now in AllWorkspaceLayout */
  .coming-soon,
  .content {
    /* Remove these */
  }
  
  /* Keep the rest of the styles */
  .message-container {
    background: white;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  }
  
  h2 {
    color: #303133;
    margin-bottom: 1rem;
    font-size: 1.8rem;
    font-weight: 500;
  }
  </style> 