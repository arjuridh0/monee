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
      includeAssets: ['icons/*.{png,svg}', 'favicon.ico', 'fonts/*.woff2'],
      workbox: {
        navigateFallbackDenylist: navigationDenylist,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Monee — Pencatat Keuangan',
        short_name: 'Monee',
        description: 'Pencatat keuangan pribadi dengan maskot',
        lang: 'id',
        theme_color: '#F6F7F3',
        background_color: '#F6F7F3',
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
