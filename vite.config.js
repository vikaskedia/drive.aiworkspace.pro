import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Custom plugin to handle WebAssembly files
function wasmPlugin() {
  return {
    name: 'wasm-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        }
        next()
      })
    },
    transform(code, id) {
      if (id.includes('mupdf-wasm.js')) {
        // Replace the WebAssembly loading path to use the public directory
        return code.replace(
          /new URL\("mupdf-wasm\.wasm", import\.meta\.url\)/g,
          'new URL("/mupdf-wasm.wasm", window.location.origin)'
        )
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), wasmPlugin()],
  server: {
    port: 80,
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['mupdf']
  },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})
