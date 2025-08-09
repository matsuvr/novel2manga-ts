// 設定モジュールの統合エクスポート

// アプリケーション固有設定
export {
  type AppConfig,
  appConfig,
  getAppConfigWithOverrides,
} from './app.config'
// config-loaderの型定義のみをインポート（実装は使用しない）
export type {
  AIConfig,
  ApiConfig,
  Config,
  DatabaseConfig,
  EpisodeConfig,
  FeatureConfig,
  LogConfig,
  ProcessingConfig,
  SecurityConfig,
  StorageConfig,
} from './config-loader'

import { type AppConfig, getAppConfigWithOverrides } from './app.config'

// 初期化が必要な場合のヘルパー - app.config.tsベース
export async function ensureConfigLoaded() {
  try {
    // app.config.tsの設定を検証
    getAppConfigWithOverrides()
  } catch (error) {
    throw new Error(`Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}. Check app.config.ts syntax and structure.`)
  }
}

// アプリケーション設定を取得（環境変数オーバーライド適用済み）
export function getAppConfig(): AppConfig {
  return getAppConfigWithOverrides()
}

// チャンク分割設定を取得
export function getChunkingConfig() {
  return getAppConfig().chunking
}

// LLM設定を取得
export function getLLMConfig() {
  return getAppConfig().llm
}

// 物語弧分析設定を取得
export function getNarrativeAnalysisConfig() {
  return getAppConfig().llm.narrativeArcAnalysis
}

// テキスト分析設定を取得
export function getTextAnalysisConfig() {
  return getAppConfig().llm.textAnalysis
}

// レイアウト生成設定を取得
export function getLayoutGenerationConfig() {
  return getAppConfig().llm.layoutGeneration
}

// チャンクバンドル統合分析設定を取得
export function getChunkBundleAnalysisConfig() {
  return getAppConfig().llm.chunkBundleAnalysis
}

// 現在のLLMプロバイダー設定を取得
export function getCurrentLLMProvider() {
  const config = getAppConfig()
  const provider = config.llm.defaultProvider
  return {
    provider,
    config: config.llm.providers[provider],
  }
}

// 特定のLLMプロバイダー設定を取得
export function getLLMProviderConfig(
  provider: 'openai' | 'gemini' | 'groq' | 'claude' | 'openrouter',
) {
  const config = getAppConfig()
  return config.llm.providers[provider]
}

// フォールバックチェーンを取得
export function getLLMFallbackChain() {
  return getAppConfig().llm.fallbackChain
}

// プロセッシング設定を取得 - app.config.tsから直接取得
export function getProcessingConfig() {
  const config = getAppConfig()
  return {
    maxConcurrentChunks: config.processing.maxConcurrentChunks,
    batchSize: config.processing.batchSize.chunks,
    enableParallelProcessing: config.features.enableParallelProcessing,
    chunkSize: config.chunking.defaultChunkSize,
    overlapSize: config.chunking.defaultOverlapSize,
    maxChunkSize: config.chunking.maxChunkSize,
    minChunkSize: config.chunking.minChunkSize,
    maxOverlapRatio: config.chunking.maxOverlapRatio,
  }
}

// AI設定を取得 - app.config.tsから直接取得
export function getAIConfig() {
  const config = getAppConfig()
  return {
    provider: config.llm.defaultProvider,
    openai: config.llm.providers.openai,
    claude: config.llm.providers.claude,
    fallbackProvider: config.llm.fallbackChain[0],
    maxConcurrentRequests: config.processing.maxConcurrentChunks,
    requestQueueSize: 100, // 固定値
  }
}

// 現在のAIプロバイダーを取得 - app.config.tsから直接取得
export function getCurrentAIProvider(): string {
  return getAppConfig().llm.defaultProvider
}

// エピソード設定を取得 - app.config.tsから直接取得
export function getEpisodeConfig() {
  const config = getAppConfig()
  return {
    targetCharsPerEpisode: config.processing.episode.targetCharsPerEpisode,
    minCharsPerEpisode: config.processing.episode.minCharsPerEpisode,
    maxCharsPerEpisode: config.processing.episode.maxCharsPerEpisode,
    charsPerPage: config.processing.episode.charsPerPage,
  }
}

// フィーチャー設定を取得 - app.config.tsから直接取得
export function getFeatureConfig() {
  const config = getAppConfig()
  return {
    enableCaching: config.features.enableCaching,
    enableTextAnalysis: config.features.enableTextAnalysis,
    enableBatchProcessing: true, // 固定値
  }
}

// API設定を取得 - app.config.tsから直接取得
export function getApiConfig() {
  const config = getAppConfig()
  return {
    timeout: {
      default: config.api.timeout.default,
      upload: 60000, // 固定値
      analysis: config.api.timeout.textAnalysis,
    },
    retries: {
      default: config.processing.retry.maxAttempts,
      upload: 2, // 固定値
      analysis: 2, // 固定値
    },
  }
}

// ストレージ設定を取得 - app.config.tsから直接取得
export function getStorageConfig() {
  const config = getAppConfig()
  return {
    type: 'local' as const, // 現在はローカルのみサポート
    local: {
      basePath: config.storage.local.basePath,
      novelsDir: config.storage.local.novelsDir,
      chunksDir: config.storage.local.chunksDir,
      analysisDir: config.storage.local.analysisDir,
      layoutsDir: config.storage.local.layoutsDir,
      jobsDir: config.storage.local.jobsDir,
      rendersDir: config.storage.local.rendersDir,
      thumbnailsDir: config.storage.local.thumbnailsDir,
    },
  }
}

// データベース設定を取得 - 固定値（SQLite使用）
export function getDatabaseConfig() {
  return {
    type: 'sqlite' as const,
    sqlite: {
      path: './database/novel2manga.db',
      timeout: 5000,
      maxConnections: 1,
    },
    migrations: {
      enabled: true,
      migrationsPath: './database/migrations',
    },
  }
}

// 環境判定 - 環境変数から直接取得
export function isDevelopment(): boolean {
  const env = process.env.NODE_ENV || 'development'
  return env === 'development' || env === 'test'
}

export function isProduction(): boolean {
  const env = process.env.NODE_ENV || 'development'
  return env === 'production'
}

export function isDebugMode(): boolean {
  return process.env.DEBUG === 'true'
}
