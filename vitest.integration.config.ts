import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: './vitest.setup.ts',
    testTimeout: 600000, // 10分
    hookTimeout: 60000, // 1分
    // Playwright の *.spec.* は含めない（tests/integration/e2e は Playwright が拾う）
    include: ['**/tests/integration/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/tests/integration/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
