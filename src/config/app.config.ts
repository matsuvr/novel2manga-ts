export interface AppConfigType {
  chunking: {
    defaultChunkSize: number
    defaultOverlapSize: number
    maxChunkSize: number
    minChunkSize: number
    maxOverlapRatio: number
  }
  llm: {
    defaultProvider: 'openai' | 'gemini' | 'groq'
    providers: {
      openai: {
        apiKey: string | undefined
        model: string
        maxTokens: number
        frequencyPenalty: number
        presencePenalty: number
        timeout: number
      }
      gemini: {
        apiKey: string | undefined
        model: string
        maxTokens: number
        timeout: number
      }
      groq: {
        apiKey: string | undefined
        model: string
        maxTokens: number
        timeout: number
      }
    }
    textAnalysis: {
      provider: 'default' | 'openai' | 'gemini' | 'groq'
      maxTokens: number
      modelOverrides: {
        openai: string
        gemini: string
        groq: string
      }
      systemPrompt: string
      userPromptTemplate: string
    }
    layoutGeneration: {
      provider: 'default' | 'openai' | 'gemini' | 'groq'
      maxTokens: number
      modelOverrides: {
        openai: string
        gemini: string
        groq: string
      }
      systemPrompt: string
    }
  }
  storage: {
    local: {
      basePath: string
      novelsDir: string
      chunksDir: string
      analysisDir: string
    }
    r2: {
      novelsBucket: string
      chunksBucket: string
      analysisBucket: string
    }
  }
  api: {
    rateLimit: {
      textAnalysis: {
        requests: number
        window: number
      }
      imageGeneration: {
        requests: number
        window: number
      }
    }
    timeout: {
      default: number
      textAnalysis: number
      imageGeneration: number
    }
    maxPayloadSize: {
      text: number
      image: number
    }
  }
  processing: {
    maxConcurrentChunks: number
    retry: {
      maxAttempts: number
      initialDelay: number
      maxDelay: number
      backoffFactor: number
    }
    cache: {
      ttl: number
      analysisCache: boolean
      layoutCache: boolean
    }
  }
  features: {
    enableTextAnalysis: boolean
    enableLayoutGeneration: boolean
    enableImageGeneration: boolean
    enableAutoSave: boolean
    enableCaching: boolean
  }
}

export const appConfig: AppConfigType = {
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
    defaultProvider: 'gemini' as 'openai' | 'gemini' | 'groq',

    // プロバイダー別設定
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
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
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
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
      userPromptTemplate: `以下の小説テキストを分析して、5つの要素（キャラクター、場面、対話、ハイライト、状況）を抽出してください。

      解析するのは以下のチャンク番号のテキストです。文脈を考慮するために、前後のチャンクも付けます。
解析対象チャンク番号: {{chunkIndex}}

前のチャンク:
{{previousChunkText}}
===========
**解析対象チャンク:**
{{chunkText}}
===========
次のチャンク:
{{nextChunkText}}`,
    },

    // レイアウト生成用設定
    layoutGeneration: {
      provider: 'default', // 'default'の場合はdefaultProviderを使用
      maxTokens: 8192,
      // プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
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
        requests: 100, // リクエスト数
        window: 60 * 1000, // ウィンドウ（ミリ秒）
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
      imageGeneration: 120000, // 画像生成タイムアウト
    },

    // ペイロード制限
    maxPayloadSize: {
      text: 1024 * 1024, // 1MB
      image: 5 * 1024 * 1024, // 5MB
    },
  },

  // 処理設定
  processing: {
    // 並列処理数
    maxConcurrentChunks: 5, // 同時処理可能なチャンク数

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
      layoutCache: true, // レイアウトのキャッシュ有効化
    },
  },

  // フィーチャーフラグ
  features: {
    enableTextAnalysis: true,
    enableLayoutGeneration: true,
    enableImageGeneration: false, // 将来的な機能
    enableAutoSave: true,
    enableCaching: true,
  },
}

export type AppConfig = AppConfigType
