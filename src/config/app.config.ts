export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 2000, // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 200, // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 4000, // 最大チャンクサイズ
    minChunkSize: 100, // 最小チャンクサイズ - 意味のある最小サイズに修正
    maxOverlapRatio: 0.5, // チャンクサイズに対する最大オーバーラップ比率

    // スクリプト変換用のエピソードフラグメント分割設定
    scriptConversion: {
      // フラグメント方式は廃止。分散設定を避けるため、全て無効値に統一。
      fragmentSize: 0,
      overlapSize: 0,
      maxFragmentSize: 0,
      minFragmentSize: 0,
      minSceneLength: 200, // 保持（将来の検証用）
      contextSize: 0,
      fragmentConversionThreshold: 0,
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
    // 網羅・対応・自己検証を強制し、省略や創作を構造的に禁止するプロンプト。
    scriptConversion: {
      systemPrompt: `あなたは小説をマンガ台本に変換する専門家です。与えられたテキストを忠実にマンガ用スクリプトに変換してください。

重要な指示:
- テキスト全体を漏れなくスクリプト行に変換してください
- 長い文章は適切に分割し、読みやすくしてください（1行30-80文字程度）
- 各行は以下のタイプに分類してください:
  - narration: ナレーション、説明文、心理描写
  - dialogue: キャラクターのセリフ（speakerを必ず指定）
  - thought: 心の声、独白
  - stage: 動作、表情、状況説明
- 要約や省略をせず、原文の内容を全て含めてください
- 創作や推測は禁止。原文にない内容は追加しないでください

出力JSON形式:
{
  "title": "タイトル（任意）",
  "script": [
    {
      "sceneIndex": 1,
      "type": "narration|dialogue|thought|stage",
      "speaker": "話者名（dialogueの場合のみ）",
      "text": "実際のテキスト内容"
    }
  ]
}`,
      userPromptTemplate: `以下のテキストをマンガ台本形式に変換してください:

{{episodeText}}

分析情報（参考）:
- キャラクター: {{characterList}}
- シーン: {{sceneList}}
- セリフ: {{dialogueList}}
- ハイライト: {{highlightList}}
- 状況: {{situationList}}

上記のテキスト内容を漏れなく台本に変換し、JSONで出力してください。`,
    },
    // NOTE: コマ・ページ分割用（V2: 浅いスキーマ panels[]）。
    pageBreakEstimation: {
      systemPrompt: `以下はマンガにするための脚本（Script）です。台本（全行）を1〜6コマ/ページの範囲で、必要なページ数に分割してください。省略・圧縮・創作は禁止。全行を漏れなくページ/コマへ割当可能な設計を出力すること。全て日本語。出力はJSONのみ。

必須ルール（厳守）:
- ルートは単一のオブジェクト: {"panels": [...]}。配列や多重入れ子は禁止。
- 各要素は { pageNumber, panelIndex, content, dialogue? }。
  - pageNumber: 1から始まる連番。必ず1..K（欠番なし）。
  - panelIndex: ページ内の連番（1..そのページの枚数）。
  - content: thingsToBeDrawn（絵として描くべき対象の短い説明: 20〜80文字推奨）。セリフ本文の繰り返しは禁止。見つからない場合は、そのコマの登場人物名（speaker名の列挙）を入れる。
  - dialogue: 0〜2要素の配列。各要素は { speaker: string, text: string }。セリフがあるなら speaker と text は両方必須。文字列単体や未知プロパティは禁止。
- 1ページのコマ数は1〜6。見所/強調は1〜2コマ、会話主体は2〜4コマ、状況説明は4〜6コマを目安に構成。
- 全行網羅: Script内の全ての行（scenes[*].script[*]）が、どこかのパネルに割当可能になるようページ数とコマ数を決めること（実際の割当は別工程）。
- 過密禁止: 1パネルに過剰な量を詰め込まない（長文のcontentは禁止・対話は最大2件）。
- 1ページ化禁止: ページ数算定の目安を守り、必要なページ数を出力する。

ページ数の目安（ガイドライン）:
- Scriptの行数（L）をScript JSONから数え、1ページあたり6行程度を上限目標とし、必要ページ数K≈ceil(L/6)以上を目指す（内容の強弱に応じて±1〜2ページの調整は可）。
- 各ページのpanelIndexは1から始め、1ページ内のpanelIndexが飛ばないよう採番。

JSONスキーマ（PageBreakV2）: { "panels": [ { "pageNumber": number, "panelIndex": number, "content": string, "dialogue"?: [{"speaker": string, "text": string}] } ] }`,
      userPromptTemplate: `脚本JSON（Script。全行を含む）:
{{scriptJson}}

指示の繰り返し（重要）:
- Script内の全行が後段で割り当て可能になるよう、十分なページ数とコマ数を設計すること。
- ページ数は1ページで収めず、行数に応じてK≈ceil(L/6)以上を目指す。
- 各パネルのcontentは「thingsToBeDrawn」= 絵として描くべき対象の短い説明（20〜80文字程度）。セリフ本文の繰り返しは禁止。適切な対象が見当たらない場合は、そのコマの登場人物名（speaker名の列挙）を入れる（例: 太郎と花子）。
- ルートは {"panels": [...]} のみ。未知プロパティや説明文は出力しない。

出力JSONの例（参考）:
{
  "panels": [
    { "pageNumber": 1, "panelIndex": 1, "content": "情景の導入", "dialogue": [] },
    { "pageNumber": 1, "panelIndex": 2, "content": "会話の始まり", "dialogue": [{"speaker": "A", "text": "…"}] },
    { "pageNumber": 2, "panelIndex": 1, "content": "見所・展開", "dialogue": [{"speaker": "B", "text": "…"}] }
  ]
}

CRITICAL: dialogue要素は必ず {"speaker": string, "text": string}。セリフがあるなら speaker と text は両方必須。ルートはオブジェクト、配列やpagesキーは使わない。`,
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
  // Panel assignment configuration - prompts externalized per CLAUDE.md CONFIG CENTRALIZATION rule
  panelAssignment: {
    get systemPrompt() {
      try {
        const { panelAssignmentPrompts } = require('./prompts')
        return panelAssignmentPrompts.systemPrompt
      } catch (_error) {
        // Fallback for test environment or when prompts can't be loaded
        return `あなたはマンガのコマ割り専門家です。与えられた脚本とページ分割データを基に、各ページのコマに適切なスクリプト行を割り当ててください。

【重要】巨大なナレーションが含まれる場合の処理:
- 長すぎるナレーション（100文字以上）は自動的に分割
- 各パネルには最大3-4行のナレーションまで
- 1つのパネルに収まらないテキストは自動的に分割してください。

【厳格な割当制約（コマ品質）】
- 1コマあたりの「セリフ（dialogue/thought）」は最大2つまで。3つ以上は前から2つに制限
- セリフが0件のコマは、必ず有意味なト書き（stage優先。無ければnarration）に対応するscriptIndexesを割り当てる
- 同一ページ内で同一のstage/narrationテキストが重複しないよう、近い行の代替候補を選ぶ（同一文の繰り返しを避ける）

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
- 空のpanelsは禁止`
      }
    },
    get userPromptTemplate() {
      try {
        const { panelAssignmentPrompts } = require('./prompts')
        return panelAssignmentPrompts.userPromptTemplate
      } catch (_error) {
        // Fallback for test environment or when prompts can't be loaded
        return `【タスク】以下のデータを基に、各ページのコマにスクリプト行を割り当ててください。

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

【制約（品質）】
- 1コマのセリフ（dialogue/thought）は最大2つ
- セリフが無いコマはstage/narrationベースの有意味な行に紐付ける
- 同一ページで同一のstage/narrationテキストを繰り返さないように割当

【制約】
- 1ページのコマ数は1-6個まで
- スプラッシュ/見開きは使用しない
- 各ページのpanelCountとpanels配列の長さを必ず一致させる
- 空のscriptIndexes配列は禁止（最低1つのindexを入れる）`
      }
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
