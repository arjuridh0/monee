import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

// Context7: resolve.alias HARUS di top level, bukan di dalam test:{}
export default defineConfig({
  plugins: [react(), VitePWA({ injectRegister: null })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@mascots': resolve(__dirname, 'mascots'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    // Keep Windows verification independent of child-process IPC.
    pool: 'threads',
    // Bound worker contention for real-time dialog/IndexedDB tests without relaxing assertions or timeouts.
    maxWorkers: 2,
  },
})
