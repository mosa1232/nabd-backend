import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app talks to a locally running FastAPI (port 8000);
// in production Caddy sends these same paths to the app container.
const API = process.env.KIUR_API || 'http://127.0.0.1:8000';
const proxied = ['/api', '/auth', '/media-files', '/static', '/health'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(proxied.map(p => [p, { target: API, changeOrigin: true }])),
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
});
