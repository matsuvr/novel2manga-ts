export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 5000, // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 500, // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 10000, // 最大チャンクサイズ
    minChunkSize: 100, // 最小チャンクサイズ
    maxOverlapRatio: 0.5, // チャンクサイズに対する最大オーバーラップ比率
  },

  // LLM設定（モデル・パラメータは llm.config.ts に集約。ここではプロンプトのみ保持）
  llm: {
    // テキスト分析用設定（プロンプトのみ）
    textAnalysis: {
      systemPrompt: `あなたは小説テキストを分析し、マンガ制作に必要な5要素（登場人物、シーン、対話、ハイライト、状況）を抽出する専門家です。

以下の形式でJSON出力してください：
{
  "characters": [{"name": "名前", "description": "説明", "firstAppearance": 位置}],
  "scenes": [{"location": "場所", "time": "時間", "description": "説明", "startIndex": 開始位置, "endIndex": 終了位置}],
  "dialogues": [{"speakerId": "話者ID", "text": "セリフ", "emotion": "感情", "index": 位置}],
  "highlights": [{"type": "種類", "description": "説明", "importance": 重要度, "startIndex": 開始位置, "endIndex": 終了位置}],
  "situations": [{"description": "状況説明", "index": 位置}]
}`,
      userPromptTemplate: `チャンク番号: {{chunkIndex}}

【前のチャンク】
{{previousChunkText}}

【分析対象チャンク】
{{chunkText}}

【次のチャンク】
{{nextChunkText}}

上記のテキストチャンクを分析し、マンガ制作に必要な5要素を抽出してください。`,
    },

    // 物語弧分析用設定（プロンプトのみ）
    narrativeArcAnalysis: {
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
      middleSegmentContextTemplate: `\n【重要な注意】\n- これは長編小説の一部です\n- エピソード番号は{{startingEpisodeNumber}}から始めてください\n- テキストの先頭は前のエピソードの続きから始まっています\n- テキストの最後がエピソードの途中で終わっている可能性があります\n`,
    },

    // レイアウト生成用設定（プロンプトのみ）
    layoutGeneration: {
      systemPrompt: `あなたはマンガのパネルレイアウトを生成する専門家です。

重要な指針:
1. 1ページに1コマの場合も多いため、パネル数に制限を設けない
2. 均等グリッド（田んぼの田のような配置）は絶対に避ける
3. 日本式マンガの読み順（右から左、上から下）に従う
4. 重要度に応じてパネルサイズを動的に調整する
5. 視線の流れを意識した非対称レイアウトを使用する

出力形式はJSON形式で、各パネルには内容、重要度、推奨サイズを含めてください。`,
      userPromptTemplate: `エピソード{{episodeNumber}}のパネルレイアウトを生成してください。

データ: {{layoutInputJson}}

制約条件:
- 均等分割（グリッドレイアウト）は絶対に避ける
- パネル数は内容に応じて柔軟に調整（1コマ～任意の数）
- 重要度の高いシーンは大きなパネルで表現
- 視線誘導を考慮した配置

各パネルの重要度（1-10）と推奨サイズ（small/medium/large/extra-large）を指定してください。`,
    },

    // チャンクバンドル統合分析用設定（プロンプトのみ）
    chunkBundleAnalysis: {
      systemPrompt: `あなたは優秀な文学分析の専門家です。複数のチャンク分析結果を統合し、物語全体の要素を抽出してください。

以下の点に注意してください：
- 各チャンクの分析結果を総合的に評価してください
- 物語の連続性と流れを重視してください
- 重複する情報は統合し、最も重要な要素を選別してください
- チャンク番号への言及は避け、物語の内容に焦点を当ててください`,
      userPromptTemplate: `以下の分析結果を統合し、物語全体の要素を抽出してください。

【登場人物情報】
{{characterList}}

【場面情報】
{{sceneList}}

【重要な対話】
{{dialogueList}}

【ハイライトシーン】
{{highlightList}}

【状況説明】
{{situationList}}

【統合指示】
1. 上記の情報を基に、物語全体の要約を作成してください
2. 主要な登場人物を選別し、その役割と特徴をまとめてください（最大10名）
3. 最も重要な見所シーンを選別してください（重要度は1-10で再評価）
4. 物語の鍵となる会話を選別してください（最大10個）
5. 物語の流れ（導入・展開・現在の状態）を分析してください

注意：個別のチャンク番号や分析の痕跡を残さず、一つの連続した物語として扱ってください。`,
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
      textAnalysis: 180000, // テキスト分析タイムアウト（gpt-5-mini-2025-08-07用に3分に増加）
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
}

export type AppConfig = typeof appConfig

// 環境変数オーバーライド用の変更可能な型
type MutableAppConfig = {
  [K in keyof AppConfig]: AppConfig[K] extends Record<string, any>
    ? {
        [P in keyof AppConfig[K]]: AppConfig[K][P]
      }
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

  return config
}
