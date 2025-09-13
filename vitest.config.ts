import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { getAppConfigWithOverrides } from './src/config/app.config'

const appConfig = getAppConfigWithOverrides()

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'unit',
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts', './src/__tests__/setup/unit.setup.ts'],
    testTimeout: 30000, // 30 seconds for unit tests
    hookTimeout: 10000, // 10 seconds for hooks
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    // Include only unit tests
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      // 移行期間: 既存場所も暫定サポート（後で削除予定）
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/**', // Legacy integration tests
      '**/src/test/examples/**', // Exclude example integration DB tests from unit run
      '**/src/__tests__/e2e/**', // E2E tests (run with Playwright)
      '**/src/__tests__/integration/**', // Integration tests (run separately)
      '**/*.integration.test.ts', // Integration tests
      '**/tmp_test/**', // Temporary test files
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
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/test/**',
        '**/tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.integration.test.ts',
        '**/tmp_test/**',
        '**/*.config.*',
        '**/vitest.setup.ts',
      ],
    },
    // Detailed error reporting for unit tests
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/__tests__'),
      // next/server shim removed; tests should not depend on Next.js internals.
      // Mock aliases for unit tests
      '@/db': path.resolve(__dirname, './src/__tests__/mocks/database.mock.ts'),
      '@/server/auth': path.resolve(__dirname, './src/__tests__/mocks/auth.mock.ts'),
      '@/server/auth/effectToApiResponse': path.resolve(
        __dirname,
        './src/__tests__/mocks/effectToApiResponse.mock.ts',
      ),
      // Minimal local mocks for Next.js modules used in unit tests. These avoid editing node_modules
      // and provide small, safe shims that satisfy imports during unit runs.
      'next/server': path.resolve(__dirname, './src/__tests__/mocks/next.server.mock.ts'),
      'next/image': path.resolve(__dirname, './src/__tests__/mocks/next.image.mock.ts'),
      'next/navigation': path.resolve(__dirname, './src/__tests__/mocks/next.navigation.mock.ts'),
      'next/link': path.resolve(__dirname, './src/__tests__/mocks/next.link.mock.ts'),
      // Order matters: map specific next-auth subpaths before the package root to avoid prefix matching
      'next-auth/react': path.resolve(__dirname, './src/__tests__/mocks/next-auth.react.mock.ts'),
      'next-auth/providers/google': path.resolve(
        __dirname,
        './src/__tests__/mocks/next-auth.providers.google.mock.ts',
      ),
      'next-auth': path.resolve(__dirname, './src/__tests__/mocks/next-auth.mock.ts'),
      // Provide a mock for the deeply imported database-service-factory used by dynamic imports in code
      '@/services/database/database-service-factory': path.resolve(
        __dirname,
        './src/__tests__/mocks/database-service-factory.mock.ts',
      ),
      // Also map the database barrel to a simple mock implementation for unit tests
      '@/services/database': path.resolve(
        __dirname,
        './src/__tests__/mocks/database-services.mock.ts',
      ),
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
