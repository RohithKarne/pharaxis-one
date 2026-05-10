import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_API_TARGET || 'http://localhost:5100'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/admin/' : '/',
  root: '.',
  plugins: [
    react(),
    {
      name: 'superadmin-spa-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (
            !req.url.startsWith('/api') &&
            !req.url.startsWith('/@') &&
            !req.url.startsWith('/node_modules') &&
            !req.url.includes('.')
          ) {
            req.url = '/superadmin.html'
          }
          next()
        })
      }
    }
  ],
  build: {
    outDir: 'dist-superadmin',
    rollupOptions: {
      input: './superadmin.html'
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: true,
    proxy: {
      '/api': backendTarget
    }
  }
}))
