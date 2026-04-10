import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_API_TARGET || 'http://localhost:5100'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backendTarget
    }
  }
})
