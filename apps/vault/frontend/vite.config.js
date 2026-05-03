import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_API_TARGET || 'http://localhost:5100'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/vault/' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': backendTarget
    }
  }
}))
