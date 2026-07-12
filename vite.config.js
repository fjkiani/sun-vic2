import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@packages': path.resolve(process.cwd(), 'packages'),
    },
  },
  server: { port: 5173 },
  build: { sourcemap: true },
});
