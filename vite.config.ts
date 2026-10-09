import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
