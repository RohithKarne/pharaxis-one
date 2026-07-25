import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

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
    port: Number(process.env.MIMS_DEV_PORT) || 5173,
    strictPort: !process.env.MIMS_DEV_PORT,
    // Proxy API + static backend assets to Express during local dev.
    // MIMS_API_PROXY overrides the backend target (default port 3000).
    proxy: {
      '/api': {
        target: process.env.MIMS_API_PROXY || 'http://127.0.0.1:3000',
        ws: true,
      },
      '/storage': process.env.MIMS_API_PROXY || 'http://127.0.0.1:3000',
      '/uploads': process.env.MIMS_API_PROXY || 'http://127.0.0.1:3000',
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tiptap'))                          return 'editor'
            if (id.includes('jspdf') || id.includes('xlsx'))    return 'export-libs'
            if (id.includes('react'))                           return 'vendor'
          }
        },
      },
    }
  }
})
