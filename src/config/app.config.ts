export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 5000,        // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 500,       // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 10000,          // 最大チャンクサイズ
    minChunkSize: 100,            // 最小チャンクサイズ
    maxOverlapRatio: 0.5,         // チャンクサイズに対する最大オーバーラップ比率
  },
  
  // LLM設定
  llm: {
    // デフォルトプロバイダー
    defaultProvider: 'gemini' as 'openai' | 'gemini' | 'groq',
    
    // プロバイダー別設定
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4096,
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        timeout: 30000,
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: 'gemini-2.0-flash-exp',
        temperature: 0.7,
        maxTokens: 8192,
        topP: 0.95,
        topK: 40,
        timeout: 30000,
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY,
        model: 'qwen2.5-coder-32b-instruct',
        temperature: 0.7,
        maxTokens: 4096,
        topP: 0.9,
        timeout: 30000,
      },
    },
    
    // テキスト分析用設定
    textAnalysis: {
      provider: 'default',        // 'default'の場合はdefaultProviderを使用
      temperature: 0.3,           // より決定的な分析のため低めに設定
      maxTokens: 8192,
      // プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o',
        gemini: 'gemini-2.0-flash-exp',
        groq: 'qwen2.5-coder-32b-instruct',
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
    
    // レイアウト生成用設定
    layoutGeneration: {
      provider: 'default',        // 'default'の場合はdefaultProviderを使用
      temperature: 0.8,           // よりクリエイティブなレイアウトのため高めに設定
      maxTokens: 4096,
      // プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.0-flash-exp',
        groq: 'llama-3.3-70b-versatile',
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
    },
    
    // R2設定（本番環境）
    r2: {
      novelsBucket: 'NOVEL_STORAGE',
      chunksBucket: 'CHUNKS_STORAGE',
      analysisBucket: 'ANALYSIS_STORAGE',
    },
  },
  
  // API設定
  api: {
    // レート制限
    rateLimit: {
      textAnalysis: {
        requests: 100,            // リクエスト数
        window: 60 * 1000,        // ウィンドウ（ミリ秒）
      },
      imageGeneration: {
        requests: 50,
        window: 60 * 1000,
      },
    },
    
    // タイムアウト設定
    timeout: {
      default: 30000,             // デフォルトタイムアウト（ミリ秒）
      textAnalysis: 60000,        // テキスト分析タイムアウト
      imageGeneration: 120000,    // 画像生成タイムアウト
    },
    
    // ペイロード制限
    maxPayloadSize: {
      text: 1024 * 1024,          // 1MB
      image: 5 * 1024 * 1024,     // 5MB
    },
  },
  
  // 処理設定
  processing: {
    // 並列処理数
    maxConcurrentChunks: 5,       // 同時処理可能なチャンク数
    
    // リトライ設定
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,         // 初期遅延（ミリ秒）
      maxDelay: 10000,            // 最大遅延（ミリ秒）
      backoffFactor: 2,           // バックオフ係数
    },
    
    // キャッシュ設定
    cache: {
      ttl: 24 * 60 * 60,          // キャッシュ有効期限（秒）
      analysisCache: true,        // 分析結果のキャッシュ有効化
      layoutCache: true,          // レイアウトのキャッシュ有効化
    },
  },
  
  // フィーチャーフラグ
  features: {
    enableTextAnalysis: true,
    enableLayoutGeneration: true,
    enableImageGeneration: false,  // 将来的な機能
    enableAutoSave: true,
    enableCaching: true,
  },
} as const

export type AppConfig = typeof appConfig