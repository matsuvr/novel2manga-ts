// 設定モジュールの統合エクスポート
export { appConfig, type AppConfig } from './app.config'
export { getConfig } from './config-loader'
export { envConfigs } from './env.config'

// 便利なヘルパー関数
import { getConfig } from './config-loader'

// チャンク設定を取得
export function getChunkingConfig() {
  return getConfig().get().chunking
}

// LLM設定を取得
export function getLLMConfig() {
  return getConfig().get().llm
}

// 現在のLLMプロバイダーを取得
export function getCurrentLLMProvider() {
  return getConfig().get().llm.defaultProvider
}

// 特定のプロバイダー設定を取得
export function getLLMProviderConfig(provider?: 'openai' | 'gemini' | 'groq' | 'openrouter' | 'local') {
  const llmConfig = getConfig().get().llm
  const targetProvider = provider || llmConfig.defaultProvider
  return llmConfig.providers[targetProvider]
}

// テキスト分析用LLM設定を取得（プロバイダーも考慮）
export function getTextAnalysisConfig() {
  const config = getConfig().get()
  const textAnalysisConfig = config.llm.textAnalysis
  const provider = textAnalysisConfig.provider === 'default' 
    ? config.llm.defaultProvider 
    : textAnalysisConfig.provider
  
  const providerConfig = config.llm.providers[provider]
  const modelOverride = textAnalysisConfig.modelOverrides?.[provider]
  
  return {
    ...providerConfig,
    ...textAnalysisConfig,
    provider,
    model: modelOverride || providerConfig.model,
  }
}

// レイアウト生成用LLM設定を取得（プロバイダーも考慮）
export function getLayoutGenerationConfig() {
  const config = getConfig().get()
  const layoutConfig = config.llm.layoutGeneration
  const provider = layoutConfig.provider === 'default' 
    ? config.llm.defaultProvider 
    : layoutConfig.provider
  
  const providerConfig = config.llm.providers[provider]
  const modelOverride = layoutConfig.modelOverrides?.[provider]
  
  return {
    ...providerConfig,
    ...layoutConfig,
    provider,
    model: modelOverride || providerConfig.model,
  }
}

// ストレージ設定を取得
export function getStorageConfig() {
  const config = getConfig()
  return config.isDevelopment() 
    ? config.get().storage.local 
    : config.get().storage.r2
}

// API設定を取得
export function getAPIConfig() {
  return getConfig().get().api
}

// 処理設定を取得
export function getProcessingConfig() {
  return getConfig().get().processing
}

// フィーチャーフラグを取得
export function getFeatureFlags() {
  return getConfig().get().features
}

// 特定のフィーチャーが有効かチェック
export function isFeatureEnabled(feature: keyof AppConfig['features']): boolean {
  return getConfig().get().features[feature]
}

// 現在の環境を取得
export function getCurrentEnvironment() {
  return getConfig().getEnvironment()
}

// 開発環境かチェック
export function isDevelopment() {
  return getConfig().isDevelopment()
}

// 本番環境かチェック
export function isProduction() {
  return getConfig().isProduction()
}

// テスト環境かチェック
export function isTest() {
  return getConfig().isTest()
}