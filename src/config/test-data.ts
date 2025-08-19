/**
 * テスト用のデータ設定
 * CLAUDE.md CONFIG CENTRALIZATION ルールに従い、すべてのテストデータを集約
 */
export const TEST_CONFIG = {
  /**
   * レンダリングE2Eテスト用のサンプルテキスト
   */
  SAMPLE_RENDERING_TEXT: 'これはレンダリング確認用の短いテキストです。',

  /**
   * renderKey パース用の正規表現パターン
   */
  RENDER_KEY_PATTERN: /episode_(\d+)\/page_(\d+)\.png$/,

  /**
   * デフォルトのテストタイムアウト設定
   */
  DEFAULT_TIMEOUT_MS: 300000, // 5分
} as const
