import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: vercel(),
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
