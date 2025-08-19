import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Configuration for Novel2Manga Service
 * Tests the complete user workflow from novel input to manga layout generation
 */
export default defineConfig({
  testDir: './tests/integration/e2e',

  /* 長時間の処理を考慮したタイムアウト設定 */
  timeout: 5 * 60 * 1000, // 5分
  expect: {
    timeout: 30 * 1000, // 30秒
  },

  /* テスト実行設定 */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

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
    navigationTimeout: 60 * 1000,
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
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
})
