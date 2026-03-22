import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  plugins: [react()],
  server: {
    // Proxy /api requests to the Express backend on port 3000
    // This means fetch('/api/auth/login') in React → goes to http://localhost:3000/api/auth/login
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        superadmin: resolve(__dirname, 'superadmin.html'),
      }
    }
  }
})
