import { appConfig, AppConfig } from './app.config'
import { envConfigs } from './env.config'

// 深いマージ関数
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target }
  
  Object.keys(source).forEach((key) => {
    const targetValue = result[key as keyof T]
    const sourceValue = source[key as keyof T]
    
    if (sourceValue === undefined) {
      return
    }
    
    if (
      targetValue &&
      sourceValue &&
      typeof targetValue === 'object' &&
      typeof sourceValue === 'object' &&
      !Array.isArray(targetValue) &&
      !Array.isArray(sourceValue)
    ) {
      result[key as keyof T] = deepMerge(targetValue, sourceValue as any)
    } else {
      result[key as keyof T] = sourceValue as any
    }
  })
  
  return result
}

// 環境変数からのオーバーライド
function getEnvOverrides(): Partial<AppConfig> {
  const overrides: any = {}
  
  // チャンク設定のオーバーライド
  if (process.env.CHUNK_SIZE) {
    overrides.chunking = overrides.chunking || {}
    overrides.chunking.defaultChunkSize = parseInt(process.env.CHUNK_SIZE, 10)
  }
  
  if (process.env.OVERLAP_SIZE) {
    overrides.chunking = overrides.chunking || {}
    overrides.chunking.defaultOverlapSize = parseInt(process.env.OVERLAP_SIZE, 10)
  }
  
  // LLMプロバイダーのオーバーライド
  if (process.env.LLM_PROVIDER) {
    overrides.llm = overrides.llm || {}
    overrides.llm.defaultProvider = process.env.LLM_PROVIDER as any
  }
  
  // OpenAI設定のオーバーライド
  if (process.env.OPENAI_MODEL) {
    overrides.llm = overrides.llm || {}
    overrides.llm.providers = overrides.llm.providers || {}
    overrides.llm.providers.openai = overrides.llm.providers.openai || {}
    overrides.llm.providers.openai.model = process.env.OPENAI_MODEL
  }
  
  // Gemini設定のオーバーライド
  if (process.env.GEMINI_MODEL) {
    overrides.llm = overrides.llm || {}
    overrides.llm.providers = overrides.llm.providers || {}
    overrides.llm.providers.gemini = overrides.llm.providers.gemini || {}
    overrides.llm.providers.gemini.model = process.env.GEMINI_MODEL
  }
  
  // Groq設定のオーバーライド
  if (process.env.GROQ_MODEL) {
    overrides.llm = overrides.llm || {}
    overrides.llm.providers = overrides.llm.providers || {}
    overrides.llm.providers.groq = overrides.llm.providers.groq || {}
    overrides.llm.providers.groq.model = process.env.GROQ_MODEL
  }
  
  // 汎用LLM温度設定のオーバーライド
  if (process.env.LLM_TEMPERATURE) {
    const temperature = parseFloat(process.env.LLM_TEMPERATURE)
    overrides.llm = overrides.llm || {}
    overrides.llm.providers = overrides.llm.providers || {}
    
    // すべてのプロバイダーに適用
    ;['openai', 'gemini', 'groq'].forEach(provider => {
      overrides.llm.providers[provider] = overrides.llm.providers[provider] || {}
      overrides.llm.providers[provider].temperature = temperature
    })
  }
  
  // 並列処理数のオーバーライド
  if (process.env.MAX_CONCURRENT_CHUNKS) {
    overrides.processing = overrides.processing || {}
    overrides.processing.maxConcurrentChunks = parseInt(process.env.MAX_CONCURRENT_CHUNKS, 10)
  }
  
  // フィーチャーフラグのオーバーライド
  if (process.env.ENABLE_CACHING !== undefined) {
    overrides.features = overrides.features || {}
    overrides.features.enableCaching = process.env.ENABLE_CACHING === 'true'
  }
  
  if (process.env.ENABLE_TEXT_ANALYSIS !== undefined) {
    overrides.features = overrides.features || {}
    overrides.features.enableTextAnalysis = process.env.ENABLE_TEXT_ANALYSIS === 'true'
  }
  
  return overrides
}

// 設定ローダークラス
class ConfigLoader {
  private config: AppConfig
  private environment: string
  
  constructor() {
    this.environment = process.env.NODE_ENV || 'development'
    this.config = this.loadConfig()
  }
  
  private loadConfig(): AppConfig {
    // 1. ベース設定から開始
    let config = { ...appConfig }
    
    // 2. 環境別設定をマージ
    const envConfig = envConfigs[this.environment]
    if (envConfig) {
      config = deepMerge(config, envConfig)
    }
    
    // 3. 環境変数からのオーバーライドをマージ
    const envOverrides = getEnvOverrides()
    config = deepMerge(config, envOverrides)
    
    // 4. 設定の検証
    this.validateConfig(config)
    
    return config
  }
  
  private validateConfig(config: AppConfig): void {
    // チャンク設定の検証
    if (config.chunking.defaultChunkSize > config.chunking.maxChunkSize) {
      throw new Error('Default chunk size cannot exceed max chunk size')
    }
    
    if (config.chunking.defaultChunkSize < config.chunking.minChunkSize) {
      throw new Error('Default chunk size cannot be less than min chunk size')
    }
    
    if (config.chunking.defaultOverlapSize >= config.chunking.defaultChunkSize) {
      throw new Error('Overlap size must be less than chunk size')
    }
    
    const overlapRatio = config.chunking.defaultOverlapSize / config.chunking.defaultChunkSize
    if (overlapRatio > config.chunking.maxOverlapRatio) {
      throw new Error(`Overlap ratio ${overlapRatio} exceeds max overlap ratio ${config.chunking.maxOverlapRatio}`)
    }
    
    // LLM設定の検証
    if (config.llm.openai.temperature < 0 || config.llm.openai.temperature > 2) {
      throw new Error('Temperature must be between 0 and 2')
    }
    
    // API設定の検証
    if (config.api.timeout.default < 1000) {
      throw new Error('Timeout must be at least 1000ms')
    }
  }
  
  // 設定取得メソッド
  get(): AppConfig {
    return this.config
  }
  
  // 特定のパスの設定を取得
  getPath<T>(path: string): T {
    const keys = path.split('.')
    let value: any = this.config
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        throw new Error(`Config path "${path}" not found`)
      }
    }
    
    return value as T
  }
  
  // 環境を取得
  getEnvironment(): string {
    return this.environment
  }
  
  // 開発環境かどうか
  isDevelopment(): boolean {
    return this.environment === 'development'
  }
  
  // 本番環境かどうか
  isProduction(): boolean {
    return this.environment === 'production'
  }
  
  // テスト環境かどうか
  isTest(): boolean {
    return this.environment === 'test'
  }
  
  // 設定を再読み込み（主にテスト用）
  reload(): void {
    this.config = this.loadConfig()
  }
}

// シングルトンインスタンス
let configLoaderInstance: ConfigLoader | null = null

// 設定ローダーを取得
export function getConfig(): ConfigLoader {
  if (!configLoaderInstance) {
    configLoaderInstance = new ConfigLoader()
  }
  return configLoaderInstance
}

// エクスポート
export type { AppConfig }
export { appConfig }