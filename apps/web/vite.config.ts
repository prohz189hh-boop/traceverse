import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig(({ mode }) => ({
  base: mode === 'public-demo' ? '/traceverse/' : '/',
  define: {
    'import.meta.env.VITE_TRACEVERSE_STATIC_DEMO': JSON.stringify(
      mode === 'public-demo' ? 'true' : 'false',
    ),
  },
  plugins: [react(), tailwind()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy:
      mode === 'public-demo'
        ? undefined
        : {
            '/api': 'http://127.0.0.1:4318',
            '/v1': 'http://127.0.0.1:4318',
            '/ws': { target: 'ws://127.0.0.1:4318', ws: true },
          },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: mode === 'public-demo' ? 'dist-public' : 'dist', chunkSizeWarningLimit: 1100 },
}));
