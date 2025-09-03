<template>
  <div id="app">
    <AIWorkspaceHeader />
    <main class="main-content">
      <router-view/>
    </main>
  </div>
</template>

<script>
import { AIWorkspaceHeader } from '@aiworkspace/shared-header'

export default {
  name: 'App',
  components: {
    AIWorkspaceHeader
  }
}
</script>

<style>
@import '@aiworkspace/shared-header/style.css';

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.main-content {
  flex: 1;
  min-height: calc(100vh - 60px);
  background: #f8f9fa;
}

/* Global button styles */
button {
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

button:focus {
  outline: 2px solid #007bff;
  outline-offset: 2px;
}

/* Element Plus dropdown customizations */
.el-dropdown-menu {
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e1e5e9;
}

.el-dropdown-menu__item {
  padding: 8px 16px;
  font-size: 0.9rem;
  line-height: 16px;
}

.el-dropdown-menu__item:hover {
  color: #2c3e50;
}

/* Badge customizations */
.el-badge__content {
  border: none;
  font-size: 0.75rem;
  height: 18px;
  line-height: 18px;
  min-width: 18px;
  padding: 0 4px;
}

/* Dialog customizations */
.el-dialog {
  border-radius: 12px;
}

.el-dialog__header {
  padding: 20px 20px 10px 20px;
}

.el-dialog__body {
  padding: 10px 20px 20px 20px;
}

.el-dialog__footer {
  padding: 10px 20px 20px 20px;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* Responsive design */
@media (max-width: 768px) {
  .main-content {
    min-height: calc(100vh - 70px);
  }
}
</style>
