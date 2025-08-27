export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 5000, // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 300, // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 10000, // 最大チャンクサイズ
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
    // NOTE: 以下のsystemPrompt/userPromptTemplateは、チャンク分析のJSON出力仕様を満たすように調整してください。
    // - コメント: ここに「抽出フィールド（characters/scenes/dialogues/highlights/situations）と任意のpacing」を明記
    // - JSONのみ出力、説明禁止、日本語で統一、未知フィールド禁止などの制約を記述
    textAnalysis: {
      systemPrompt: `これは長文のテキスト一部分です。このテキストからマンガ制作に必要な以下の要素を抽出してください。

出力は必ず以下のJSON形式のみ:
{
  "characters": [{"name": "名前", "description": "説明", "firstAppearance": 0}],
  "scenes": [{"location": "場所", "time": "時間または「不明」またはnull", "description": "説明", "startIndex": 0, "endIndex": 0}],
  "dialogues": [{"speakerId": "話者ID", "text": "セリフ", "emotion": "感情", "index": 0}],
  "highlights": [{"type": "climax|turning_point|emotional_peak|action_sequence", "description": "説明", "importance": 1, "startIndex": 0, "endIndex": 0}],
  "situations": [{"description": "状況説明", "index": 0}],
  "pacing": "マンガとしてのペース"（pacingフィールドは任意）
}

注意事項:
- 時間や場所が不明確な場合は、timeフィールドにnullを設定するか「不明」と記載してください
- 必ずsituationsフィールドも含めてください
- 説明文は一切出力禁止。JSONのみ出力。
- 未知のプロパティ禁止
- すべて日本語で出力。日本語以外の文章が入力されていた場合は、現代日本語口語訳で出力
- 未知フィールドは禁止`,
      userPromptTemplate: `チャンク{{chunkIndex}}:

前: {{previousChunkText}}
対象: {{chunkText}}
次: {{nextChunkText}}

上記テキストから要素を抽出し、JSONのみ出力。前と次のチャンクは、あくまでも話を把握するために利用し、分析対象は対象のチャンクのみとすること`,
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
  ],
  "overallAnalysis": "全体分析の概要"
}

JSONのみ出力。`,
      userPromptTemplate: `文字数: {{totalChars}}
登場人物: {{characterList}}
ハイライト: {{highlightsInfo}}
テキスト: {{fullText}}

エピソード境界を特定し、JSONのみ出力。`,
    },
    // NOTE: チャンク台本化用。入力は「チャンク全文」。
    // - コメント: ここに「全セリフ漏れなく・長文は30字程度で分割・現代日本語口語・単一のJSONオブジェクト」を明記
    // - {{analysisHints}}プレースホルダを使用する場合はテンプレ内に追加
    scriptConversion: {
      systemPrompt: `以下の情報を基に、セリフ+ナレーション+心の声のセリフと、場面情報を表すト書きとして、台本形式のJSONにしてください。会話は全て漏らさず出力してください。また、セリフが長い場合は、30文字程度の長さで分割した状態で台本にしてください。もし、言語が現代日本語でなかった場合は、現代日本語口語訳で出力してください。要約禁止。物語の情景をできるだけ忠実に台本形式で再現してください。必ず物語を細かく分割し、長大なナレーションを避けてください。ナレーションは1つは80文字以下になるように分割してください。

CRITICAL: 必ず単一のJSONオブジェクトを返してください。配列ではありません。

正しい出力例:
{
  "title": "病室での会話",
  "scenes": [
    {
      "id": "1",
      "setting": "病室、午後",
      "description": "ジョンジーとスーの会話",
      "script": [
        {"index": 1, "type": "narration", "text": "スーが部屋に入る"},
        {"index": 2, "type": "dialogue", "speaker": "ジョンジー", "text": "最後の一枚が散るとき、わたしも一緒に行くのよ"},
        {"index": 3, "type": "dialogue", "speaker": "スー", "text": "そんな馬鹿な話は聞いたことがないわ"}
      ]
    },
    {
      "id": "2", 
      "setting": "同じ病室、少し後",
      "description": "続く会話",
      "script": [
        {"index": 1, "type": "dialogue", "speaker": "スー", "text": "あなたは元気になるのよ"},
        {"index": 2, "type": "stage", "text": "スーがジョンジーの手を握る"}
      ]
    }
  ]
}

絶対に避けるべき間違った形式:
❌ 配列形式: [{"title": "...", "scenes": [...]}, {"title": "...", "scenes": [...]}]
❌ 破綻した構造: {"scenes": [{"id": "1", ...}, "id", ":", "2", "setting", ":", "..."]}

重要な指示:
- 必ず単一のオブジェクト { } を返してください。配列 [ ] は絶対禁止です。
- 複数シーンは scenes 配列内に複数のオブジェクトとして配置
- 必ずscript配列に台本要素を含めてください（空配列は禁止）
- オブジェクトのプロパティを文字列として分離しないでください
- JSONのみ出力、説明文禁止`,
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
        systemPrompt: `以下の情報を基に、セリフ+ナレーション+心の声のセリフと、場面情報を表すト書きとして、台本形式のJSONにしてください。会話は全て漏らさず出力してください。また、セリフが長い場合は、30文字程度の長さで分割した状態で台本にしてください。もし、言語が現代日本語でなかった場合は、現代日本語口語訳で出力してください。
このテキストは大きなエピソードの一部（フラグメント）です。

出力するJSONの構造:
{
  "scenes": [
    {
      "id": 1,
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
- scene idは整数で出力してください
- script配列は必ず内容を含めてください（空配列は禁止）`,

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
    // NOTE: コマ・ページ分割用。
    // - コメント: ここに「1ページのコマ数は1..6のみ・スプラッシュ/見開き不可・JSONのみ」を明記
    pageBreakEstimation: {
      systemPrompt: `以下はマンガにするための脚本です。重要度や見所が強いシーンは1ページ1コマ、見所になるシーンは1ページ2～3コマ、状況説明が主となるシーンは1ページ4～6コマにして分割します。要約・省略は禁止であり、台本にある全要素を必ず全て盛り込んでください。全て日本語で書いてください。1つのコマに入るセリフの数は0～2個です。情景だけでセリフがないコマもありえます。1ページのコマ数は1～6、スプラッシュ、見開きは無しです。出力はJSONのみです。JSONの外側に説明は不要です。

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
            { "speaker": "話者1", "text": "発言1" }
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
            { "speaker": "話者 2", "text": "セリフ 2" }
          ]
        },
        {
          "panelIndex": 2,
          "content": "Panel 3 内容",
          "dialogue": [
            { "speaker": "話者 3", "text": "セリフ 3" }
          ]
        }
      ]
    }
  ]
}

CRITICAL: dialogue配列内の各要素は、必ず{"speaker": "話者名", "text": "セリフ内容"}の形式のオブジェクトでなければなりません。文字列単体ではいけません。

IMPORTANT: Return exactly one JSON object starting with { "pages": and ending with }. Do NOT wrap it in an array.

      `,
    },
    // NOTE: 連載マンガのエピソード束ね判定用（新規）。
    // - コメント: ここに「20–50ページに収まるよう切れ目候補を返す・JSON {breakAfterPageIndices[], rationale[]}のみ」を明記
    // - 入力には totalPages と pagesSummary（各ページの要約/強度/speech数等）を与える
    episodeBundling: {
      systemPrompt: `与えられたJSONは、ページ毎にどんな風にコマを割り、どんなセリフを入れるかを指定している設計書です。長編であるため、全体の一部分である可能性があります。pageIndexを参考にしてください。このJSONを読み、連載マンガのエピソードとして適切なところで分割をしてください。1エピソードは20～50ページ程度です。1エピソードにはかなら山場を入れ、かつ、引きをつけるところで分割してください。エピソード毎に、{["episodeNumber": 1, "title": "エピソード1のタイトル", "summary": "エピソード1の要約", "startPageIndex": 1, "endPageIndex": 5]}の形式でJSONを出力してください。`, // ここにエピソード束ねの方針・制約（20–50p、物語的切れ目、JSONのみ）を記述
      userPromptTemplate: `分割対象となるJSONは以下です。
      {{pageBreakEstimatJson}}
      
      トータルページ数、各ページの要素、強度、セリフ数は、与えられたJSONをよく確認してください`,
    },
  },
  // src/config/app.config.ts に追加
  panelAssignment: {
    systemPrompt: `あなたはマンガのコマ割り専門家です。与えられた脚本とページ分割データを基に、各ページのコマに適切なスクリプト行を割り当ててください。

【重要】巨大なナレーションが含まれる場合の処理:
- 長すぎるナレーション（100文字以上）は自動的に分割
- 各パネルには最大3-4行のナレーションまで
- 1つのパネルに収まらないテキストは自動的に分割してください。

出力は必ず以下のJSON形式のみ:
{
  "pages": [
    {
      "pageNumber": 1,
      "panelCount": 3,
      "panels": [
        { "id": 1, "scriptIndexes": [1, 2] },
        { "id": 2, "scriptIndexes": [3] },
        { "id": 3, "scriptIndexes": [4, 5, 6] }
      ]
    }
  ]
}

注意事項:
- 各ページのpanelCountとpanels配列の長さが一致させる
- scriptIndexes配列には、スクリプトの実際の行インデックスを入れる
- 空のpanelsは禁止`,

    userPromptTemplate: `【タスク】以下のデータを基に、各ページのコマにスクリプト行を割り当ててください。

【入力データ1: 脚本JSON】
{{scriptJson}}

【入力データ2: ページ分割データ】
{{pageBreaksJson}}

【重要指示】
1. scriptJsonの各scene.script配列のindexフィールドを参照
2. 各ページのpanels[].scriptIndexes配列には、対応するscriptのindex番号を入れる
3. 例: scriptのindex: 1, 2, 3がある場合、scriptIndexes: [1, 2] や scriptIndexes: [3] のように対応付ける
4. ページ数はpageBreaksJsonのpages配列の長さに合わせる（通常10ページ以上）
5. 巨大ナレーションは必ず分割: 100文字以上のナレーションは複数のpanelsに分散

【具体例】
scriptJsonに以下のデータがある場合:
{
  "scenes": [{
    "script": [
      {"index": 1, "text": "こんにちは"},
      {"index": 2, "text": "今日は良い天気ですね"},
      {"index": 3, "text": "そうですね"}
    ]
  }]
}

正しい出力例:
{
  "pages": [
    {
      "pageNumber": 1,
      "panelCount": 2,
      "panels": [
        {"id": 1, "scriptIndexes": [1]},
        {"id": 2, "scriptIndexes": [2, 3]}
      ]
    }
  ]
}

【制約】
- 1ページのコマ数は1-6個まで
- スプラッシュ/見開きは使用しない
- 各ページのpanelCountとpanels配列の長さを必ず一致させる
- 空のscriptIndexes配列は禁止（最低1つのindexを入れる）`,
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
