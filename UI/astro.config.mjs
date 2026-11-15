import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// Public (pk.) Mapbox token - safe to ship, it ends up in the client bundle
// anyway. Used when PUBLIC_MAPBOX_TOKEN isn't set in the build environment.
const DEFAULT_MAPBOX_TOKEN =
  'pk.eyJ1IjoibHVjaWRtYWNoIiwiYSI6ImNtbmN1cnB0cjE5YmUyb292ZmRudXl5NDUifQ.LfbSEeKAoInC047dS2SvNg';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  server: {
    port: 3000
  },
  // Without this, Astro ignores the Host/X-Forwarded-Host headers and every
  // API route sees its origin as https://localhost - which breaks the
  // same-origin self-fetch of /data/*.json in lib/staticData.ts.
  security: {
    allowedDomains: [{ protocol: 'https', hostname: '**.vercel.app' }]
  },
  integrations: [react()],
  vite: {
    envDir: '../',
    define: {
      'import.meta.env.PUBLIC_MAPBOX_TOKEN': JSON.stringify(process.env.PUBLIC_MAPBOX_TOKEN || DEFAULT_MAPBOX_TOKEN)
    },
    plugins: [tailwindcss()],
    build: {
      chunkSizeWarningLimit: 2000
    }
  }
});
