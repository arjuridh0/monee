import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { APP_VERSION } from './src/app/version'
import { navigationDenylist } from './src/app/pwa-routes'

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'fonts/*.woff2', 'draco/*.{js,wasm}'],
      workbox: {
        navigateFallbackDenylist: navigationDenylist,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        globIgnores: ['**/*.glb'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: /\/mascots\/3d\/[^/]+\.glb$/,
          handler: 'CacheFirst',
          options: { cacheName: 'monee-mascot-models-v1', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 365 } },
        }],
      },
      manifest: {
        name: 'Monee — Pencatat Keuangan',
        short_name: 'Monee',
        description: 'Pencatat keuangan pribadi dengan maskot',
        lang: 'id',
        theme_color: '#EFE7DA',
        background_color: '#FAF7F2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    { name: 'monee-version', transformIndexHtml: html => html.replace('%MONEE_VERSION%', APP_VERSION) },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@mascots': resolve(__dirname, 'mascots'),
    },
  },
})
