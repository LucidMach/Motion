import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  server: {
    port: 3000
  },
  integrations: [react()],
  vite: {
    envDir: '../',
    plugins: [tailwindcss()],
    build: {
      chunkSizeWarningLimit: 2000
    }
  }
});
