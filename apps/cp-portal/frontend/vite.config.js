import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CP_API_PROXY lets a test run point the dev server at an isolated backend
// (one bound to pharaxis_cp_portal_test) instead of the shared dev instance.
const API_TARGET = process.env.CP_API_PROXY || 'http://localhost:4000'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/cp-portal/',
  plugins: [react()],
  server: {
    port: Number(process.env.CP_FRONTEND_PORT) || 5174,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/uploads': { target: API_TARGET, changeOrigin: true },
    },
  },
}))
