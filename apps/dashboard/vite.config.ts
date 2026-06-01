import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the heavy visualization libs out of the entry chunk; they load
        // only on the routes that use them (TraceDetail / CostsView).
        manualChunks: {
          'react-flow': ['@xyflow/react'],
          recharts: ['recharts'],
        },
      },
    },
  },
});
