import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api':     { target: process.env.VITE_API_TARGET ?? 'http://localhost:8000', changeOrigin: true },
      '/health':  { target: process.env.VITE_API_TARGET ?? 'http://localhost:8000', changeOrigin: true },
      '/watcher': {
        target: process.env.VITE_WATCHER_TARGET ?? 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/watcher/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
