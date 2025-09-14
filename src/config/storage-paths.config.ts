// ストレージ基底ディレクトリ名とパス正規化用の設定
// すべての設定値はここを唯一の参照源とする（Magic Number禁止規約）

export const storageBaseDirs = {
  novels: 'novels',
  chunks: 'chunks',
  analysis: 'analysis',
  layouts: 'layouts',
  renders: 'renders',
  outputs: 'outputs',
} as const

// 取り除くべき接頭辞（末尾スラッシュ必須）
export const removablePrefixes: readonly string[] = [
  `${storageBaseDirs.novels}/`,
  `${storageBaseDirs.chunks}/`,
  `${storageBaseDirs.analysis}/`,
  `${storageBaseDirs.layouts}/`,
  `${storageBaseDirs.renders}/`,
  `${storageBaseDirs.outputs}/`,
]

// 出力・ログ用途の固定文言
export const pathMigrationConfig = {
  dryRunEnvVar: 'PATH_MIGRATION_DRY_RUN',
  // 1回のUPDATEトランザクションで処理する最大件数（必要に応じて調整）
  batchSize: 500,
} as const
