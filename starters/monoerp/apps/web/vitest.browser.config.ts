import { fileURLToPath } from 'node:url'

import { frontendFeatures, moduleFeaturePaths } from './scripts/module-collections'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query', '@tanstack/react-router'],
    tsconfigPaths: true,
    alias: {
      '@': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
  define: {
    __MODULE_FEATURE_PATHS__: JSON.stringify(moduleFeaturePaths),
  },
  optimizeDeps: {
    entries: [
      'src/**/*.browser.tsx',
      ...frontendFeatures.active.map((feature) => `../../${feature.path}/**/*.browser.tsx`),
    ],
  },
  plugins: [react(), tailwindcss()],
  // Serves MSW's service worker (test/public/mockServiceWorker.js) to browser tests only.
  publicDir: 'test/public',
  test: {
    include: [
      'src/**/*.browser.tsx',
      ...frontendFeatures.active.map((feature) => `../../${feature.path}/**/*.browser.tsx`),
    ],
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: './node_modules/.cache/browser-screenshots',
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      viewport: { width: 1100, height: 900 },
    },
  },
})
