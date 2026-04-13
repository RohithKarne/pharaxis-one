import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_API_TARGET || 'http://localhost:5100'

export default defineConfig({
  base: '/vault/',
  plugins: [react()],
  server: {
    port: 5176,
    proxy: {
      '/api': backendTarget
    }
  }
})
