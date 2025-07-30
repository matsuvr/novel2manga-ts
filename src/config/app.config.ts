export interface AppConfigType {
  chunking: {
    defaultChunkSize: number
    defaultOverlapSize: number
    maxChunkSize: number
    minChunkSize: number
    maxOverlapRatio: number
  }
  episode: {
    targetCharsPerEpisode: number
    minCharsPerEpisode: number
    maxCharsPerEpisode: number
    charsPerPage: number
    minPagesPerEpisode: number
    maxPagesPerEpisode: number
    narrativeAnalysis: {
      provider: 'default' | 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter'
      modelOverrides: {
        openai: string
        gemini: string
        groq: string
        local: string
        openrouter: string
      }
      systemPrompt: string
      userPromptTemplate: string
    }
  }
  llm: {
    defaultProvider: 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter'
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
      local: {
        baseURL: string
        model: string
        maxTokens: number
        timeout: number
      }
      openrouter: {
        apiKey: string | undefined
        model: string
        maxTokens: number
        timeout: number
      }
    }
    textAnalysis: {
      provider: 'default' | 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter'
      maxTokens: number
      modelOverrides: {
        openai: string
        gemini: string
        groq: string
        local: string
        openrouter: string
      }
      systemPrompt: string
      userPromptTemplate: string
    }
    layoutGeneration: {
      provider: 'default' | 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter'
      maxTokens: number
      modelOverrides: {
        openai: string
        gemini: string
        groq: string
        local: string
        openrouter: string
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
  // ========================================
  // チャンク分割設定
  // ========================================
  chunking: {
    // 【ここを設定】デフォルトチャンクサイズ（文字数）
    // 推奨: 3000-8000文字。短すぎると文脈が失われ、長すぎるとLLMの処理が重くなる
    defaultChunkSize: 5000,

    // 【ここを設定】デフォルトオーバーラップサイズ（文字数）
    // 推奨: チャンクサイズの10-20%。文脈の連続性を保つために重要
    defaultOverlapSize: 500,

    // 最大・最小チャンクサイズ（バリデーション用）
    maxChunkSize: 10000,
    minChunkSize: 100,

    // チャンクサイズに対する最大オーバーラップ比率
    maxOverlapRatio: 0.5,
  },

  // ========================================
  // LLM設定
  // ========================================
  llm: {
    // 【ここを設定】デフォルトで使用するLLMプロバイダー
    // 選択肢: 'openai', 'gemini', 'groq', 'local', 'openrouter'
    defaultProvider: 'gemini' as 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter',

    // ========================================
    // プロバイダー別設定
    // ========================================
    providers: {
      // OpenAI設定
      openai: {
        apiKey: process.env.OPENAI_API_KEY, // .envファイルで設定

        // 【ここを設定】使用するモデル
        // 選択肢: 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'など
        model: 'gpt-4o-mini',

        // 【ここを設定】最大トークン数
        maxTokens: 4096,

        // 詳細パラメータ（必要に応じて調整）
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        timeout: 30000,
      },

      // Google Gemini設定
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, // .envファイルで設定

        // 【ここを設定】使用するモデル
        // 選択肢: 'gemini-2.5-flash', 'gemini-1.5-pro'など
        model: 'gemini-2.5-flash',

        maxTokens: 8192,
        timeout: 30000,
      },

      // Groq設定
      groq: {
        apiKey: process.env.GROQ_API_KEY, // .envファイルで設定

        // 【ここを設定】使用するモデル
        // 選択肢: 'compound-beta', 'mixtral-8x7b-32768'など
        model: 'compound-beta',

        maxTokens: 8192,
        timeout: 30000,
      },

      // ローカルLLM設定（LM Studio, Ollama等）
      local: {
        // 【ここを設定】ローカルLLMのエンドポイント
        // LM Studio: 'http://localhost:1234/v1/'
        // Ollama: 'http://localhost:11434/v1/'
        baseURL: 'http://localhost:11434/v1/',

        // 【ここを設定】使用するモデル名
        // LM Studioの場合: ロードしたモデルのID
        // Ollamaの場合: 'llama2', 'mistral'など
        model: 'goekdenizguelmez/JOSIEFIED-Qwen3:14b',

        // 【ここを設定】最大トークン数（モデルに応じて調整）
        maxTokens: 8192,

        // ローカルLLMは応答が遅い場合があるため、タイムアウトを長めに設定
        timeout: 60000,
      },

      // OpenRouter設定（様々なモデルにアクセス可能）
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY, // .envファイルで設定

        // 【ここを設定】使用するモデル
        // 安価なモデル例:
        // - 'google/gemini-flash-1.5-8b' (無料)
        // - 'google/gemini-flash-1.5' ($0.075/M tokens)
        // - 'anthropic/claude-3-haiku' ($0.25/M tokens)
        // - 'meta-llama/llama-3.1-8b-instruct:free' (無料)
        model: 'qwen/qwen3-235b-a22b-2507:cerebras',

        // 【ここを設定】最大トークン数
        maxTokens: 8192,

        timeout: 30000,
      },
    },

    // ========================================
    // テキスト分析用設定
    // ========================================
    textAnalysis: {
      // 【ここを設定】テキスト分析に使用するプロバイダー
      // 'default'の場合は上記のdefaultProviderを使用
      provider: 'default',

      // 【ここを設定】最大トークン数
      maxTokens: 8192,

      // 【ここを設定】プロバイダー別のモデルオーバーライド
      // 特定のタスクに特定のモデルを使いたい場合に設定
      modelOverrides: {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
        local: 'goekdenizguelmez/JOSIEFIED-Qwen3:14b',
        openrouter: 'qwen/qwen3-235b-a22b-2507:cerebras',
      },

      // 【ここを設定】システムプロンプト
      // LLMに期待する役割と出力形式を定義
      systemPrompt: `あなたは小説テキストを分析し、マンガ制作に必要な要素を抽出する専門家です。

分析のポイント：
1. チャンク全体の要約を100-200文字で作成
2. 重要なハイライトの重要度は1-10で評価
3. ハイライトには該当テキストの抜粋も含める
4. 前後のチャンクを考慮して文脈を理解

以下の形式でJSON出力してください：
{
  "summary": "このチャンクの要約",
  "characters": [{"name": "名前", "description": "説明", "firstAppearance": 位置}],
  "scenes": [{"location": "場所", "time": "時間", "description": "説明", "startIndex": 開始位置, "endIndex": 終了位置}],
  "dialogues": [{"speakerId": "話者ID", "text": "セリフ", "emotion": "感情", "index": 位置}],
  "highlights": [{"type": "種類", "description": "説明", "importance": 重要度(1-10), "startIndex": 開始位置, "endIndex": 終了位置, "text": "抜粋"}],
  "situations": [{"description": "状況説明", "index": 位置}]
}`,

      // 【ここを設定】ユーザープロンプトテンプレート
      // {{}}で囲まれた部分は動的に置換される
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

    // ========================================
    // レイアウト生成用設定
    // ========================================
    layoutGeneration: {
      // 【ここを設定】レイアウト生成に使用するプロバイダー
      provider: 'default',

      maxTokens: 8192,

      // 【ここを設定】プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
        local: 'goekdenizguelmez/JOSIEFIED-Qwen3:14b',
        openrouter: 'qwen/qwen3-235b-a22b-2507:cerebras',
      },

      // 【ここを設定】システムプロンプト
      systemPrompt: `あなたはマンガのコマ割りレイアウトを設計する専門家です。
日本式マンガのレイアウト（右から左、上から下の読み順）でYAML形式のレイアウトを生成してください。
重要なシーンは大きなコマで、通常の会話は小さなコマで表現してください。`,
    },
  },

  // ========================================
  // エピソード分割設定
  // ========================================
  episode: {
    // 【ここを設定】1エピソードの目標文字数
    // 推奨: 20000文字（連載マンガ1話分の目安）
    targetCharsPerEpisode: 20000,

    // 【ここを設定】1エピソードの最小文字数
    // 推奨: 15000文字（短すぎると物語が途切れる）
    minCharsPerEpisode: 15000,

    // 【ここを設定】1エピソードの最大文字数
    // 推奨: 25000文字（長すぎると読者が疲れる）
    maxCharsPerEpisode: 25000,

    // 【ここを設定】1ページあたりの文字数
    // 推奨: 200文字（マンガ1ページの目安）
    charsPerPage: 200,

    // 【ここを設定】1エピソードの最小ページ数
    // 推奨: 20ページ
    minPagesPerEpisode: 20,

    // 【ここを設定】1エピソードの最大ページ数
    // 推奨: 50ページ
    maxPagesPerEpisode: 50,

    // ナラティブアーク分析設定
    narrativeAnalysis: {
      // 【ここを設定】ナラティブ分析に使用するプロバイダー
      provider: 'default',

      // 【ここを設定】プロバイダー別のモデルオーバーライド
      modelOverrides: {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.5-flash',
        groq: 'compound-beta',
        local: 'goekdenizguelmez/JOSIEFIED-Qwen3:14b',
        openrouter: 'qwen/qwen3-235b-a22b-2507:cerebras',
      },

      // 【ここを設定】システムプロンプト
      systemPrompt: `あなたは経験豊富な漫画編集者です。小説を漫画化する際、読者が満足できるエピソード分割を行うことが仕事です。

以下の観点で分析してください：

1. エピソードの構成要件
   - 各エピソードは指定されたページ数に収める必要があります
   - 少なくとも1つ以上の見所（重要度6以上）を含むこと
   - 主要人物の意味のある行動や発言を含むこと

2. 物語の流れ
   - 起承転結を意識した自然な区切りとなること
   - 読者に「続きが読みたい」と思わせる引きを作ること
   - 各エピソードで一定の満足感を提供すること

3. 漫画化の観点
   - 視覚的に映えるシーンを効果的に配置すること
   - 対話と描写のバランスを考慮すること
   - ページ数と内容の密度が適切であること

重要：テキストは一つの連続した物語として提供されます。切れ目の位置は全文の先頭からの文字数で指定してください。

分析結果は構造化された形式で提供してください。`,

      // 【ここを設定】ユーザープロンプトテンプレート
      userPromptTemplate: `以下の小説テキストを分析し、連載マンガのエピソードとして適切な切れ目を見つけてください。

【分析対象】
- 総文字数: {{totalChars}}文字
- 目標: {{targetPages}}ページ（許容範囲: {{minPages}}〜{{maxPages}}ページ）

【登場人物】
{{characterList}}

【物語の概要】
{{overallSummary}}

【見所シーン（重要度6以上）】
{{highlightsInfo}}

【重要な会話】
{{characterActions}}

【全文テキスト】
{{fullText}}

【注意事項】
- テキストは一つの連続した物語です。機械的な分割ではなく、物語の流れを考慮してください。
- エピソードの切れ目は、物語の自然な区切り（シーン転換、時間経過、章の変わり目など）を優先してください。
- 各エピソードには少なくとも1つの見所シーンを含むようにしてください。
- 切れ目の位置は、全文テキストの先頭からの文字数で指定してください。

以下の形式で、エピソードの切れ目を提案してください：

各エピソードについて：
1. startPosition: エピソード開始位置（全文テキストの先頭からの文字数）
2. endPosition: エピソード終了位置（全文テキストの先頭からの文字数）
3. episodeNumber: エピソード番号（1から連番）
4. title: エピソードのタイトル案
5. summary: エピソードの内容要約
6. estimatedPages: 推定ページ数
7. confidence: 提案の自信度（0.0〜1.0）
8. reasoning: なぜそこが適切な区切りなのかの説明

また、全体分析（overallAnalysis）として：
- 提案したエピソード分割の全体的な考察
- 各エピソード間のバランス
- 読者の満足度を保つための工夫

必要に応じて、改善提案（suggestions）も含めてください。`,
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

  // ========================================
  // 処理設定
  // ========================================
  processing: {
    // 【ここを設定】同時処理可能なチャンク数
    // 推奨: 3-10。LLMの性能とレート制限に応じて調整
    maxConcurrentChunks: 5,

    // リトライ設定
    retry: {
      // 【ここを設定】最大リトライ回数
      maxAttempts: 3,

      // 初期遅延（ミリ秒）
      initialDelay: 1000,

      // 最大遅延（ミリ秒）
      maxDelay: 10000,

      // バックオフ係数（次のリトライまでの待機時間を計算）
      backoffFactor: 2,
    },

    // キャッシュ設定
    cache: {
      // 【ここを設定】キャッシュ有効期限（秒）
      // 推奨: 1日〜1週間（86400〜604800秒）
      ttl: 24 * 60 * 60, // 24時間

      // 【ここを設定】分析結果のキャッシュを有効化
      analysisCache: true,

      // 【ここを設定】レイアウトのキャッシュを有効化
      layoutCache: true,
    },
  },

  // ========================================
  // フィーチャーフラグ
  // ========================================
  features: {
    // 【ここを設定】各機能の有効/無効
    enableTextAnalysis: true, // テキスト分析機能
    enableLayoutGeneration: true, // レイアウト生成機能
    enableImageGeneration: false, // 画像生成機能（将来実装予定）
    enableAutoSave: true, // 自動保存機能
    enableCaching: true, // キャッシュ機能
  },
}

export type AppConfig = AppConfigType
