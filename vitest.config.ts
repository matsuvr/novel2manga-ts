import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { getAppConfigWithOverrides } from './src/config/app.config'

const appConfig = getAppConfigWithOverrides()

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    testTimeout: 600000, // 10分
    hookTimeout: 60000, // 1分
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/**', // 統合テストを除外
      '**/src/__tests__/e2e/**', // E2Eテストを除外（Playwrightで実行）
      '**/tmp_test/**', // 一時テストファイルを除外
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
    coverage: {
      enabled: appConfig.features.enableCoverageCheck,
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias map
    },
  },
  // Rollup optional dependencies workaround for CI environments
  optimizeDeps: {
    exclude: ['@rollup/rollup-linux-x64-gnu'],
  },
  define: {
    // Prevent Rollup from trying to load platform-specific binaries in test environment
    'process.env.NODE_ENV': '"test"',
  },
})
