import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Files from '../views/Files.vue'
import AllWorkspaceFiles from '../views/AllWorkspaceFiles.vue'
import SharedFolder from '../views/SharedFolder.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/single-workspace/:workspace_id/files',
    name: 'Files',
    component: Files,
    props: true
  },
  {
    path: '/all-workspace/files',
    name: 'AllWorkspaceFiles',
    component: AllWorkspaceFiles,
    props: true
  },
  {
    path: '/shared-folder/:shareToken',
    name: 'SharedFolder',
    component: SharedFolder,
    props: true
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
