import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    setupFiles: ['./src/__tests__/integration/setup.ts'],
    testTimeout: 30_000, // 30秒（高速化）
    hookTimeout: 10_000, // 10秒
    pool: 'forks', // テストを分離して実行
    poolOptions: {
      forks: {
        singleFork: true, // 統合テストは順次実行（DB競合回避）
      },
    },
    // 新しい統合テストのみを対象
    include: ['src/**/*.integration.test.ts', 'src/__tests__/integration/**/*.test.ts'],
    // 旧統合テストとE2Eテストを除外
    exclude: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      'tests/integration/**', // 旧統合テストを除外
      '**/e2e/**', // E2Eテストを除外
    ],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    // 詳細なエラー出力
    reporter: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    target: 'node18',
  },
})
