import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/mims/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  plugins: [react()],
  server: {
    // Proxy API + static backend assets to Express on port 3000 during local dev.
    proxy: {
      '/api': 'http://localhost:3000',
      '/storage': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
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
