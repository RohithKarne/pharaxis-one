import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/qms/',
  plugins: [vue()],
  server: {
    port: 3146
  }
});
