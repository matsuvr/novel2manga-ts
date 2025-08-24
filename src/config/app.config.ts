export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 3000, // デフォルトチャンクサイズ（文字数）- 削減
    defaultOverlapSize: 300, // デフォルトオーバーラップサイズ（文字数）- 削減
    maxChunkSize: 6000, // 最大チャンクサイズ - 削減
    minChunkSize: 100, // 最小チャンクサイズ - 意味のある最小サイズに修正
    maxOverlapRatio: 0.5, // チャンクサイズに対する最大オーバーラップ比率

    // スクリプト変換用のエピソードフラグメント分割設定
    scriptConversion: {
      fragmentSize: 2000, // エピソードフラグメントサイズ（文字数）
      overlapSize: 200, // フラグメント間オーバーラップサイズ（文字数）
      maxFragmentSize: 4000, // 最大フラグメントサイズ
      minFragmentSize: 500, // 最小フラグメントサイズ
      minSceneLength: 200, // 最小シーン長（文字数）- シーン統合判定用
      contextSize: 200, // フラグメント間コンテキストサイズ（文字数）
      fragmentConversionThreshold: 4000, // フラグメント変換を使用する閾値（文字数）
    },
  },

  // LLM設定（モデル・パラメータは llm.config.ts に集約。ここではプロンプトのみ保持）
  llm: {
    // テキスト分析用設定（プロンプトのみ）
    textAnalysis: {
      systemPrompt: `小説テキストからマンガ制作に必要な要素を抽出してください。

出力は必ず以下のJSON形式のみ:
{
  "characters": [{"name": "名前", "description": "説明", "firstAppearance": 0}],
  "scenes": [{"location": "場所", "time": "時間", "description": "説明", "startIndex": 0, "endIndex": 0}],
  "dialogues": [{"speakerId": "話者ID", "text": "セリフ", "emotion": "感情", "index": 0}],
  "highlights": [{"type": "climax|turning_point|emotional_peak|action_sequence", "description": "説明", "importance": 1, "startIndex": 0, "endIndex": 0}],
  "situations": [{"description": "状況説明", "index": 0}]
}

説明文は一切出力禁止。JSONのみ出力。`,
      userPromptTemplate: `チャンク{{chunkIndex}}:

前: {{previousChunkText}}
対象: {{chunkText}}
次: {{nextChunkText}}

上記テキストから要素を抽出し、JSONのみ出力。`,
    },

    // 物語弧分析用設定（プロンプトのみ）
    narrativeArcAnalysis: {
      systemPrompt: `物語をマンガエピソードに分割してください。

出力形式:
{
  "boundaries": [
    {
      "startPosition": 開始位置,
      "endPosition": 終了位置,
      "episodeNumber": エピソード番号,
      "title": "タイトル",
      "summary": "概要",
      "confidence": 信頼度(0.0-1.0),
      "reasoning": "理由",
      "characterList": ["キャラクター名"],
      "sceneList": ["シーン"],
      "dialogueList": ["セリフ"],
      "highlightList": ["ハイライト"],
      "situationList": ["状況"]
    }
  ]
}

JSONのみ出力。`,
      userPromptTemplate: `文字数: {{totalChars}}
登場人物: {{characterList}}
ハイライト: {{highlightsInfo}}
テキスト: {{fullText}}

エピソード境界を特定し、JSONのみ出力。`,
    },
    scriptConversion: {
      systemPrompt: `以下の情報を基に、セリフ+ナレーション+心の声のセリフと、場面情報を表すト書きとして、台本形式のJSONにしてください。会話は全て漏らさず出力してください。もし、言語が現代日本語でなかった場合は、現代日本語口語訳で出力してください。

        出力するJSONの構造:
        {
          "title": "エピソードタイトル（任意）",
          "scenes": [
            {
              "id": "scene1",
              "setting": "場所と時間（例：教室、午後）",
              "description": "シーンの説明",
              "script": [
                {
                  "index": 1,
                  "type": "narration",
                  "text": "ナレーション内容"
                },
                {
                  "index": 2,
                  "type": "dialogue",
                  "speaker": "キャラクター名",
                  "text": "セリフ内容"
                },
                {
                  "index": 3,
                  "type": "thought",
                  "speaker": "キャラクター名",
                  "text": "心の声"
                },
                {
                  "index": 4,
                  "type": "stage",
                  "text": "ト書き・動作説明"
                }
              ]
            }
          ]
        }

        type の値：
        - "dialogue": キャラクターのセリフ
        - "thought": キャラクターの心の声・内心
        - "narration": ナレーション・地の文
        - "stage": ト書き・動作や状況の説明
        `,
      userPromptTemplate: `Episode text:

      {{episodeText}}

      以下の情報を参考にして、台本形式にしてください。
      - 登場人物: {{characterList}}
      - シーン: {{sceneList}}
      - セリフ: {{dialogueList}}
      - ハイライト: {{highlightList}}
      - 状況: {{situationList}}

      `,

      // エピソードフラグメント単位でのスクリプト変換用プロンプト
      fragmentConversion: {
        systemPrompt: `以下の情報を基に、セリフ+ナレーション+心の声のセリフと、場面情報を表すト書きとして、台本形式のJSONにしてください。会話は全て漏らさず出力してください。もし、言語が現代日本語でなかった場合は、現代日本語口語訳で出力してください。
このテキストは大きなエピソードの一部（フラグメント）です。

出力するJSONの構造:
{
  "scenes": [
    {
      "id": "fragment_scene_1",
      "setting": "場所と時間（例：教室、午後）",
      "description": "シーンの説明",
      "script": [
        {
          "index": 1,
          "type": "narration",
          "text": "ナレーション内容"
        },
        {
          "index": 2,
          "type": "dialogue",
          "speaker": "キャラクター名",
          "text": "セリフ内容"
        },
        {
          "index": 3,
          "type": "thought",
          "speaker": "キャラクター名",
          "text": "心の声"
        },
        {
          "index": 4,
          "type": "stage",
          "text": "ト書き・動作説明"
        }
      ]
    }
  ]
}

注意事項：
- このフラグメントは完全ではない可能性があります
- 前後の文脈を考慮して、自然に繋がるようにしてください
- 文の途中で切れている場合は、適切に補完してください
- scene idには "fragment_scene_" プレフィックスを付けてください`,

        userPromptTemplate: `前のフラグメント内容（文脈参考用）:
{{previousFragment}}

現在のフラグメント内容:
{{fragmentText}}

次のフラグメント内容（文脈参考用）:
{{nextFragment}}

フラグメント番号: {{fragmentIndex}} / {{totalFragments}}

上記のフラグメントから台本形式のJSONを作成してください。`,
      },
    },
    pageBreakEstimation: {
      systemPrompt: `以下はマンガにするための脚本です。重要度や見所が強いシーンは1ページ1コマ、見所になるシーンは1ページ2～3コマ、状況説明が主となるシーンは1ページ4～6コマにして分割します。

CRITICAL: You must return a single JSON object with a "pages" property containing an array of pages. Do NOT return an array of objects. The response must start with { and end with }, not [ and ].

Output format: {"pages": [...]}, not [{"pages": [...]}]. JSONのみ。`,
      userPromptTemplate: `脚本JSON:
       {{scriptJson}}

       出力JSON形式の例:
{
  "pages": [
    {
      "pageNumber": 1,
      "panelCount": 1,
      "panels": [
        {
          "panelIndex": 1,
          "content": "Panel 1 の内容",
          "dialogue": [
            { "speaker": "話者1", "lines": "発言1" }
          ]
        }
      ]
    },
    {
      "pageNumber": 2,
      "panelCount": 2,
      "panels": [
        {
          "panelIndex": 1,
          "content": "Panel 2 内容",
          "dialogue": [
            { "speaker": "話者 2", "lines": "セリフ 2" }
          ]
        },
        {
          "panelIndex": 2,
          "content": "Panel 3 内容",
          "dialogue": [
            { "speaker": "話者 3", "lines": "セリフ 3" }
          ]
        }
      ]
    }
  ]
}

IMPORTANT: Return exactly one JSON object starting with { "pages": and ending with }. Do NOT wrap it in an array.

      `,
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
      rendersDir: 'renders',
      thumbnailsDir: 'thumbnails',
    },

    // R2設定（本番環境）
    r2: {
      novelsBucket: 'NOVEL_STORAGE',
      chunksBucket: 'CHUNKS_STORAGE',
      analysisBucket: 'ANALYSIS_STORAGE',
      layoutsBucket: 'LAYOUTS_STORAGE',
      jobsBucket: 'JOBS_STORAGE',
      rendersBucket: 'RENDERS_STORAGE',
      thumbnailsBucket: 'THUMBNAILS_STORAGE',
    },
  },

  // 画像・ページサイズ設定
  rendering: {
    // デフォルトページサイズ（A4縦）
    defaultPageSize: {
      width: 595, // A4縦の幅（px）
      height: 842, // A4縦の高さ（px）
    },
    // サポートされているページサイズプリセット
    pageSizePresets: {
      a4Portrait: { width: 595, height: 842 },
      a4Landscape: { width: 842, height: 595 },
      b4Portrait: { width: 728, height: 1031 },
      b4Landscape: { width: 1031, height: 728 },
    },
    // 縦書きテキスト（セリフ）画像化の設定
    verticalText: {
      enabled: true,
      defaults: {
        fontSize: 24,
        lineHeight: 1.6,
        letterSpacing: 0.0,
        padding: 12,
        maxCharsPerLine: 14,
      },
      maxConcurrent: 4,
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
      pageRender: {
        requests: 100,
        window: 60 * 1000,
      },
    },

    // タイムアウト設定
    timeout: {
      default: 30000, // デフォルトタイムアウト（ミリ秒）
      textAnalysis: 180000, // テキスト分析タイムアウト（gpt-5-nano-2025-08-07用に3分に増加）
      narrativeAnalysis: 90000, // 物語弧分析タイムアウト
      layoutGeneration: 45000, // レイアウト生成タイムアウト
      imageGeneration: 120000, // 画像生成タイムアウト
      pageRender: 60000, // ページレンダリングタイムアウト
    },

    // ポーリング設定（APIステータス監視など）
    polling: {
      jobStatus: {
        intervalMs: 5000, // ステータスチェック間隔（ミリ秒）
        maxAttempts: 120, // 最大ポーリング回数
      },
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
    maxConcurrentChunks: 3, // 同時処理可能なチャンク数 - 削減
    maxConcurrentJobs: 2, // 同時処理可能なジョブ数 - 削減

    // バッチ処理設定
    batchSize: {
      chunks: 6, // チャンク処理のバッチサイズ - 削減
      analysis: 3, // 分析処理のバッチサイズ - 削減
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
      targetCharsPerEpisode: 8000, // エピソードあたりの目標文字数 - 削減
      minCharsPerEpisode: 1, // 最小文字数 - 削減
      maxCharsPerEpisode: 12000, // 最大文字数 - 削減
      // ナラティブアーク分析用チャンク数設定
      maxChunksPerEpisode: 15, // エピソードあたりの最大チャンク数 - 削減
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
}

export type AppConfig = typeof appConfig

// 環境変数オーバーライド用の変更可能な型
type MutableAppConfig = {
  [K in keyof AppConfig]: AppConfig[K] extends Record<string, unknown>
    ? { [P in keyof AppConfig[K]]: AppConfig[K][P] }
    : AppConfig[K]
}

// 環境変数オーバーライド機能
export function getAppConfigWithOverrides(): AppConfig {
  // ディープコピーを作成して設定をオーバーライド
  const config = JSON.parse(JSON.stringify(appConfig)) as MutableAppConfig

  // 環境変数による設定オーバーライド
  // LLM のデフォルトプロバイダーやモデル設定は llm.config.ts で扱います

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
    const level = process.env.APP_LOG_LEVEL as 'info' | 'error' | 'warn' | 'debug'
    if (['info', 'error', 'warn', 'debug'].includes(level)) {
      config.logging.level = level
    }
  }

  if (process.env.NODE_ENV === 'development') {
    config.development.enableVerboseLogging = true
    config.development.enableErrorDetails = true
  }

  // Vertical text feature flags / overrides (no secrets here)
  if (process.env.APP_RENDER_VERTICAL_TEXT_ENABLED !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
    config.rendering.verticalText.enabled = process.env.APP_RENDER_VERTICAL_TEXT_ENABLED === 'true'
  }
  if (process.env.APP_RENDER_VERTICAL_TEXT_MAX_CONCURRENT) {
    const n = parseInt(process.env.APP_RENDER_VERTICAL_TEXT_MAX_CONCURRENT, 10)
    if (!Number.isNaN(n) && n > 0) {
      config.rendering.verticalText.maxConcurrent = n
    }
  }
  if (process.env.APP_RENDER_VERTICAL_TEXT_FONT_SIZE) {
    const v = parseInt(process.env.APP_RENDER_VERTICAL_TEXT_FONT_SIZE, 10)
    if (!Number.isNaN(v) && v > 0) {
      config.rendering.verticalText.defaults.fontSize = v
    }
  }
  if (process.env.APP_RENDER_VERTICAL_TEXT_MAX_CHARS_PER_LINE) {
    const v = parseInt(process.env.APP_RENDER_VERTICAL_TEXT_MAX_CHARS_PER_LINE, 10)
    if (!Number.isNaN(v) && v > 0) {
      config.rendering.verticalText.defaults.maxCharsPerLine = v
    }
  }

  return config
}
