import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    setupFiles: ['./src/__tests__/setup/integration.setup.ts'],
    testTimeout: 60000, // 60 seconds for integration tests
    hookTimeout: 30000, // 30 seconds for setup/teardown hooks
    pool: 'forks', // Isolate tests in separate processes
    poolOptions: {
      forks: {
        singleFork: true, // Run integration tests sequentially to avoid DB conflicts
      },
    },
    // Include integration tests only
    include: [
      'src/__tests__/**/*.integration.test.ts',
      'src/__tests__/integration/**/*.test.ts',
      // 既存互換
      'src/__tests__/integration/**/*.test.ts',
      'src/**/*.integration.test.ts',
      // Example DB tests
      'src/test/examples/**/*.test.ts',
    ],
    // Exclude unit tests and E2E tests
    exclude: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      'tests/integration/**', // Legacy integration tests
      '**/e2e/**', // E2E tests (run with Playwright)
      '**/tmp_test/**', // Temporary test files
      '**/.{idea,git,cache,output,temp}/**',
    ],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    // Detailed error reporting for integration tests
    reporters: ['verbose'],
    // Retry failed tests once (integration tests can be flaky)
    retry: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/__tests__'),
      // Use real implementations for integration tests (no mock aliases)
    },
  },
  esbuild: {
    target: 'node18',
  },
  define: {
    'process.env.NODE_ENV': '"test"',
    'process.env.DB_SKIP_MIGRATE': '"0"', // Allow migrations in integration tests
    'process.env.LOG_LEVEL': '"warn"', // Reduce log noise
  },
})
