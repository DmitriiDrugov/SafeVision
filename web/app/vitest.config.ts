import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest configuration for browser-agnostic unit tests. We do NOT bundle
 * Next.js modules here — only the pure-TS utilities under lib/.
 */
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
