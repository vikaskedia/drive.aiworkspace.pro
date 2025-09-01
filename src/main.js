import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { restoreCrossSubdomainSession } from './plugins/crossSubdomainAuth'

import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(router)
app.use(pinia)
app.use(ElementPlus)

// Register all ElementPlus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

(async () => {
  try {
    await restoreCrossSubdomainSession()
  } catch (e) {
    console.log('[auth][restore] failed pre-mount', e)
  }
  app.mount('#app')
})()
