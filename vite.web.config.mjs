import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: resolve('src/renderer'),
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/report': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/reports': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
