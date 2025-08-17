import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

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
      // 単体テストのみ実行するために、tests/ 配下（統合/E2E）と一時テストを除外
      '**/tests/**', // tests/integration/**（E2E は tests/integration/e2e/）をまとめて除外
      // API の重いルート依存テスト（Next サーバやCanvas等が必要）
      '**/src/__tests__/api/render*.test.ts',
      '**/src/__tests__/api/render-complete.test.ts',
      '**/src/__tests__/api/layout-generate.test.ts',
      '**/src/__tests__/api/share.test.ts',
      '**/src/__tests__/api/export.test.ts',
      '**/src/__tests__/api/llm-fallback.test.ts',
      // DOM/Canvas 実描画に依存
      '**/src/__tests__/canvas/**',
      // 参照先が存在しない古い型テスト
      '**/src/types/__tests__/novel-models.test.ts',
      // 不安定/WIP なユーティリティテスト
      '**/src/__tests__/cache-kv.test.ts',
      '**/tmp_test/**', // 一時テストファイルを除外
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
