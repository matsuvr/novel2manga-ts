// 設定モジュールの統合エクスポート

// アプリケーション固有設定
export {
  type AppConfig,
  appConfig,
  getAppConfigWithOverrides,
} from './app.config'
export {
  type AIConfig,
  type ApiConfig,
  type Config,
  type DatabaseConfig,
  type EpisodeConfig,
  type FeatureConfig,
  getConfig,
  getConfigManager,
  initializeConfig,
  type LogConfig,
  type ProcessingConfig,
  type SecurityConfig,
  type StorageConfig,
} from './config-loader'

import { type AppConfig, getAppConfigWithOverrides } from './app.config'
import type {
  AIConfig,
  ApiConfig,
  DatabaseConfig,
  EpisodeConfig,
  FeatureConfig,
  ProcessingConfig,
  StorageConfig,
} from './config-loader'
// 便利なヘルパー関数
import { getConfig } from './config-loader'

// 初期化が必要な場合のヘルパー
export async function ensureConfigLoaded() {
  const config = getConfig()
  try {
    config.getAll()
  } catch {
    await config.loadConfig()
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

// 現在のLLMプロバイダー設定を取得
export function getCurrentLLMProvider() {
  const config = getAppConfig()
  const provider = config.llm.defaultProvider
  return {
    provider,
    config: config.llm.providers[provider],
  }
}

// プロセッシング設定を取得
export function getProcessingConfig(): ProcessingConfig {
  return getConfig().get('processing') as ProcessingConfig
}

// AI設定を取得
export function getAIConfig(): AIConfig {
  return getConfig().get('ai') as AIConfig
}

// 現在のAIプロバイダーを取得
export function getCurrentAIProvider(): string {
  return getConfig().get('ai.provider', 'openai') as string
}

// エピソード設定を取得
export function getEpisodeConfig(): EpisodeConfig {
  return getConfig().get('episode') as EpisodeConfig
}

// フィーチャー設定を取得
export function getFeatureConfig(): FeatureConfig {
  return getConfig().get('features') as FeatureConfig
}

// API設定を取得
export function getApiConfig(): ApiConfig {
  return getConfig().get('api') as ApiConfig
}

// ストレージ設定を取得（環境に応じて適切な設定を返す）
export function getStorageConfig(): StorageConfig {
  return getConfig().get('storage') as StorageConfig
}

// データベース設定を取得
export function getDatabaseConfig(): DatabaseConfig {
  return getConfig().get('database') as DatabaseConfig
}

// 環境判定
export function isDevelopment(): boolean {
  return getConfig().isDevelopment()
}

export function isProduction(): boolean {
  return getConfig().isProduction()
}

export function isDebugMode(): boolean {
  return getConfig().isDebugMode()
}
