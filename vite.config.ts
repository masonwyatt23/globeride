import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    cesium(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.ico'],
      manifest: {
        name: 'GlobeRide',
        short_name: 'GlobeRide',
        description:
          'Virtual cycling on a 3D Earth — bring your own GPX route, your own smart trainer, your own ride.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cesium ships some large WASM/JS chunks; bump the precache size limit.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,wasm,glb}'],
        navigateFallback: '/index.html',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // xAI proxy — routes /xai/* → https://api.x.ai/* to avoid CORS in the
      // browser during dev. In production, expose the same /xai path via your
      // hosting proxy (e.g. Vercel rewrites, Cloudflare Workers) or a
      // serverless function that adds the Authorization header server-side
      // so the API key is never sent from the browser to a public endpoint.
      '/xai': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xai/, ''),
        secure: true,
      },
      // Proxy /strava-api/* → https://www.strava.com/* to work around browser CORS.
      // In production, mirror this rewrite in your reverse-proxy / serverless function
      // (nginx location ^~ /strava-api/, Cloudflare Worker, Netlify redirect, etc.).
      '/strava-api': {
        target: 'https://www.strava.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/strava-api/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/xai': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xai/, ''),
        secure: true,
      },
      '/strava-api': {
        target: 'https://www.strava.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/strava-api/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
