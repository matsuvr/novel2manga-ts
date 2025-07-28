import { AppConfig } from './app.config'

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// 環境別の設定オーバーライド
export const envConfigs: Record<string, DeepPartial<AppConfig>> = {
  development: {
    llm: {
      defaultProvider: 'gemini',   // 開発環境では無料枠のGeminiを使用
      providers: {
        gemini: {
          model: 'gemini-2.0-flash-exp',
        },
      },
      textAnalysis: {
        provider: 'gemini',
        maxTokens: 4096,           // 開発環境では小さめに
      },
    },
    processing: {
      maxConcurrentChunks: 2,      // 開発環境では並列数を制限
      cache: {
        ttl: 60 * 60,              // 開発環境では短めのキャッシュ
      },
    },
    features: {
      enableCaching: false,        // 開発環境ではキャッシュ無効化
    },
  },
  
  production: {
    llm: {
      defaultProvider: 'groq',     // 本番環境では高速なGroqを使用
      providers: {
        groq: {
          model: 'qwen2.5-coder-32b-instruct',
        },
        openai: {
          model: 'gpt-4o',         // フォールバック用
        },
      },
      textAnalysis: {
        provider: 'groq',
      },
    },
    processing: {
      maxConcurrentChunks: 10,     // 本番環境では並列処理を増やす
      cache: {
        ttl: 7 * 24 * 60 * 60,     // 本番環境では長めのキャッシュ（7日）
      },
    },
  },
  
  test: {
    llm: {
      defaultProvider: 'gemini',   // テスト環境では安定したGeminiを使用
      providers: {
        gemini: {
          model: 'gemini-1.5-flash',
          maxTokens: 1000,         // テスト環境では最小限
        },
      },
    },
    api: {
      timeout: {
        default: 5000,             // テスト環境では短いタイムアウト
      },
    },
    processing: {
      maxConcurrentChunks: 1,      // テスト環境では直列処理
    },
    features: {
      enableCaching: false,
    },
  },
}