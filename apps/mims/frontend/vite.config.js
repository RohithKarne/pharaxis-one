import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: '/mims/',
  // Tests compile JSX with the automatic runtime too. Without it vitest used the
  // classic one, so every component test failed with "React is not defined"
  // (M-65) while the app itself built fine.
  esbuild: { jsx: 'automatic' },
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
        // React gets the highest priority so it is claimed first. Each group also
        // takes in the packages its modules import, so under the old manualChunks
        // rule the editor group swallowed React and every page, login included,
        // had to download the 400 KB editor before it could render.
        codeSplitting: {
          groups: [
            { name: 'vendor',      test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'editor',      test: /node_modules[\\/]@tiptap[\\/]/,                                              priority: 2 },
            { name: 'export-libs', test: /node_modules[\\/](jspdf|xlsx)[\\/]/,                                       priority: 1 },
          ],
        },
      },
    }
  }
})
