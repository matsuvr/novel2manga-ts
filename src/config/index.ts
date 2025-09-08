// 設定モジュールの統合エクスポート

// アプリケーション固有設定（プロンプト等）
export { type AppConfig, appConfig, getAppConfigWithOverrides } from './app.config'

// 旧config-loader依存は廃止（DRYに基づきapp.config/llm.configへ集約）

import { type AppConfig, getAppConfigWithOverrides } from './app.config'
import path from 'node:path'
import { storageBaseDirs } from './storage-paths.config'
import {
  getLLMDefaultProvider as getDefaultProvider,
  getLLMFallbackChain as getFallbackChain,
  getLLMProviderConfig as getProviderConfig,
  type LLMProvider,
} from './llm.config'

// 初期化が必要な場合のヘルパー - app.config.tsベース
export async function ensureConfigLoaded() {
  try {
    // app.config.tsの設定を検証
    getAppConfigWithOverrides()
  } catch (error) {
    throw new Error(
      `Configuration loading failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }. Check app.config.ts syntax and structure.`,
    )
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

// テキスト分析設定を取得
export function getTextAnalysisConfig() {
  const prompts = getAppConfig().llm.textAnalysis
  const provider = getDefaultProvider()
  const providerConfig = getProviderConfig(provider as LLMProvider)
  return {
    provider: provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: prompts.systemPrompt,
    userPromptTemplate: prompts.userPromptTemplate,
  }
}

// レイアウト生成設定を取得
export function getLayoutGenerationConfig() {
  const prompts = getAppConfig().llm as unknown as Record<
    string,
    { systemPrompt?: string; userPromptTemplate?: string }
  >
  const lg = prompts.layoutGeneration || { systemPrompt: '', userPromptTemplate: '' }
  const provider = getDefaultProvider()
  const providerConfig = getProviderConfig(provider as LLMProvider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: lg.systemPrompt as string,
    userPromptTemplate: lg.userPromptTemplate as string,
  }
}

// DEPRECATED: チャンクバンドル統合分析設定を取得
// This function is deprecated and should not be used in the current flow
// The correct flow is: textAnalysis → scriptConversion → pageBreakEstimation
export function getChunkBundleAnalysisConfig() {
  const prompts = getAppConfig().llm as unknown as Record<
    string,
    { systemPrompt?: string; userPromptTemplate?: string }
  >
  const cb = prompts.chunkBundleAnalysis || { systemPrompt: '', userPromptTemplate: '' }
  const provider = getDefaultProvider()
  const providerConfig = getProviderConfig(provider as LLMProvider)
  return {
    provider: provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: cb.systemPrompt as string,
    userPromptTemplate: cb.userPromptTemplate as string,
  }
}

// 劇台本化設定を取得
export function getScriptConversionConfig() {
  const prompts = getAppConfig().llm as unknown as Record<
    string,
    { systemPrompt?: string; userPromptTemplate?: string }
  >
  const sc = prompts.scriptConversion || { systemPrompt: '', userPromptTemplate: '' }
  const provider = getDefaultProvider()
  const providerConfig = getProviderConfig(provider as LLMProvider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: sc.systemPrompt as string,
    userPromptTemplate: sc.userPromptTemplate as string,
  }
}

// ページ切れ目推定設定は廃止 (importance-based calculation に置き換え)

// コマ割り割当設定を取得
export function getPanelAssignmentConfig() {
  const prompts = getAppConfig().llm as unknown as Record<
    string,
    { systemPrompt?: string; userPromptTemplate?: string }
  >
  const pa = prompts.panelAssignment || { systemPrompt: '', userPromptTemplate: '' }
  const provider = getDefaultProvider()
  const providerConfig = getProviderConfig(provider as LLMProvider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: pa.systemPrompt as string,
    userPromptTemplate: pa.userPromptTemplate as string,
  }
}

// 現在のLLMプロバイダー設定を取得
export function getCurrentLLMProvider() {
  const provider = getDefaultProvider()
  return {
    provider,
    config: getProviderConfig(provider as LLMProvider),
  }
}

// 特定のLLMプロバイダー設定を取得
export function getLLMProviderConfig(
  provider: 'openai' | 'gemini' | 'groq' | 'grok' | 'openrouter' | 'cerebras' | 'vertexai' | 'fake',
) {
  return getProviderConfig(provider)
}

// フォールバックチェーンを取得
export function getLLMFallbackChain() {
  return getFallbackChain()
}

// デフォルトLLMプロバイダーを取得
export function getLLMDefaultProvider(): LLMProvider {
  return getDefaultProvider()
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
  return {
    provider: getDefaultProvider(),
    openai: getProviderConfig('openai' as LLMProvider),
    fallbackProvider: getFallbackChain()[0],
    maxConcurrentRequests: getAppConfig().processing.maxConcurrentChunks,
    requestQueueSize: 100, // 固定値
  }
}

// 現在のAIプロバイダーを取得 - app.config.tsから直接取得
export function getCurrentAIProvider(): string {
  return getDefaultProvider()
}

// エピソード設定を取得 - app.config.tsから直接取得
export function getEpisodeConfig() {
  const config = getAppConfig()
  return {
    targetCharsPerEpisode: config.processing.episode.targetCharsPerEpisode,
    minCharsPerEpisode: config.processing.episode.minCharsPerEpisode,
    maxCharsPerEpisode: config.processing.episode.maxCharsPerEpisode,
    smallPanelThreshold: config.processing.episode.smallPanelThreshold,
    minPanelsPerEpisode: config.processing.episode.minPanelsPerEpisode,
    maxPanelsPerEpisode: config.processing.episode.maxPanelsPerEpisode,
  }
}

// フィーチャー設定を取得 - app.config.tsから直接取得
export function getFeatureConfig() {
  const config = getAppConfig()
  return {
    enableCaching: config.features.enableCaching,
    enableTextAnalysis: config.features.enableTextAnalysis,
    enableCoverageCheck: config.features.enableCoverageCheck,
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
  return {
    type: 'local' as const, // 現在はローカルのみサポート
    local: {
      basePath:
        process.env.NODE_ENV === 'test' || process.env.VITEST
          ? path.join(process.cwd(), '.test-storage')
          : path.join(process.cwd(), '.local-storage'),
      novelsDir: storageBaseDirs.novels,
      chunksDir: storageBaseDirs.chunks,
      analysisDir: storageBaseDirs.analysis,
      layoutsDir: storageBaseDirs.layouts,
      jobsDir: 'jobs',
      rendersDir: storageBaseDirs.renders,
      thumbnailsDir: 'thumbnails',
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

// キャラクターメモリ設定を取得 - app.config.tsから直接取得
export function getCharacterMemoryConfig() {
  const config = getAppConfig()
  return {
    summaryMaxLength: config.characterMemory.summaryMaxLength,
    promptMemory: {
      maxTokens: config.characterMemory.promptMemory.maxTokens,
      recentChunkWindow: config.characterMemory.promptMemory.recentChunkWindow,
      topProminentCount: config.characterMemory.promptMemory.topProminentCount,
      tokenEstimatePerChar: config.characterMemory.promptMemory.tokenEstimatePerChar,
    },
    matching: {
      confidenceThreshold: config.characterMemory.matching.confidenceThreshold,
    },
    prominence: {
      weights: {
        events: config.characterMemory.prominence.weights.events,
        dialogue: config.characterMemory.prominence.weights.dialogue,
        chunkSpan: config.characterMemory.prominence.weights.chunkSpan,
        recent: config.characterMemory.prominence.weights.recent,
      },
      recentWindow: config.characterMemory.prominence.recentWindow,
    },
    majorActions: {
      min: config.characterMemory.majorActions.min,
      max: config.characterMemory.majorActions.max,
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
