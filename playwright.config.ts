import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Configuration for Novel2Manga Service
 * Tests the complete user workflow from novel input to manga layout generation
 */
const useProdServer = process.env.E2E_USE_BUILD === '1'

export default defineConfig({
  testDir: './tests/integration/e2e',

  /* 長時間の処理を考慮したタイムアウト設定 */
  timeout: process.env.NODE_ENV === 'test' ? 45 * 1000 : 5 * 60 * 1000, // テスト環境: 45秒, 通常: 5分
  expect: {
    timeout: 30 * 1000, // 30秒
  },

  /* テスト実行設定 */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Next.js開発サーバーの初回ビルド/ルート別JITビルドの衝突を避けるためワーカー数を抑制
  workers: process.env.CI ? 1 : 1,

  /* レポーター設定 */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
  ],

  /* グローバル設定 */
  use: {
    /* ベースURL - 開発サーバーまたは本番環境 */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* トレース記録 (デバッグ用) */
    trace: 'on-first-retry',

    /* スクリーンショット設定 */
    screenshot: 'only-on-failure',

    /* ビデオ録画 */
    video: 'retain-on-failure',

    /* ブラウザコンテキスト設定 */
    ignoreHTTPSErrors: true,

    /* タイムアウト設定 */
    actionTimeout: 30 * 1000,
    navigationTimeout: 60 * 1000, // 120秒→60秒に短縮
  },

  /* テスト結果とアーティファクト出力 */
  outputDir: 'test-results/',

  /* プロジェクト設定 - chromium のみ実行 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 開発サーバー設定 */
  webServer: process.env.CI
    ? undefined
    : {
        // DevServer or Production server based on E2E_USE_BUILD
        command: useProdServer ? 'npm run build && npm start' : 'npm run dev',
        url: 'http://localhost:3000', // ルートパスをチェック（より高速）
        reuseExistingServer: !process.env.CI, // 既存サーバーを再利用してスタートアップを高速化
        timeout: useProdServer ? 180 * 1000 : 120 * 1000, // 本番180秒、開発120秒に短縮
        env: {
          // 外部フォントのリモート取得で初期SSRがブロックされるのを避けるため強制無効化
          DISABLE_REMOTE_FONTS: '1',
          // Next.js devの安定化（必要に応じて）
          NODE_ENV: process.env.NODE_ENV || 'development',
          // Watchman未導入環境のファイル監視を安定化
          NEXT_DISABLE_SWC_WATCHMAN: '1',
          // Auth.js v5 のJWT復号と一致させるためのシークレット
          AUTH_SECRET: process.env.AUTH_SECRET || 'test-secret',
          // Dummy OAuth provider values to satisfy NextAuth provider config in dev/test
          AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID || 'dummy-google-id',
          AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET || 'dummy-google-secret',
        },
      },
})
