import { z } from 'zod'

// ========================================
// Utility Functions
// ========================================

// Deep merge utility function (lodashライブラリの代替)
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const output = Object.assign({}, target)
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] })
        else
          output[key] = deepMerge(
            target[key] as Record<string, unknown>,
            source[key] as Record<string, unknown>,
          )
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }
  return output
}

function isObject(item: unknown): boolean {
  return item !== null && typeof item === 'object' && !Array.isArray(item)
}

// ========================================
// Schema Definitions (設計書対応)
// ========================================

// OpenAI設定
const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  model: z.string().default('gpt-4-turbo'),
  maxTokens: z.number().int().positive().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
  retryAttempts: z.number().int().min(0).default(3),
  timeoutMs: z.number().int().positive().default(30000),
})

// Claude設定
const ClaudeConfigSchema = z.object({
  apiKey: z.string().min(1, 'Claude API key is required'),
  model: z.string().default('claude-3-sonnet-20240229'),
  maxTokens: z.number().int().positive().default(4000),
  temperature: z.number().min(0).max(1).default(0.7),
  retryAttempts: z.number().int().min(0).default(3),
  timeoutMs: z.number().int().positive().default(30000),
})

// AI設定
const AIConfigSchema = z.object({
  provider: z.enum(['openai', 'claude']).default('openai'),
  openai: OpenAIConfigSchema.partial().optional(),
  claude: ClaudeConfigSchema.partial().optional(),
  fallbackProvider: z.enum(['openai', 'claude']).optional(),
  maxConcurrentRequests: z.number().int().positive().default(5),
  requestQueueSize: z.number().int().positive().default(100),
})

// ストレージ設定
const StorageConfigSchema = z.object({
  type: z.enum(['local', 'cloudflare']).default('local'),
  local: z
    .object({
      baseDir: z.string().default('./storage'),
      maxFileSize: z
        .number()
        .int()
        .positive()
        .default(10 * 1024 * 1024), // 10MB
      allowedExtensions: z.array(z.string()).default(['.txt', '.json', '.yaml', '.md']),
    })
    .optional(),
  cloudflare: z
    .object({
      accountId: z.string().optional(),
      r2BucketName: z.string().optional(),
      r2AccessKeyId: z.string().optional(),
      r2SecretAccessKey: z.string().optional(),
      r2Region: z.string().default('auto'),
      maxFileSize: z
        .number()
        .int()
        .positive()
        .default(100 * 1024 * 1024), // 100MB
      allowedExtensions: z.array(z.string()).default(['.txt', '.json', '.yaml', '.md', '.pdf']),
    })
    .optional(),
})

// データベース設定
const DatabaseConfigSchema = z.object({
  type: z.enum(['sqlite', 'd1']).default('sqlite'),
  sqlite: z
    .object({
      path: z.string().default('./database/novel2manga.db'),
      timeout: z.number().int().positive().default(5000),
      maxConnections: z.number().int().positive().default(1),
    })
    .optional(),
  d1: z
    .object({
      databaseId: z.string().optional(),
      token: z.string().optional(),
      accountId: z.string().optional(),
      timeout: z.number().int().positive().default(10000),
    })
    .optional(),
  migrations: z
    .object({
      enabled: z.boolean().default(true),
      migrationsPath: z.string().default('./database/migrations'),
    })
    .default({}),
})

// プロジェクト固有設定
const ProcessingConfigSchema = z.object({
  maxConcurrentChunks: z.number().int().positive().default(5),
  batchSize: z.number().int().positive().default(10),
  enableParallelProcessing: z.boolean().default(true),
  chunkSize: z.number().int().positive().default(2000),
  overlapSize: z.number().int().positive().default(200),
  maxChunkSize: z.number().int().positive().default(4000),
  minChunkSize: z.number().int().positive().default(500),
  maxOverlapRatio: z.number().min(0).max(1).default(0.2),
})

const EpisodeConfigSchema = z.object({
  targetCharsPerEpisode: z.number().int().positive().default(8000),
  minCharsPerEpisode: z.number().int().positive().default(6000),
  maxCharsPerEpisode: z.number().int().positive().default(12000),
  charsPerPage: z.number().int().positive().default(400),
})

const FeatureConfigSchema = z.object({
  enableCaching: z.boolean().default(true),
  enableTextAnalysis: z.boolean().default(true),
  enableBatchProcessing: z.boolean().default(true),
})

const ApiConfigSchema = z.object({
  timeout: z
    .object({
      default: z.number().int().positive().default(30000),
      upload: z.number().int().positive().default(60000),
      analysis: z.number().int().positive().default(120000),
    })
    .default({}),
  retries: z
    .object({
      default: z.number().int().min(0).default(3),
      upload: z.number().int().min(0).default(2),
      analysis: z.number().int().min(0).default(2),
    })
    .default({}),
})

// セキュリティ設定
const SecurityConfigSchema = z.object({
  secretKey: z.string().min(32, 'Secret key must be at least 32 characters').optional(),
  cors: z
    .object({
      origin: z.union([z.string(), z.array(z.string())]).default('*'),
      credentials: z.boolean().default(true),
      methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE']),
      allowedHeaders: z.array(z.string()).default(['Content-Type', 'Authorization']),
    })
    .default({}),
  rateLimit: z
    .object({
      windowMs: z
        .number()
        .int()
        .positive()
        .default(15 * 60 * 1000), // 15分
      maxRequests: z.number().int().positive().default(100),
      skipSuccessfulRequests: z.boolean().default(false),
    })
    .default({}),
  authentication: z
    .object({
      required: z.boolean().default(false),
      jwtSecret: z.string().optional(),
      jwtExpiresIn: z.string().default('1d'),
      sessionTimeout: z
        .number()
        .int()
        .positive()
        .default(24 * 60 * 60 * 1000), // 24時間
    })
    .default({}),
})

// ログ設定
const LogConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  format: z.enum(['json', 'text']).default('text'),
  outputs: z.array(z.enum(['console', 'file', 'external'])).default(['console']),
  file: z
    .object({
      path: z.string().default('./logs/app.log'),
      maxSize: z.string().default('10MB'),
      maxFiles: z.number().int().positive().default(5),
      datePattern: z.string().default('YYYY-MM-DD'),
    })
    .optional(),
  external: z
    .object({
      endpoint: z.string().url().optional(),
      apiKey: z.string().optional(),
      batchSize: z.number().int().positive().default(100),
      flushInterval: z.number().int().positive().default(5000),
    })
    .optional(),
})

// メイン設定スキーマ
const ConfigSchema = z.object({
  app: z
    .object({
      name: z.string().default('Novel2Manga'),
      version: z.string().default('1.0.0'),
      environment: z.enum(['development', 'staging', 'production', 'test']).default('development'),
      baseUrl: z.string().url().default('http://localhost:3000'),
      port: z.number().int().positive().default(3000),
      debug: z.boolean().default(false),
    })
    .default({}),
  ai: AIConfigSchema.default({}),
  storage: StorageConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  logging: LogConfigSchema.default({}),
  processing: ProcessingConfigSchema.default({}),
  episode: EpisodeConfigSchema.default({}),
  features: FeatureConfigSchema.default({}),
  api: ApiConfigSchema.default({}),
})

export type Config = z.infer<typeof ConfigSchema>
export type AIConfig = z.infer<typeof AIConfigSchema>
export type StorageConfig = z.infer<typeof StorageConfigSchema>
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>
export type LogConfig = z.infer<typeof LogConfigSchema>
export type ProcessingConfig = z.infer<typeof ProcessingConfigSchema>
export type EpisodeConfig = z.infer<typeof EpisodeConfigSchema>
export type FeatureConfig = z.infer<typeof FeatureConfigSchema>
export type ApiConfig = z.infer<typeof ApiConfigSchema>

// ========================================
// Configuration Manager Class (設計書対応)
// ========================================

export class ConfigManager {
  private static instance: ConfigManager
  private config: Config | null = null
  private configCache = new Map<string, unknown>()
  private isLoading = false

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  // 設定の読み込み
  async loadConfig(configPath?: string): Promise<Config> {
    if (this.config) {
      return this.config
    }

    if (this.isLoading) {
      // 既に読み込み中の場合は、完了まで待機
      while (this.isLoading) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      if (this.config) {
        return this.config
      }
      throw new Error('Configuration loading failed during concurrent access')
    }

    this.isLoading = true

    try {
      // ベース設定を準備
      let baseConfig: Partial<Config> = {}

      // ファイルから設定を読み込み（存在する場合）
      if (configPath) {
        try {
          const configModule = await import(configPath)
          baseConfig = configModule.default || configModule
        } catch {
          console.warn(`Configuration file not found: ${configPath}`)
        }
      }

      // 環境変数オーバーライドを取得
      const envOverrides = this.getEnvOverrides()

      // 設定をマージ
      const mergedConfig = deepMerge(baseConfig as Record<string, unknown>, envOverrides)

      // バリデーション
      this.config = this.validateConfig(mergedConfig)

      return this.config
    } catch (error) {
      console.error('Failed to load configuration:', error)
      throw new Error(
        `Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    } finally {
      this.isLoading = false
    }
  }

  // 環境変数オーバーライドの取得
  private getEnvOverrides(): Record<string, unknown> {
    const env = process.env
    const overrides: Record<string, unknown> = {}

    // アプリケーション設定
    if (env.APP_NAME) {
      if (!overrides.app) overrides.app = {}
      ;(overrides.app as Record<string, unknown>).name = env.APP_NAME
    }
    if (env.APP_VERSION) {
      if (!overrides.app) overrides.app = {}
      ;(overrides.app as Record<string, unknown>).version = env.APP_VERSION
    }
    if (env.NODE_ENV) {
      if (!overrides.app) overrides.app = {}
      ;(overrides.app as Record<string, unknown>).environment = env.NODE_ENV
    }
    if (env.APP_URL) {
      if (!overrides.app) overrides.app = {}
      ;(overrides.app as Record<string, unknown>).baseUrl = env.APP_URL
    }
    if (env.PORT) {
      if (!overrides.app) overrides.app = {}
      ;(overrides.app as Record<string, unknown>).port = parseInt(env.PORT, 10)
    }
    if (env.DEBUG) {
      if (!overrides.app) overrides.app = {}
      ;(overrides.app as Record<string, unknown>).debug = env.DEBUG === 'true'
    }

    // AI設定
    if (env.AI_PROVIDER) {
      if (!overrides.ai) overrides.ai = {}
      ;(overrides.ai as Record<string, unknown>).provider = env.AI_PROVIDER
    }
    if (env.AI_FALLBACK_PROVIDER) {
      if (!overrides.ai) overrides.ai = {}
      ;(overrides.ai as Record<string, unknown>).fallbackProvider = env.AI_FALLBACK_PROVIDER
    }
    if (env.AI_MAX_CONCURRENT_REQUESTS) {
      if (!overrides.ai) overrides.ai = {}
      ;(overrides.ai as Record<string, unknown>).maxConcurrentRequests = parseInt(
        env.AI_MAX_CONCURRENT_REQUESTS,
        10,
      )
    }

    // OpenAI設定
    if (env.OPENAI_API_KEY) {
      if (!overrides.ai) overrides.ai = {}
      const aiConfig = overrides.ai as Record<string, unknown>
      if (!aiConfig.openai) aiConfig.openai = {}
      ;(aiConfig.openai as Record<string, unknown>).apiKey = env.OPENAI_API_KEY
    }
    if (env.OPENAI_MODEL) {
      if (!overrides.ai) overrides.ai = {}
      const aiConfig = overrides.ai as Record<string, unknown>
      if (!aiConfig.openai) aiConfig.openai = {}
      ;(aiConfig.openai as Record<string, unknown>).model = env.OPENAI_MODEL
    }
    if (env.OPENAI_MAX_TOKENS) {
      if (!overrides.ai) overrides.ai = {}
      const aiConfig = overrides.ai as Record<string, unknown>
      if (!aiConfig.openai) aiConfig.openai = {}
      ;(aiConfig.openai as Record<string, unknown>).maxTokens = parseInt(env.OPENAI_MAX_TOKENS, 10)
    }

    // Claude設定
    if (env.CLAUDE_API_KEY) {
      if (!overrides.ai) overrides.ai = {}
      const aiConfig = overrides.ai as Record<string, unknown>
      if (!aiConfig.claude) aiConfig.claude = {}
      ;(aiConfig.claude as Record<string, unknown>).apiKey = env.CLAUDE_API_KEY
    }
    if (env.CLAUDE_MODEL) {
      if (!overrides.ai) overrides.ai = {}
      const aiConfig = overrides.ai as Record<string, unknown>
      if (!aiConfig.claude) aiConfig.claude = {}
      ;(aiConfig.claude as Record<string, unknown>).model = env.CLAUDE_MODEL
    }

    // ストレージ設定
    if (env.STORAGE_TYPE) {
      if (!overrides.storage) overrides.storage = {}
      ;(overrides.storage as Record<string, unknown>).type = env.STORAGE_TYPE
    }
    if (env.STORAGE_LOCAL_BASE_DIR) {
      if (!overrides.storage) overrides.storage = {}
      const storageConfig = overrides.storage as Record<string, unknown>
      if (!storageConfig.local) storageConfig.local = {}
      ;(storageConfig.local as Record<string, unknown>).baseDir = env.STORAGE_LOCAL_BASE_DIR
    }
    if (env.CLOUDFLARE_ACCOUNT_ID) {
      if (!overrides.storage) overrides.storage = {}
      const storageConfig = overrides.storage as Record<string, unknown>
      if (!storageConfig.cloudflare) storageConfig.cloudflare = {}
      ;(storageConfig.cloudflare as Record<string, unknown>).accountId = env.CLOUDFLARE_ACCOUNT_ID
    }
    if (env.CLOUDFLARE_R2_BUCKET_NAME) {
      if (!overrides.storage) overrides.storage = {}
      const storageConfig = overrides.storage as Record<string, unknown>
      if (!storageConfig.cloudflare) storageConfig.cloudflare = {}
      ;(storageConfig.cloudflare as Record<string, unknown>).r2BucketName =
        env.CLOUDFLARE_R2_BUCKET_NAME
    }
    if (env.CLOUDFLARE_R2_ACCESS_KEY_ID) {
      if (!overrides.storage) overrides.storage = {}
      const storageConfig = overrides.storage as Record<string, unknown>
      if (!storageConfig.cloudflare) storageConfig.cloudflare = {}
      ;(storageConfig.cloudflare as Record<string, unknown>).r2AccessKeyId =
        env.CLOUDFLARE_R2_ACCESS_KEY_ID
    }
    if (env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
      if (!overrides.storage) overrides.storage = {}
      const storageConfig = overrides.storage as Record<string, unknown>
      if (!storageConfig.cloudflare) storageConfig.cloudflare = {}
      ;(storageConfig.cloudflare as Record<string, unknown>).r2SecretAccessKey =
        env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    }

    // データベース設定
    if (env.DATABASE_TYPE) {
      if (!overrides.database) overrides.database = {}
      ;(overrides.database as Record<string, unknown>).type = env.DATABASE_TYPE
    }
    if (env.DATABASE_SQLITE_PATH) {
      if (!overrides.database) overrides.database = {}
      const dbConfig = overrides.database as Record<string, unknown>
      if (!dbConfig.sqlite) dbConfig.sqlite = {}
      ;(dbConfig.sqlite as Record<string, unknown>).path = env.DATABASE_SQLITE_PATH
    }
    if (env.CLOUDFLARE_D1_DATABASE_ID) {
      if (!overrides.database) overrides.database = {}
      const dbConfig = overrides.database as Record<string, unknown>
      if (!dbConfig.d1) dbConfig.d1 = {}
      ;(dbConfig.d1 as Record<string, unknown>).databaseId = env.CLOUDFLARE_D1_DATABASE_ID
    }
    if (env.CLOUDFLARE_API_TOKEN) {
      if (!overrides.database) overrides.database = {}
      const dbConfig = overrides.database as Record<string, unknown>
      if (!dbConfig.d1) dbConfig.d1 = {}
      ;(dbConfig.d1 as Record<string, unknown>).token = env.CLOUDFLARE_API_TOKEN
    }

    // セキュリティ設定
    if (env.SECRET_KEY) {
      if (!overrides.security) overrides.security = {}
      ;(overrides.security as Record<string, unknown>).secretKey = env.SECRET_KEY
    }
    if (env.JWT_SECRET) {
      if (!overrides.security) overrides.security = {}
      const secConfig = overrides.security as Record<string, unknown>
      if (!secConfig.authentication) secConfig.authentication = {}
      ;(secConfig.authentication as Record<string, unknown>).jwtSecret = env.JWT_SECRET
    }
    if (env.CORS_ORIGIN) {
      if (!overrides.security) overrides.security = {}
      const secConfig = overrides.security as Record<string, unknown>
      if (!secConfig.cors) secConfig.cors = {}
      ;(secConfig.cors as Record<string, unknown>).origin = env.CORS_ORIGIN.includes(',')
        ? env.CORS_ORIGIN.split(',').map((o) => o.trim())
        : env.CORS_ORIGIN
    }

    // ログ設定
    if (env.LOG_LEVEL) {
      if (!overrides.logging) overrides.logging = {}
      ;(overrides.logging as Record<string, unknown>).level = env.LOG_LEVEL
    }
    if (env.LOG_FORMAT) {
      if (!overrides.logging) overrides.logging = {}
      ;(overrides.logging as Record<string, unknown>).format = env.LOG_FORMAT
    }

    // プロセッシング設定
    if (env.MAX_CONCURRENT_CHUNKS) {
      if (!overrides.processing) overrides.processing = {}
      ;(overrides.processing as Record<string, unknown>).maxConcurrentChunks = parseInt(
        env.MAX_CONCURRENT_CHUNKS,
        10,
      )
    }
    if (env.CHUNK_SIZE) {
      if (!overrides.processing) overrides.processing = {}
      ;(overrides.processing as Record<string, unknown>).chunkSize = parseInt(env.CHUNK_SIZE, 10)
    }
    if (env.OVERLAP_SIZE) {
      if (!overrides.processing) overrides.processing = {}
      ;(overrides.processing as Record<string, unknown>).overlapSize = parseInt(
        env.OVERLAP_SIZE,
        10,
      )
    }
    if (env.ENABLE_PARALLEL_PROCESSING !== undefined) {
      if (!overrides.processing) overrides.processing = {}
      ;(overrides.processing as Record<string, unknown>).enableParallelProcessing =
        env.ENABLE_PARALLEL_PROCESSING === 'true'
    }

    // エピソード設定
    if (env.TARGET_CHARS_PER_EPISODE) {
      if (!overrides.episode) overrides.episode = {}
      ;(overrides.episode as Record<string, unknown>).targetCharsPerEpisode = parseInt(
        env.TARGET_CHARS_PER_EPISODE,
        10,
      )
    }
    if (env.MIN_CHARS_PER_EPISODE) {
      if (!overrides.episode) overrides.episode = {}
      ;(overrides.episode as Record<string, unknown>).minCharsPerEpisode = parseInt(
        env.MIN_CHARS_PER_EPISODE,
        10,
      )
    }
    if (env.MAX_CHARS_PER_EPISODE) {
      if (!overrides.episode) overrides.episode = {}
      ;(overrides.episode as Record<string, unknown>).maxCharsPerEpisode = parseInt(
        env.MAX_CHARS_PER_EPISODE,
        10,
      )
    }
    if (env.CHARS_PER_PAGE) {
      if (!overrides.episode) overrides.episode = {}
      ;(overrides.episode as Record<string, unknown>).charsPerPage = parseInt(
        env.CHARS_PER_PAGE,
        10,
      )
    }

    // フィーチャー設定
    if (env.ENABLE_CACHING !== undefined) {
      if (!overrides.features) overrides.features = {}
      ;(overrides.features as Record<string, unknown>).enableCaching = env.ENABLE_CACHING === 'true'
    }
    if (env.ENABLE_TEXT_ANALYSIS !== undefined) {
      if (!overrides.features) overrides.features = {}
      ;(overrides.features as Record<string, unknown>).enableTextAnalysis =
        env.ENABLE_TEXT_ANALYSIS === 'true'
    }
    if (env.ENABLE_BATCH_PROCESSING !== undefined) {
      if (!overrides.features) overrides.features = {}
      ;(overrides.features as Record<string, unknown>).enableBatchProcessing =
        env.ENABLE_BATCH_PROCESSING === 'true'
    }

    // API設定
    if (env.API_TIMEOUT) {
      if (!overrides.api) overrides.api = {}
      const apiConfig = overrides.api as Record<string, unknown>
      if (!apiConfig.timeout) apiConfig.timeout = {}
      ;(apiConfig.timeout as Record<string, unknown>).default = parseInt(env.API_TIMEOUT, 10)
    }
    if (env.API_UPLOAD_TIMEOUT) {
      if (!overrides.api) overrides.api = {}
      const apiConfig = overrides.api as Record<string, unknown>
      if (!apiConfig.timeout) apiConfig.timeout = {}
      ;(apiConfig.timeout as Record<string, unknown>).upload = parseInt(env.API_UPLOAD_TIMEOUT, 10)
    }
    if (env.API_ANALYSIS_TIMEOUT) {
      if (!overrides.api) overrides.api = {}
      const apiConfig = overrides.api as Record<string, unknown>
      if (!apiConfig.timeout) apiConfig.timeout = {}
      ;(apiConfig.timeout as Record<string, unknown>).analysis = parseInt(
        env.API_ANALYSIS_TIMEOUT,
        10,
      )
    }

    return overrides
  }

  // 設定のバリデーション
  private validateConfig(config: unknown): Config {
    try {
      return ConfigSchema.parse(config)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')
        throw new Error(`Configuration validation failed: ${issues}`)
      }
      throw error
    }
  }

  // 設定取得（自動初期化対応）
  get<T = unknown>(path: string, defaultValue?: T): T {
    if (!this.config) {
      // 同期的に初期化を試行（環境変数のみ）
      try {
        const envOverrides = this.getEnvOverrides()
        this.config = this.validateConfig(envOverrides)
      } catch (error) {
        console.warn('Auto-initialization failed, using defaults:', error)
        // デフォルト設定でフォールバック
        this.config = this.validateConfig({})
      }
    }

    if (this.configCache.has(path)) {
      return this.configCache.get(path) as T
    }

    const keys = path.split('.')
    let value: unknown = this.config

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key]
      } else {
        value = defaultValue
        break
      }
    }

    this.configCache.set(path, value)
    return value as T
  }

  // 設定の存在確認
  has(path: string): boolean {
    try {
      const value = this.get(path)
      return value !== undefined
    } catch {
      return false
    }
  }

  // キャッシュクリア
  clearCache(): void {
    this.configCache.clear()
  }

  // 設定リロード
  async reloadConfig(configPath?: string): Promise<Config> {
    this.config = null
    this.clearCache()
    return this.loadConfig(configPath)
  }

  // 全設定取得（自動初期化対応）
  getAll(): Config {
    if (!this.config) {
      // 同期的に初期化を試行（環境変数のみ）
      try {
        const envOverrides = this.getEnvOverrides()
        this.config = this.validateConfig(envOverrides)
      } catch (error) {
        console.warn('Auto-initialization failed, using defaults:', error)
        // デフォルト設定でフォールバック
        this.config = this.validateConfig({})
      }
    }
    return this.config
  }

  // 環境別設定取得
  getEnvironmentConfig(): Config['app']['environment'] {
    return this.get('app.environment', 'development')
  }

  // 開発環境判定
  isDevelopment(): boolean {
    const env = this.getEnvironmentConfig()
    return env === 'development' || env === 'test'
  }

  // 本番環境判定
  isProduction(): boolean {
    return this.getEnvironmentConfig() === 'production'
  }

  // デバッグモード判定
  isDebugMode(): boolean {
    return this.get('app.debug', false)
  }
}

// ========================================
// Convenience Functions (設計書対応)
// ========================================

// シングルトンインスタンスの取得
export function getConfigManager(): ConfigManager {
  return ConfigManager.getInstance()
}

// 設定の初期化
export async function initializeConfig(configPath?: string): Promise<Config> {
  const manager = getConfigManager()
  return manager.loadConfig(configPath)
}

// 設定値の取得（新しいConfigManager用）
export function getConfigValue<T = unknown>(path: string, defaultValue?: T): T {
  const manager = getConfigManager()
  return manager.get(path, defaultValue)
}

// 環境変数の必須チェック
export function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`)
  }
  return value
}

// 環境変数の安全な取得
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue
}

// 環境変数の数値取得
export function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const value = process.env[key]
  if (!value) return defaultValue

  const parsed = parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`)
  }
  return parsed
}

// 環境変数のブール値取得
export function getEnvBoolean(key: string, defaultValue?: boolean): boolean | undefined {
  const value = process.env[key]
  if (!value) return defaultValue

  return value.toLowerCase() === 'true'
}

// JSON環境変数の取得
export function getEnvJson<T = unknown>(key: string, defaultValue?: T): T | undefined {
  const value = process.env[key]
  if (!value) return defaultValue

  try {
    return JSON.parse(value) as T
  } catch (error) {
    throw new Error(`Environment variable ${key} must be valid JSON: ${error}`)
  }
}

// ========================================
// Convenience Functions for ConfigManager
// ========================================

// シングルトンインスタンスを取得してConfigManagerを返す
export function getConfig(): ConfigManager {
  return getConfigManager()
}

// デフォルトエクスポート
export default ConfigManager
