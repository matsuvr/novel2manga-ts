export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 5000, // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 500, // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 10000, // 最大チャンクサイズ
    minChunkSize: 100, // 最小チャンクサイズ
    maxOverlapRatio: 0.5, // チャンクサイズに対する最大オーバーラップ比率
  },

  // LLM設定
  llm: {
    // デフォルトプロバイダー
    defaultProvider: 'claude' as 'openai' | 'gemini' | 'groq' | 'claude' | 'openrouter',

    // プロバイダー別設定
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        timeout: 30000,
      },
      claude: {
        apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8192,
        timeout: 30000,
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: 'gemini-2.5-flash',
        maxTokens: 8192,
        timeout: 30000,
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY,
        model: 'compound-beta',
        maxTokens: 4096,
        timeout: 30000,
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: 'openrouter/horizon-alpha',
        baseUrl: 'https://openrouter.ai/api/v1',
        maxTokens: 8192,
        timeout: 30000,
      },
    },

    // テキスト分析用設定
    textAnalysis: {
      provider: 'default', // 'default'の場合はdefaultProviderを使用
      maxTokens: 8192,
      // プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o',
        claude: 'claude-sonnet-4-20250514',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
        openrouter: 'openrouter/horizon-alpha',
      },
      systemPrompt: `あなたは小説テキストを分析し、マンガ制作に必要な5要素（登場人物、シーン、対話、ハイライト、状況）を抽出する専門家です。

以下の形式でJSON出力してください：
{
  "characters": [{"name": "名前", "description": "説明", "firstAppearance": 位置}],
  "scenes": [{"location": "場所", "time": "時間", "description": "説明", "startIndex": 開始位置, "endIndex": 終了位置}],
  "dialogues": [{"speakerId": "話者ID", "text": "セリフ", "emotion": "感情", "index": 位置}],
  "highlights": [{"type": "種類", "description": "説明", "importance": 重要度, "startIndex": 開始位置, "endIndex": 終了位置}],
  "situations": [{"description": "状況説明", "index": 位置}]
}`,
    },

    // 物語弧分析用設定
    narrativeArcAnalysis: {
      provider: 'default', // 'default'の場合はdefaultProviderを使用
      maxTokens: 4096,
      // プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o',
        claude: 'claude-sonnet-4-20250514',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
        openrouter: 'openrouter/horizon-alpha',
      },
      systemPrompt: `あなたは物語の構造を分析し、エピソードの境界を特定する専門家です。

入力された物語のセグメントを分析し、以下の点を考慮してエピソードの境界を決定してください：
1. 場面の転換（時間・場所の変化）
2. 視点の変化
3. 話題や展開の大きな変化
4. 緊張の高まりと解決
5. キャラクターの心理状態の変化

結果を以下のJSON形式で出力してください：
{
  "episodes": [
    {
      "id": "エピソード番号",
      "title": "エピソードタイトル",
      "summary": "エピソード概要",
      "startChunkIndex": 開始チャンク番号,
      "endChunkIndex": 終了チャンク番号,
      "keyEvents": ["重要な出来事1", "重要な出来事2"],
      "characters": ["登場人物1", "登場人物2"],
      "mood": "雰囲気・トーン",
      "significance": "重要度(1-10)",
      "boundaryConfidence": "境界の信頼度(0.0-1.0)"
    }
  ],
  "overallArc": {
    "theme": "全体のテーマ",
    "progression": "物語の進行パターン",
    "climaxLocation": "クライマックスの位置"
  }
}`,
      userPromptTemplate: `【分析対象】
テキスト全体の文字数: {{totalChars}}文字
目標ページ数: {{targetPages}}ページ
最小ページ数: {{minPages}}ページ
最大ページ数: {{maxPages}}ページ

【登場人物】
{{characterList}}

【全体要約】
{{overallSummary}}

【重要なハイライト】
{{highlightsInfo}}

【キャラクターの行動・発言】
{{characterActions}}

【分析テキスト】
{{fullText}}

上記のテキストを分析し、漫画のエピソードとして適切な境界を見つけてください。
各エピソードは物語的に意味のある単位で、読者が満足できる区切りになるようにしてください。`,
    },

    // レイアウト生成用設定
    layoutGeneration: {
      provider: 'default', // 'default'の場合はdefaultProviderを使用
      maxTokens: 4096,
      // プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o-mini',
        claude: 'claude-sonnet-4-20250514',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
        openrouter: 'openrouter/horizon-alpha',
      },
      systemPrompt: `あなたはマンガのコマ割りレイアウトを設計する専門家です。
日本式マンガのレイアウト（右から左、上から下の読み順）でYAML形式のレイアウトを生成してください。
重要なシーンは大きなコマで、通常の会話は小さなコマで表現してください。`,
    },
  },

  // ストレージ設定
  storage: {
    // ローカルストレージ（開発環境）
    local: {
      basePath: '.local-storage',
      novelsDir: 'novels',
      chunksDir: 'chunks',
      analysisDir: 'analysis',
      layoutsDir: 'layouts',
      jobsDir: 'jobs',
    },

    // R2設定（本番環境）
    r2: {
      novelsBucket: 'NOVEL_STORAGE',
      chunksBucket: 'CHUNKS_STORAGE',
      analysisBucket: 'ANALYSIS_STORAGE',
      layoutsBucket: 'LAYOUTS_STORAGE',
      jobsBucket: 'JOBS_STORAGE',
    },
  },

  // API設定
  api: {
    // レート制限
    rateLimit: {
      textAnalysis: {
        requests: 100, // リクエスト数
        window: 60 * 1000, // ウィンドウ（ミリ秒）
      },
      narrativeAnalysis: {
        requests: 50,
        window: 60 * 1000,
      },
      layoutGeneration: {
        requests: 30,
        window: 60 * 1000,
      },
      imageGeneration: {
        requests: 50,
        window: 60 * 1000,
      },
    },

    // タイムアウト設定
    timeout: {
      default: 30000, // デフォルトタイムアウト（ミリ秒）
      textAnalysis: 60000, // テキスト分析タイムアウト
      narrativeAnalysis: 90000, // 物語弧分析タイムアウト
      layoutGeneration: 45000, // レイアウト生成タイムアウト
      imageGeneration: 120000, // 画像生成タイムアウト
    },

    // ペイロード制限
    maxPayloadSize: {
      text: 1024 * 1024, // 1MB
      image: 5 * 1024 * 1024, // 5MB
      json: 512 * 1024, // 512KB
    },
  },

  // 処理設定
  processing: {
    // 並列処理数
    maxConcurrentChunks: 5, // 同時処理可能なチャンク数
    maxConcurrentJobs: 3, // 同時処理可能なジョブ数

    // バッチ処理設定
    batchSize: {
      chunks: 10, // チャンク処理のバッチサイズ
      analysis: 5, // 分析処理のバッチサイズ
    },

    // リトライ設定
    retry: {
      maxAttempts: 3,
      initialDelay: 1000, // 初期遅延（ミリ秒）
      maxDelay: 10000, // 最大遅延（ミリ秒）
      backoffFactor: 2, // バックオフ係数
    },

    // キャッシュ設定
    cache: {
      ttl: 24 * 60 * 60, // キャッシュ有効期限（秒）
      analysisCache: true, // 分析結果のキャッシュ有効化
      narrativeCache: true, // 物語弧分析のキャッシュ有効化
      layoutCache: true, // レイアウトのキャッシュ有効化
    },

    // エピソード処理設定
    episode: {
      targetCharsPerEpisode: 8000, // エピソードあたりの目標文字数
      minCharsPerEpisode: 6000, // 最小文字数
      maxCharsPerEpisode: 12000, // 最大文字数
      charsPerPage: 400, // ページあたりの文字数
      maxPagesPerEpisode: 30, // エピソードあたりの最大ページ数
      minPagesPerEpisode: 15, // エピソードあたりの最小ページ数
    },
  },

  // フィーチャーフラグ
  features: {
    enableTextAnalysis: true,
    enableNarrativeAnalysis: true,
    enableLayoutGeneration: true,
    enableImageGeneration: false, // 将来的な機能
    enableAutoSave: true,
    enableCaching: true,
    enableParallelProcessing: true,
    enableProgressTracking: true,
  },

  // ログ設定
  logging: {
    level: 'info' as 'error' | 'warn' | 'info' | 'debug',
    enableFileLogging: true,
    enableConsoleLogging: true,
    logDir: 'logs',
    rotateDaily: true,
    maxLogFiles: 7, // 最大ログファイル数
  },

  // 開発・デバッグ設定
  development: {
    enableVerboseLogging: false,
    enablePerformanceMetrics: true,
    enableErrorDetails: true,
    mockExternalAPIs: false, // 外部API呼び出しをモック化
    enableTestMode: false, // テストモード
  },
} as const

export type AppConfig = typeof appConfig

// 環境変数オーバーライド機能
export function getAppConfigWithOverrides(): AppConfig {
  // ディープコピーを作成して設定をオーバーライド
  const config: any = JSON.parse(JSON.stringify(appConfig))

  // 環境変数による設定オーバーライド
  if (process.env.APP_LLM_DEFAULT_PROVIDER) {
    config.llm.defaultProvider = process.env.APP_LLM_DEFAULT_PROVIDER
  }

  if (process.env.APP_CHUNKS_DEFAULT_SIZE) {
    config.chunking.defaultChunkSize = parseInt(process.env.APP_CHUNKS_DEFAULT_SIZE, 10)
  }

  if (process.env.APP_CHUNKS_DEFAULT_OVERLAP) {
    config.chunking.defaultOverlapSize = parseInt(process.env.APP_CHUNKS_DEFAULT_OVERLAP, 10)
  }

  if (process.env.APP_PROCESSING_MAX_CONCURRENT) {
    config.processing.maxConcurrentChunks = parseInt(process.env.APP_PROCESSING_MAX_CONCURRENT, 10)
  }

  if (process.env.APP_ENABLE_CACHING !== undefined) {
    config.features.enableCaching = process.env.APP_ENABLE_CACHING === 'true'
  }

  if (process.env.APP_LOG_LEVEL) {
    config.logging.level = process.env.APP_LOG_LEVEL
  }

  if (process.env.NODE_ENV === 'development') {
    config.development.enableVerboseLogging = true
    config.development.enableErrorDetails = true
  }

  return config as AppConfig
}
